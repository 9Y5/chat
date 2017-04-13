import {flatbuffers} from './services/flatbuffers';
import stanzas from './services/stanza_generated.js';
import WebSocketManager from './WebSocketManager.js';
const Auth = stanzas.Auth

class ChatClient {
  /**
   * Defers connection to chat server until .connect() is called.
   */
  constructor({host, user, onopen, onmessage, onChannelReady, onServerReceived, onDelivered, onReceived, channel, port=443, ...rest}) {
    const ws = new WebSocketManager({
      url: `wss://${host}:${port}/ws`,
      //url: `ws://localhost:8888`,
      binaryType: 'arraybuffer',
      onopen: e => {
        const chan = this.authenticate({user, channelId: channel})
        onChannelReady(chan)
        onopen(e)
        for (let [k, m] of this.pending) {
          console.log('pending messages: ', m)
          ws.send(m)
        }
      },
      onmessage: m => {
        const bytes = new Uint8Array(m['data']);
        const b = new flatbuffers.ByteBuffer(bytes);
        const msg = stanzas.Message.getRootAsMessage(b);
        const mid = msg.id()
        const receiptType = msg.receipt()
        console.log(`RECEIVED: ${mid}, sentMessages=`, this.sentMessages)
        console.log(stanzas.Receipt)
        if (receiptType == stanzas.Receipt.Received) {
          if (this.sentMessages.get(mid) === 'pending') {
            this.sentMessages.set(mid, 'received')
            onReceived(mid, status='received')
          } else if (this.sentMessages.get(mid) === 'received') {
            this.sentMessages.set(mid, 'delivered')
            onReceived(mid, status='delivered')
          }
        }
        if (receiptType == stanzas.Receipt.Request) {
          this.send({id: mid, receipt: stanzas.Receipt.Received})
        }
        return onmessage(msg)
      },
      ...rest
    })
    this.ws = ws
    this.pending = new Map()
    this.undelivered = new Map()
    this.sentMessages = new Map()
  }

  connect() {
    this.ws.connect()
  }

  authenticate({user, channelId=''}) {
    let channel
    const builder = new flatbuffers.Builder(1024)
    const username = builder.createString(user)
    if (channelId.length) {
      channel = channelId
    } else {
      channel = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
            return v.toString(16);
      });
    }
    const chan = builder.createString(channel)
    Auth.startAuth(builder)
    Auth.addUsername(builder, username)
    Auth.addChannel(builder, chan)
    const auth = Auth.endAuth(builder)
    builder.finish(auth)
    const buf = builder.asUint8Array()
    this.ws.send(buf)
    return channel
  }

  send({id, to='', body='', chatState=stanzas.ChatState.Active, messageType=stanzas.MessageType.Chat, receipt=stanzas.Receipt.Request}) {
    console.log(to, body, chatState)
    const mid = id ? id : this.generateId();
    const builder = new flatbuffers.Builder(1024);
    const msg = builder.createString(body);
    const chan = builder.createString(to);
    const messageId = builder.createString(mid);
    stanzas.Message.startMessage(builder);
    if (body.length) {
      stanzas.Message.addBody(builder, msg);
    }
    stanzas.Message.addTo(builder, chan);
    stanzas.Message.addChatstate(builder, chatState);
    stanzas.Message.addType(builder, messageType);
    stanzas.Message.addId(builder, messageId);
    stanzas.Message.addReceipt(builder, receipt)
    const m = stanzas.Message.endMessage(builder);
    builder.finish(m);
    const buf = builder.asUint8Array();
    this.ws.send(buf);
    // TODO: SKIP AUTH, should not put request
    this.sentMessages.set(mid, 'pending')
    console.log(`SEND: ${mid}, sentMessages=`, this.sentMessages)
  }

  generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });
  }
}

export default ChatClient
