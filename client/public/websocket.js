class WebSocketClient {
  constructor() {
    this.socket = window.io();
  }

  join(room, name) {
    this.socket.emit("join", { room, name });
  }

  on(event, handler) {
    this.socket.on(event, handler);
  }

  send(event, payload) {
    this.socket.emit(event, payload);
  }
}

window.WebSocketClient = WebSocketClient;
