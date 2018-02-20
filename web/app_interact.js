'use strict';

(function() {
  let responseDisplayElement = document.getElementById('response_display');
  let sendInput = document.getElementById('send_input');

  let wspc = new WSProxyComponent(
    document.getElementById('connection_input'),
    document.getElementById('port_input'),
    document.getElementById('action_button')
  );

  wspc.addListener('running', (ev) => {
    sendInput.removeAttribute('readonly');
    sendInput.focus();

    responseDisplayElement.innerHTML = '';

    wspc.getSocket().onmessage = (ev) => {
      let fr = new FileReader();
      fr.onload = (ev) => {
        responseDisplayElement.insertAdjacentText('beforeend', ev.target.result);
        responseDisplayElement.parentElement.scrollTop = 0xFFFFFF;
      }
      fr.readAsText(ev.data);
    }
  });

  wspc.addListener('stop', (ev) => {
    sendInput.setAttribute('readonly', true);
  });

  wspc.addListener('stopped', (ev) => {
    sendInput.setAttribute('readonly', true);
  });

  sendInput.addEventListener('keypress', (ev) => {
    if (ev.key !== 'Enter' || ev.target.hasAttribute('readonly')) {
      return;
    }

    let text = sendInput.value;
    if (!ev.shiftKey) {
      text += '\n';
    }

    wspc.getSocket().send(new Blob([text]));

    sendInput.value = '';
  })
})();
