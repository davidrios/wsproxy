import asyncio
import functools
import sys


async def handle_client2(loop, client_reader, client_writer):
    queue = asyncio.Queue(4096)

    peer = client_reader._transport._sock.getpeername()

    print('connected from: ', peer)

    async def reader_coro():
        while True:
            try:
                data = await client_reader.read(4096)
            except ConnectionResetError:
                return
            # print('read: ', data)
            await queue.put(data)

            if not data:
                return

    async def writer_coro():
        while True:
            data = await queue.get()
            if not data:
                return

            # print('got from queue: ', data)
            client_writer.write(data)
            try:
                await client_writer.drain()
            except ConnectionResetError:
                return

    await asyncio.wait([reader_coro(), writer_coro()], loop=loop)
    # client_writer.transport.abort()

    print('disconnected from: ', peer)


async def init(listen, loop):
    await asyncio.start_server(functools.partial(handle_client2, loop), host='127.0.0.1', port=listen, loop=loop)


def main():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(init(sys.argv[1], loop))
    loop.run_forever()


if __name__ == '__main__':
    main()
