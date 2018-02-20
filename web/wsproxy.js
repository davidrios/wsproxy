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

  exports.WSProxy = WSProxy;
})(window);
