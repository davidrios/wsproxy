import asyncio
import functools
import sys
from asyncio.streams import StreamWriter, FlowControlMixin


async def stdio(loop):
    reader = asyncio.StreamReader()
    reader_protocol = asyncio.StreamReaderProtocol(reader)
    await loop.connect_read_pipe(lambda: reader_protocol, sys.stdin)

    writer_transport, writer_protocol = await loop.connect_write_pipe(FlowControlMixin, sys.stdout)
    writer = StreamWriter(writer_transport, writer_protocol, None, loop)

    return reader, writer


async def handle_client(host, port, loop, client_reader, client_writer):
    cpeer = client_reader._transport._sock.getpeername()
    print('connected from: ', cpeer)

    try:
        server_reader, server_writer = await asyncio.open_connection(host, port, loop=loop)
    except Exception:
        print('cant connect to server')
        client_writer.write_eof()
        print('disconnect: ', cpeer)
        return

    speer = server_reader._transport._sock.getpeername()
    print('connected to: ', speer)

    in_q = asyncio.Queue(4096)
    out_q = asyncio.Queue(4096)

    def shutdown():
        client_writer.transport.abort()
        server_writer.transport.abort()

    async def reader_coro():
        while True:
            try:
                data = await client_reader.read(4096)
            except:
                shutdown()
                return

            await in_q.put(data)

            if not data:
                shutdown()
                return

    async def writer_coro():
        while True:
            data = await out_q.get()
            if not data:
                shutdown()
                return

            client_writer.write(data)
            try:
                await client_writer.drain()
            except:
                shutdown()
                return

    async def server_reader_coro():
        while True:
            try:
                data = await server_reader.read(4096)
            except:
                shutdown()
                return

            await out_q.put(data)

            if not data:
                shutdown()
                return

    async def server_writer_coro():
        while True:
            data = await in_q.get()
            if not data:
                shutdown()
                return

            server_writer.write(data)
            try:
                await server_writer.drain()
            except:
                shutdown()
                return

    await asyncio.wait([reader_coro(), writer_coro(), server_reader_coro(), server_writer_coro()], loop=loop)

    print('done')


async def init(listen, host, port, loop):
    await asyncio.start_server(functools.partial(handle_client, host, port, loop), host='127.0.0.1', port=listen, loop=loop)


def main():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(init(sys.argv[1], sys.argv[2], sys.argv[3], loop))
    loop.run_forever()


if __name__ == '__main__':
    main()
