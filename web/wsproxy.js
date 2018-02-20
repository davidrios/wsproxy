'use strict';

(function(exports) {
  class WSProxy extends EventEmitter {
    constructor(wsServer, proxyPort) {
      super();
      this.wsServer = wsServer;
      this.proxyPort = proxyPort;
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
        this.webSocket.send(this.proxyPort);
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

  class WSProxyComponent extends EventEmitter {
    constructor(connectionInput, portInput, actionButton) {
      super();

      this.connectionInput = connectionInput;
      this.portInput = portInput;
      this.actionButton = actionButton;

      this.wsProxy = null;
      this.state = 'stopped';

      actionButton.addEventListener('click', (ev) => {
        this.act();
      });
    }

    start() {
      this.emitEvent('starting');
      this.state = 'starting';
      this.actionButton.disabled = true;
      this.connectionInput.setAttribute('readonly', true);
      this.portInput.setAttribute('readonly', true);
      alertify.message('Starting...');

      this.wsProxy = new WSProxy(this.connectionInput.value, this.portInput.value);
      this.wsProxy.addListener('running', () => {
        this.setRunning();
      });

      this.wsProxy.addListener('stopped', () => {
        this.setStopped();
      });

      this.wsProxy.addListener('error', (error) => {
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

      this.wsProxy.start();
    }

    setRunning() {
      this.actionButton.disabled = false;
      this.actionButton.value = 'Stop';
      this.state = 'running';
      alertify.success('Running.');
      this.emitEvent('running');
    }

    stop() {
      this.emitEvent('stop');
      this.state = 'stopping';
      this.actionButton.disabled = true;
      alertify.message('Stopping...');
      this.wsProxy.stop();
    }

    setStopped() {
      this.actionButton.disabled = false;
      this.actionButton.value = 'Start';
      this.connectionInput.removeAttribute('readonly');
      this.portInput.removeAttribute('readonly');

      this.wsProxy.removeEvent();
      this.wsProxy = null;

      this.state = 'stopped';
      alertify.message('Stopped.');
      this.emitEvent('stopped');
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

    getSocket() {
      if (this.state !== 'running') {
        throw new Error('not running');
      }

      return this.wsProxy.getSocket();
    }
  }

  exports.WSProxy = WSProxy;
  exports.WSProxyComponent = WSProxyComponent;
})(window);
