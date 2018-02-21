'use strict';

(function() {
  let peerIdInput = document.getElementById('peer_id');
  let startButton = document.getElementById('start_button');
  let responseDisplayElement = document.getElementById('response_display');
  let sendInput = document.getElementById('send_input');

  let peerConnection;
  let peer = new Peer({key: 'peerjs', host: 'peerserver.ressonancia.tech', port: 9000});

  peer.on('open', (id) => {
    startButton.removeAttribute('disabled');
  });

  startButton.addEventListener('click', function() {
    peerConnection = peer.connect(peerIdInput.value);

    // workaround for no close event on firefox
    let interval;
    interval = setInterval(() => {
      if (!peerConnection.open) {
        clearInterval(interval);
        peerIdInput.removeAttribute('readonly');
        startButton.removeAttribute('disabled');
        sendInput.setAttribute('readonly', true);
        alertify.error('Connection closed');
      }
    }, 1000);

    peerIdInput.setAttribute('readonly', true);
    startButton.setAttribute('disabled', true);
    sendInput.removeAttribute('readonly');
    sendInput.focus();

    responseDisplayElement.innerHTML = '';

    peerConnection.on('data', (data) => {
      let text = (new TextDecoder()).decode(data);
      responseDisplayElement.insertAdjacentText('beforeend', text);
      responseDisplayElement.parentElement.scrollTop = 0xFFFFFF;
    });

    alertify.success('Connection started');
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