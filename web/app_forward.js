'use strict';

(function() {
  let peer = new Peer('testecho', {key: 'peerjs', host: 'peerserver.ressonancia.tech', port: 9000});
  let peerConnection;
  let wsp;

  let wsBuffer;
  let rtcBuffer;

  function flushWSBuffer() {
    if (!peerConnection || !peerConnection.open || !wsBuffer.length) {
      return;
    }

    peerConnection.send(wsBuffer.shift());
  }

  function flushRTCBuffer() {
    if (!wsp || wsp.state !== 'running' || !rtcBuffer.length) {
      return;
    }

    wsp.getSocket().send(rtcBuffer.shift());
  }

  function setupFlusher(func) {
    let interval = setInterval(func, 1);
    return () => { clearInterval(interval) };
  }

  function setupWSProxy(protocol, port) {
    let wsp = new WSProxy(protocol, port);
    let flushStopper;

    wsp.addListener('running', () => {
      alertify.success('WSProxy started');
      wsBuffer = new Array();

      wsp.getSocket().onmessage = (ev) => {
        wsBuffer.push(ev.data);
      }

      flushStopper = setupFlusher(flushWSBuffer);
    });

    wsp.addListener('stopped', () => {
      if (peerConnection) {
        peerConnection.peerConnection.close();
      }

      if (flushStopper) {
        flushStopper();
      }

      alertify.message('WSProxy stopped');
    });

    wsp.addListener('error', (error) => {
      switch (error) {
        case 'invalid_connection':
          alertify.error('Invalid connection string.');
          break;

        case 'websocket_closed':
          alertify.error('WebSocket connection closed.');
          break;

        case 'invalid_port':
          alertify.error('Server said the specified PROTOCOL:PORT is invalid.');
          break;

        case 'service_unavailable':
          alertify.error('Server said the specified PROTOCOL:PORT is unavailable.');
          break;

        case 'unexpected_message':
          alertify.error('Server sent an unexpected message.');
          break;

        default:
          alertify.error('An unspecified error ocurred.');
          break;
      }
    });

    return wsp;
  }

  document.getElementById('test_button').addEventListener('click', (ev) => {
    let localwsp = setupWSProxy(
      document.getElementById('connection_input').value,
      document.getElementById('port_input').value
    );

    localwsp.addListener('running', () => {
      alertify.success('Test successful.');
      localwsp.stop();
    });

    localwsp.start();
  });

  peer.on('open', (id) => {
    document.getElementById('peerjs_id').innerHTML = 'PeerJS ID: ' + id;

    peer.on('connection', (conn) => {
      let flushStopper;

      if (peerConnection && peerConnection.open) {
        conn.peerConnection.close();
        alertify.error('Only one WebRTC connection is allowed');
        return;
      }

      if (wsp && wsp.state !== 'stopped') {
        conn.peerConnection.close();
        alertify.error('Only one WSProxy connection is allowed');
        return;
      }

      peerConnection = conn;
      // rtcBuffer = new Array();

      wsp = setupWSProxy(
        document.getElementById('connection_input').value,
        document.getElementById('port_input').value
      );

      wsp.start();

      peerConnection.on('data', (data) => {
        let text = (new TextDecoder()).decode(data);
        wsp.getSocket().send(new Blob([text]));
      });

      // flushStopper = setupFlusher(flushRTCBuffer);

      // workaround for no close event on firefox
      let interval;
      interval = setInterval(() => {
        if (!peerConnection.open) {
          // flushStopper();
          wsp.stop();
          clearInterval(interval);
        }
      }, 1000);
    });
  });
})();
