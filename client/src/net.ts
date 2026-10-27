import type { ClientMsg, ServerMsg } from './types'

export type MsgHandler = (msg: ServerMsg) => void

export class Socket {
  private ws: WebSocket | null = null
  onMsg: MsgHandler = () => {}
  onClose: () => void = () => {}
  onOpen: () => void = () => {}

  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    this.ws = new WebSocket(`${proto}://${location.host}/ws`)
    this.ws.onmessage = (ev) => {
      try { this.onMsg(JSON.parse(ev.data)) } catch { /* shrug */ }
    }
    this.ws.onopen = () => this.onOpen()
    this.ws.onclose = () => this.onClose()
  }

  send(msg: ClientMsg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  close() { this.ws?.close() }
}
