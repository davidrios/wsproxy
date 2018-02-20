import asyncio
import logging
import ssl

import aiojobs
from aiohttp import web, WSMsgType, WSCloseCode

log = logging.getLogger(__name__)


class InvalidPortError(Exception):
    pass


class Proxy(object):
    def __init__(self, ws, protocol, port, loop):
        if protocol != 'TCP':
            raise NotImplementedError

        self._ws = ws
        self._protocol = protocol
        self._port = port
        self._loop = loop
        self._left_queue = asyncio.Queue(4096)
        self._right_queue = asyncio.Queue(4096)
        self._started = False

    async def start(self):
        if self._started:
            raise Exception('already started')

        reader, writer = await asyncio.open_connection('localhost', self._port, loop=self._loop)
        self._right_reader = reader
        self._right_writer = writer
        self._scheduler = await aiojobs.create_scheduler()

        await self._scheduler.spawn(self._left_writer_worker())
        await self._scheduler.spawn(self._right_reader_worker())
        await self._scheduler.spawn(self._right_writer_worker())

        self._started = True

    async def feed_left(self, data):
        if not self._started:
            raise Exception('not started yet')

        await self._left_queue.put(data)

        if not data:
            await self.shutdown()
            return

    async def shutdown(self):
        if not self._started:
            return

        self._right_writer.transport.abort()
        await self._ws.close()
        await self._scheduler.close()

    async def _left_writer_worker(self):
        try:
            while True:
                data = await self._right_queue.get()
                if not data:
                    await self.shutdown()
                    return

                await self._ws.send_bytes(data)
        except asyncio.CancelledError:
            return
        except Exception:
            await self.shutdown()
            log.exception('left writer error')
            return

    async def _right_reader_worker(self):
        try:
            while True:
                data = await self._right_reader.read(4096)

                await self._right_queue.put(data)

                if not data:
                    await self.shutdown()
                    return
        except asyncio.CancelledError:
            return
        except Exception:
            await self.shutdown()
            log.exception('right reader error')
            return

    async def _right_writer_worker(self):
        try:
            while True:
                data = await self._left_queue.get()
                if not data:
                    await self.shutdown()
                    return

                self._right_writer.write(data)
                await self._right_writer.drain()
        except asyncio.CancelledError:
            return
        except Exception:
            await self.shutdown()
            log.exception('right writer error')
            return


class WSHandler(object):
    @staticmethod
    def parse_port(port):
        protocol, port = port.split(':', 1)
        port = int(port)
        if protocol not in {'TCP', 'UDP'}:
            raise InvalidPortError('Invalid protocol "{}".'.format(protocol))

        return protocol, port

    def __init__(self, forward_ports, loop):
        self._forward_ports = {WSHandler.parse_port(i) for i in forward_ports}
        self._loop = loop

        self._ws_connections = []
        self._proxies = []

    async def handle_request(self, request):
        ws = web.WebSocketResponse()
        await ws.prepare(request)

        self._ws_connections.append(ws)

        log.debug('websocket connection established')

        proxy = None

        try:
            first_message = await ws.receive_str()

            try:
                used_port = WSHandler.parse_port(first_message)
            except InvalidPortError:
                await ws.send_str('INVALID_PORT')
                await ws.close()
                return ws

            if used_port not in self._forward_ports:
                await ws.send_str('INVALID_PORT')
                await ws.close()
                return ws

            log.debug('Received request to forward {}'.format(used_port))

            proxy = Proxy(ws, used_port[0], used_port[1], self._loop)
            try:
                await proxy.start()
            except Exception:
                log.exception('error starting proxy:')
                await ws.send_str('SERVICE_UNAVAILABLE')
                await ws.close()
                return ws

            await ws.send_str('SUCCESS')

            async for msg in ws:
                if msg.type == WSMsgType.BINARY:
                    await proxy.feed_left(msg.data)
                elif msg.type == WSMsgType.ERROR:
                    log.warn('websocket connection closed with exception %s', ws.exception())
                else:
                    await ws.close()
                    return ws
        finally:
            if proxy is not None:
                await proxy.shutdown()

            self._ws_connections.remove(ws)

        log.debug('websocket connection closed')

        return ws

    async def on_shutdown(self):
        for ws in self._ws_connections:
            await ws.close(code=WSCloseCode.GOING_AWAY, message='Server shutdown')


async def init(bind, port, forward_ports, loop, ssl_context):
    wshandler = WSHandler(forward_ports, loop)

    app = web.Application(loop=loop)
    app.router.add_route('GET', '/', wshandler.handle_request)

    app.on_shutdown.append(wshandler.on_shutdown)

    handler = app.make_handler()
    kwargs = {'ssl': ssl_context} if ssl_context is not None else {}
    server = await loop.create_server(handler, bind, port, **kwargs)
    log.info('Server started at {}:{}'.format(bind, port))
    return server, handler


def main():
    import argparse
    import signal
    import sys

    parser = argparse.ArgumentParser()
    parser.add_argument('--ssl-cert-file')
    parser.add_argument('--ssl-key-file')
    parser.add_argument('-b', '--bind', default='127.0.0.1', help='Interface to listen to web connections.')
    parser.add_argument('-p', '--port', default=8080, type=int, help='Port to listen to web connections.')
    parser.add_argument('-v', action='count', help='Verbose logging.')
    parser.add_argument('forward_port', nargs='+', help='Ports to forward with the format PROTOCOL:PORT. Example: TCP:22')

    args = parser.parse_args()

    logging_level = {
        None: logging.ERROR,
        1: logging.WARNING,
        2: logging.INFO,
        3: logging.DEBUG,
    }.get(args.v, logging.DEBUG)

    logging.basicConfig(level=logging_level,
                        format='%(asctime)s.%(msecs)03d:%(name)s:%(levelname)s:%(message)s',
                        datefmt='%Y%m%d_%H%M%S')

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    ssl_context = None
    if args.ssl_cert_file or args.ssl_key_file:
        if not (args.ssl_cert_file and args.ssl_key_file):
            sys.exit('If using SSL you must provide both certificate and key files.')

        ssl_context = ssl.SSLContext()
        ssl_context.load_cert_chain(args.ssl_cert_file, args.ssl_key_file)

    server, handler = loop.run_until_complete(init(args.bind, args.port, args.forward_port, loop, ssl_context))

    def shutdown():
        logging.info('Stopping server...')

        for task in asyncio.Task.all_tasks(loop):
            task.cancel()

        loop.stop()

    loop.add_signal_handler(signal.SIGINT, shutdown)
    loop.add_signal_handler(signal.SIGHUP, shutdown)
    loop.add_signal_handler(signal.SIGTERM, shutdown)

    loop.run_forever()

    server.close()
    tasks = [server.wait_closed(), handler.shutdown()]
    loop.run_until_complete(asyncio.wait(tasks, loop=loop))
    loop.close()


if __name__ == '__main__':
    main()
