# WebSockets and WebRTC proxy

This is a toy project to learn Python asyncio, WebSockets and WebRTC.

I made it in a hurry, so the code is ugly, never mind that.

It consists of one Python server app and 3 demo web apps.

This project requires Python >= 3.5 for the server. The demo web apps use some ES6
features and don't use any transpilation, but if your browser supports WebRTC it
is probably capable on handling it.


## Setup the Python server

- Create a selfsigned certificate, all connections are made with SSL/TLS:

        $ openssl req -x509 -newkey rsa:4096 -keyout ssl-key.pem -out ssl-cert.pem -days 365

- Create a virtualenv and activate it
- Install python dependencies by:

        $ pip install -r requirements.txt

- Check the app.py help for available options:

        $ python app.py --help


For example, run a simple local echo server with ncat on port 20010:

    $ ncat -l 20010 --keep-open --exec "/bin/cat"

Now run the app.py server on port 20009 and specify the port of the echo server as available for proxying:

    $ python app.py --ssl-cert-file ssl-cert.pem --ssl-key-file ssl-key.pem -b 127.0.0.1 -p 20009 -vvv TCP:20010

Because we are using a secure connection with a self-signed certificate, before you
can connect to the WebSocket you need to access the app.py server address directly on your browser,
to add an exception for the certificate. In this example, access <https://localhost:20009>
and add the exception.

Now you should be ready to test the web apps.


## Web apps

The web apps code is in the folder `web`, you will need to serve this folder through any
static web server. I already hosted the latest version at <https://wsproxy.surge.sh> if you
don't want to deal with that.

The home page will show a list of available demos. There are three at the moment:


### 1. Interact

Use this app to send and receive data directly to/from the app.py server. It is useful to
test if the server is working.

Navigate to <https://wsproxy.surge.sh/app_interact.html> (or your locally hosted version).

For this example, fill the first input with `wss://localhost:20009`, the second
with `TCP:20010` and click `Start`. You should see alerts saying if the connection
was successful or not, and if it was, the input to send text will be available for
typing. Type some text and press `Enter` to send the text along with a line break
or `Shift+Enter` to send without, and you should see the server response.


### 2. WebRTC Forwarder

This demo will accept a WebRTC connection and proxy it through the specified app.py
server address.

This demo uses [PeerJS](http://peerjs.com/) for signaling, and so
you need a [PeerJS Server](https://github.com/peers/peerjs-server) to connect to.
The public server provided by the PeerJS folks doesn't support SSL/TLS, but luckly
for you I'm running a public server that does, and it is already configured in the
web apps served at <https://wsproxy.surge.sh>. If you want to run your own peer
server, just edit `web/app_forward.js` to point to the new address.

Now navigate to <https://wsproxy.surge.sh/app_forward.html> (or your locally hosted version).

In a few seconds you should see your PeerJS ID on the screen, and if it doesn't,
check the console for errors, because the demo won't work otherwise. Fill the inputs
with the app.py server details, in this example being `wss://localhost:20009` and `TCP:20010`.
Click `Test` to make suke the WebSocket connection is available, it will open a
connection to test and close it after.

Now your browser will be waiting for a remote WebRTC connection. Use the next demo
app to test it.

If the app stops working, simply refresh the page. Note that by doing that your
peer id will change.


### 2. WebRTC Forwarder Interact

This demo is similar to the `Interact` one, but connects to a WebRTC peer instead
of directly to a WebSocket.

Navigate to <https://wsproxy.surge.sh/app_interact_forward.html> (or your locally hosted version).

It should take a few seconds to connect to the peer server, and you will be notified
if successful. Fill in the peer id you got from the `WebRTC Forwarder` app, and click
`Start`. From then on you use it like the `Interact` app.