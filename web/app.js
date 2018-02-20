'use strict';

(function() {
  class WSForwarder extends EventEmitter {
    constructor(wsServer, forwardPort) {
      super();
      this.wsServer = wsServer;
      this.forwardPort = forwardPort;
      this.state = 'stopped';
    }

    start() {
      if (this.state !== 'stopped') {
        return;
      }

      this.state = 'starting';
      try {
        this.webSocket = new WebSocket(this.wsServer);
      }
      catch(err) {
        this.emitEvent('error', ['invalid_connection']);
        this.forceStop();
        return;
      }

      this.webSocket.onopen = (ev) => {
        this.webSocket.send(this.forwardPort);
      }

      this.webSocket.onmessage = (ev) => {
        switch (ev.data) {
          case 'SUCCESS':
            this.webSocket.onmessage = null;
            this.state = 'running';
            this.emitEvent('running');
            break;

          case 'INVALID_PORT':
            this.emitEvent('error', ['invalid_port']);
            this.forceStop();
            break;

          case 'SERVICE_UNAVAILABLE':
            this.emitEvent('error', ['service_unavailable']);
            this.forceStop();
            break;

          default:
            this.emitEvent('error', ['unknown_message']);
            this.webSocket.close();
            break;
        }
      }

      this.webSocket.onclose = (ev) => {
        this.emitEvent('error', ['websocket_closed']);
        this.forceStop();
      }
    }

    stop() {
      if (this.state !== 'running') {
        return;
      }

      this.webSocket.close();
      this.forceStop();
    }

    forceStop() {
      this.state = 'stopped';
      this.emitEvent('stopped');
    }

    getSocket() {
      if (this.state !== 'running') {
        throw new Error('Not running.');
      }

      return this.webSocket;
    }
  }

  class WSForwarderComponent {
    constructor(connectionInput, portInput, actionButton, responseDisplayElement, sendInput) {
      this.connectionInput = connectionInput;
      this.portInput = portInput;
      this.actionButton = actionButton;
      this.responseDisplayElement = responseDisplayElement;
      this.sendInput = sendInput;

      this.wsForwarder = null;
      this.state = 'stopped';

      actionButton.addEventListener('click', (ev) => {
        this.act();
      });

      sendInput.addEventListener('keypress', (ev) => {
        if (ev.key !== 'Enter' || ev.target.hasAttribute('readonly')) {
          return;
        }

        let text = this.sendInput.value;
        if (!ev.shiftKey) {
          text += '\n';
        }

        this.wsForwarder.getSocket().send(new Blob([text]));

        this.sendInput.value = '';
      })
    }

    start() {
      this.state = 'starting';
      this.actionButton.disabled = true;
      this.connectionInput.setAttribute('readonly', true);
      this.portInput.setAttribute('readonly', true);
      alertify.message('Starting...');

      this.wsForwarder = new WSForwarder(this.connectionInput.value, this.portInput.value);
      this.wsForwarder.addListener('running', () => {
        this.setRunning();
        this.responseDisplayElement.innerHTML = '';
        this.sendInput.focus();

        this.wsForwarder.getSocket().onmessage = (ev) => {
          let fr = new FileReader();
          fr.onload = (ev) => {
            this.responseDisplayElement.insertAdjacentText('beforeend', ev.target.result);
            this.responseDisplayElement.parentElement.scrollTop = 0xFFFFFF;
          }
          fr.readAsText(ev.data);
        }
      });

      this.wsForwarder.addListener('stopped', () => {
        this.setStopped();
      });

      this.wsForwarder.addListener('error', (error) => {
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

      this.wsForwarder.start();
    }

    setRunning() {
      this.actionButton.disabled = false;
      this.actionButton.value = 'Stop';
      this.sendInput.removeAttribute('readonly');
      this.state = 'running';
      alertify.success('Running.');
    }

    stop() {
      this.state = 'stopping';
      this.actionButton.disabled = true;
      this.sendInput.setAttribute('readonly', true);
      alertify.message('Stopping...');
      this.wsForwarder.stop();
    }

    setStopped() {
      this.actionButton.disabled = false;
      this.actionButton.value = 'Start';
      this.connectionInput.removeAttribute('readonly');
      this.portInput.removeAttribute('readonly');
      this.sendInput.setAttribute('readonly', true);

      this.wsForwarder.removeEvent();
      this.wsForwarder = null;

      this.state = 'stopped';
      alertify.message('Stopped.');
    }

    act() {
      switch (this.state) {
        case 'stopped':
          this.start();
          break;

        case 'running':
          this.stop();
          break;
      }
    }
  }

  new WSForwarderComponent(
    document.getElementById('connection_input'),
    document.getElementById('port_input'),
    document.getElementById('action_button'),
    document.getElementById('response_display'),
    document.getElementById('send_input')
  );
})();
