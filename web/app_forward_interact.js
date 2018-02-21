'use strict';

(function() {
  let peerIdInput = document.getElementById('peer_id');
  let startButton = document.getElementById('start_button');
  let responseDisplayElement = document.getElementById('response_display');
  let sendInput = document.getElementById('send_input');

  let peerConnection;
  let peer = new Peer({key: 'peerjs', host: 'peerserver.ressonancia.tech', port: 9000});

  alertify.message('Connecting to peer server');

  peer.on('open', (id) => {
    startButton.removeAttribute('disabled');
    alertify.success('Connected');
  });

  startButton.addEventListener('click', function() {
    alertify.message('Connecting to WebRTC peer');
    peerConnection = peer.connect(peerIdInput.value);

    peerIdInput.setAttribute('readonly', true);
    startButton.setAttribute('disabled', true);

    peerConnection.on('open', () => {
      sendInput.removeAttribute('readonly');
      sendInput.focus();
      alertify.success('Connected')
    });

    responseDisplayElement.innerHTML = '';

    peerConnection.on('data', (data) => {
      let text = (new TextDecoder()).decode(data);
      responseDisplayElement.insertAdjacentText('beforeend', text);
      responseDisplayElement.parentElement.scrollTop = 0xFFFFFF;
    });

    peerConnection.on('close', () => {
      peerIdInput.removeAttribute('readonly');
      startButton.removeAttribute('disabled');
      sendInput.setAttribute('readonly', true);
      alertify.error('Connection closed');
    });
  });

  sendInput.addEventListener('keypress', (ev) => {
    if (ev.key !== 'Enter' || ev.target.hasAttribute('readonly')) {
      return;
    }

    let text = sendInput.value;
    if (!ev.shiftKey) {
      text += '\n';
    }

    peerConnection.send(new Blob([text]));

    sendInput.value = '';
  })
})();
