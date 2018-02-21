'use strict';

(function() {
  let peer = new Peer('testecho', {key: 'peerjs', host: 'peerserver.ressonancia.tech', port: 9000});
  let peerConnection;
  let wsp;

  function setupWSProxy(protocol, port) {
    let wsp = new WSProxy(protocol, port);
    let firstData = true;
    let interval;
    let wsBuffer;

    wsp.addListener('running', () => {
      alertify.success('WSProxy started');

      wsBuffer = new Array();

      wsp.getSocket().onmessage = (ev) => {
        if (firstData) {
          wsBuffer.push(ev.data);
          firstData = false;

          // setup an initial buffer to fill while the WebRTC data channel is not established
          interval = setInterval(() => {
            if (!peerConnection || !peerConnection.open) {
              return;
            }

            if (!wsBuffer.length) {
              clearInterval(interval);
              return;
            }

            for (let i = 0; i < wsBuffer.length; i++) {
              peerConnection.send(wsBuffer.shift());
            }
          }, 1)

          return;
        }

        if (wsBuffer.length) {
          wsBuffer.push(ev.data);
          return;
        }

        peerConnection.send(ev.data);
      }
    });

    wsp.addListener('stopped', () => {
      alertify.message('WSProxy stopped');

      function done() {
        if (peerConnection) {
          peerConnection.peerConnection.close();
        }

        clearInterval(interval);

        alertify.message('All done, closing WebRTC connection');
      }

      if (wsBuffer.length) {
        alertify.message('Flushing WSProxy buffer before closing WebRTC connection');

        let myInterval = setInterval(() => {
          if (wsBuffer.length) {
            return;
          }

          clearInterval(myInterval);
          done();
        }, 1);

        return;
      }

      done();
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

      wsp = setupWSProxy(
        document.getElementById('connection_input').value,
        document.getElementById('port_input').value
      );

      wsp.start();

      peerConnection.on('data', (data) => {
        let text = (new TextDecoder()).decode(data);
        wsp.getSocket().send(new Blob([text]));
      });

      peerConnection.on('close', () => {
        alertify.error('WebRTC connection closed');
        wsp.stop();
      })
    });
  });
})();
