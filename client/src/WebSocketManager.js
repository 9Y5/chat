class WebSocketManager {
  constructor(options) {
    const {url, protocols, ...rest} = options
    this.url = url
    this.protocols = protocols
    this.options = rest
    this._ws = null
  }

  connect() {
    const {onclose, onopen, ...rest} = this.options
    const ws = new WebSocket(this.url, this.protocols)
    ws.onopen = e => {
      onopen(e)
    }
    ws.onclose = e => {
      onclose(e)
      ws.close()
      setTimeout(() => this.connect(), 5000)
    }
    this._ws = ws
    Object.assign(ws, rest)
  }

  send(msg) {
    this._ws.send(msg)
  }
}

export default WebSocketManager
