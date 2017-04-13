import React, { Component } from 'react';
import logo from './logo.svg';
import './App.css';
import 'milligram/dist/milligram.css';
import {flatbuffers} from './services/flatbuffers';
import stanzas from './services/stanza_generated.js';
import ChatClient from './ChatClient.js';


let allowed_notifications = false
//navigator.serviceWorker.register('worker.js');

//if (Notification) {
//  Notification.requestPermission()
//  .then(permission => {
//    if (permission === 'denied') {
//      alert('eh.. allow leh. otherwise how to push?')
//      return
//    }
//    if (permission === 'default') {
//      alert('eh.. allow leh. otherwise how to push?')
//      return
//    }
//    allowed_notifications = true
//  })
//}

/*
if ('serviceWorker' in navigator && window.location.hostname !== 'localhost') {
  navigator.serviceWorker.register('sw.js')
}
*/
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations(regs =>
    regs.map(r => r.unregister()))
}

function convertTimestamp(timestamp) {
  let d = new Date(timestamp);
  let hh = d.getHours();
  let h = hh;
  let min = ('0' + d.getMinutes()).slice(-2);
  let ampm = 'AM';

  if (hh > 12) {
    h = hh - 12;
    ampm = 'PM';
  } else if (hh === 12) {
    h = 12;
    ampm = 'PM';
  } else if (hh === 0) {
    h = 12;
  }
  return h + ':' + min + ' ' + ampm;
}

function makeid() {
  var text = "";
  var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for( var i=0; i < 5; i++  )
        text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}

class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      socketState: WebSocket.CONNECTING,
      messages: [
        {body: () => `To invite others, just pass them this url: ${window.location.href}`, type: 'special-headline-instructions'},
        //{body: 'Hi! 😊', type: stanzas.MessageType.Chat, self: false, sender: '@mon'},
        //{body: 'test, my two liner text. can it handle it??', type: stanzas.MessageType.Chat, self: true},
        //{body: 'A special event happened here', type: stanzas.MessageType.Headline},
        //{body: 'ok, ya i guess. lol. my test bot will reply this long. try something longer and longer and longer and longer asdfasdfasdfasdf', type: stanzas.MessageType.Chat, self: false},
      ],
      chatState: stanzas.ChatState.Active,
      chatStates: new Map(),
      name: '',
    };
  }

  handleRegistrationForm({name, channel}) {
    this.name = name[0] === '@' ? name : '@' + name
    const client = new ChatClient({
      host: 'chat.yishengg.com',
      //host: 'localhost',
      //port: 8888,
      user: name[0] === '@' ? name : '@' + name,
      channel: channel ? channel : window.location.hash,
      onopen: () => {
        this.setState({socketState: WebSocket.OPEN})
        this.sendHeadline(name.substring(1) + ' joined')
      },
      onChannelReady: (channel) => {
        window.location.hash = channel
        this.toId = channel
      },
      onmessage: msg => {
        const body = msg.body()
        this.setState({
          messages: body ? [...this.state.messages, {
            body,
            type: msg.type(),
            sender: msg.sender(),
            self: false,
            pid: makeid(),
            ts: Date.now()
          }] : this.state.messages,
          chatState: msg.chatstate(),
          chatStates: this.state.chatStates.set(msg.sender(), msg.chatstate())
        }, () => {
          const el = document.getElementById('app-body');
          el.scrollTop = el.scrollHeight;
          //if (allowed_notifications && msg.type() === stanzas.MessageType.Chat && body.length) {
          //  navigator.serviceWorker.ready.then(registration => {
          //    registration.showNotification(msg.sender(), {
          //      body,
          //      icon: 'https://cdn2.iconfinder.com/data/icons/ios7-inspired-mac-icon-set/1024/messages_5122x.png',
          //    })
          //  })
            /*
            const n = new Notification(msg.sender(), {
              body,
              icon: 'https://cdn2.iconfinder.com/data/icons/ios7-inspired-mac-icon-set/1024/messages_5122x.png',
            })
            n.onclick = event => {
              event.preventDefault()
              window.open(window.location.href)
            }
            */
          //}
        })
      },
      onServerReceived: mid => new Promise((resolve, error) => {
        this.state.messages.forEach(m => {
          if (m.id == mid) {
            m.status = 'received'
            this.setState({ messages: this.state.messages })
            return resolve()
          }
        })
      }),
      onDelivered: mid => new Promise((resolve, error) => {
        this.state.messages.forEach(m => {
          if (m.id == mid) {
            m.status = 'delivered'
            this.setState({ messages: this.state.messages })
            return resolve()
          }
        })
      }),
      onReceived: (mid, status) => new Promise((resolve, error) => {
        this.state.messages.forEach(m => {
          if (m.id == mid) {
            m.status = status
            this.setState({ messages: this.state.messages })
            return resolve()
          }
        })
      }),
      onclose: e => {
        console.log(e)
        this.setState({socketState: WebSocket.CLOSED})
      },
    })
    client.connect()
    this.client = client
    //this.setState({name})
  }

  sendChatState(chatState) {
    this.client.send({to: this.toId, chatState})
  }

  sendHeadline(msg) {
    this.client.send({to: this.toId, body: msg, messageType: stanzas.MessageType.Headline})
  }

  appendMessages(body, type, self, status='pending') {
    if (body.length < 1) {
      return
    }
    const pid = makeid()
    const id = this.client.generateId()
    this.setState({
      messages: [...this.state.messages, {id, status, body, type, self, pid, ts: Date.now()}]
    }, () => {
      const el = document.getElementById('app-body');
      el.scrollTop = el.scrollHeight;

      this.client.send({id, to: this.toId, body})
    });
    return true
  }

  render() {
    const hash = window.location.hash
    if (!hash || !this.name) {
    //this.name = '@yisheng'
    //if (false) {
      return (
        <RegistrationPage
          handleRegistrationForm={this.handleRegistrationForm.bind(this)}
        />
      )
    }
    const msgs = this.state.messages.map((m, idx) => {
      switch(m.type) {
        case stanzas.MessageType.Chat:
          const prev = this.state.messages[idx - 1]
          return !m.self ? (
            <div className="row" style={{ padding: '3px 0px' }}>
              <div className="column column-90">
                <ChatBubbleLeft id={m.pid ? m.pid : makeid()} sender={idx > 0 && prev.sender === m.sender && prev.type === stanzas.MessageType.Chat ? null : m.sender} body={m.body} time={m.ts} status={m.status} />
              </div>
            </div>
          ) : (
            <div className="row" style={{ padding: '3px 0px' }}>
              <div className="column column-90 column-offset-10">
                <ChatBubbleRight id={m.pid ? m.pid : makeid()} body={m.body} time={m.ts} status={m.status} />
              </div>
            </div>
          )
        case 'special-headline':
          return <SpecialMessageHeadline body={m.body} />
        case stanzas.MessageType.Headline:
          return <MessageHeadline body={m.body} />
        case 'special-headline-instructions':
          return <SpecialMessageHeadline body={m.body()} />
      }
    });
    return (
      <div className="App">
        {/*<div className="App-header">
          <WSState state={this.state.socketState} />
        </div>*/}
        <div id="app-body" className="App-body">
          <p className="App-intro">
            <div className="container">
              {msgs}
              <ChatInputNotification>
                <ChatState state={this.state.chatStates} />
              </ChatInputNotification>
            </div>
          </p>
        </div>
        <Footer>
          <ChatInput
            appendMessages={this.appendMessages.bind(this)}
            sendChatState={this.sendChatState.bind(this)}
          />
        </Footer>
      </div>
    );
  }
}

class MessageHeadline extends Component {
  render() {
    return (
      <div style={{ padding: '3px 7px' }}>
        <div className="App-chat-bubble-shape App-headline" style={{background: this.props.background}}>
          {this.props.body}
        </div>
      </div>
    );
  }
}

const SpecialMessageHeadline = props => <MessageHeadline {...props} background='#faeba8' />

class ChatBubbleLeft extends Component {
  render() {
    const time = this.props.time || Date.now();
    const sender = this.props.sender ? this.props.sender.substring(1) : ''
    let body
    try {
      const json = JSON.parse(this.props.body)
      if (json.dataUrl) {
        body = <img style={{maxWidth: json.width, width: '100%'}} src={json.dataUrl} />
      }
    } catch (e) {
      body = this.props.body
    }
    return (
      <div {...this.props} style={{ fontSize: '1.5rem', float: 'left', borderRadius: 7, boxShadow: '2px 1px 3px -1px rgba(148,148,148,0.2)', background: 'white', padding: '3px 7px', textAlign: 'left', maxWidth: '90%', wordWrap: 'break-word' }}>
        <div style={{
          fontWeight: '500',
        }}>
          {sender}
        </div>
        {body}
        <BubbleTimestamp status={this.props.status} time={time} />
      </div>
    );
  }
}

class ChatBubbleRight extends Component {
  render() {
    const time = this.props.time || Date.now();
    let body
    try {
      const json = JSON.parse(this.props.body)
      if (json.dataUrl) {
        body = <img style={{maxWidth: json.width, width: '100%'}} src={json.dataUrl} />
      }
    } catch (e) {
      body = this.props.body
    }
    return (
      <div {...this.props} style={{ fontSize: '1.5rem', float: 'right', borderRadius: 7, boxShadow: '2px 1px 3px -1px rgba(148,148,148,0.2)', background: '#e9d8f4', color: 'black', padding: '3px 7px', textAlign: 'left', maxWidth: '90%', wordWrap: 'break-word' }}>
        {body}
        <BubbleTimestamp status={this.props.status} time={time} />
      </div>
    );
  }
}

class BubbleTimestamp extends Component {
  render() {
    const ftime = convertTimestamp(this.props.time);
    return (
      <div style={{ paddingLeft: 7, float: 'right', opacity: 0.3, textAlign: 'right', position: 'relative', bottom: 0, right: 0 }}>
        <small style={{ fontSize: '1.2rem' }}>{ftime} <DeliveryStatus status={this.props.status} /></small>
      </div>
    );
  }
}

const DeliveryStatus = props => {
  const statusMap = {
    'pending': 'schedule',
    'received': 'done',
    'delivered': 'done_all',
  }
  return <MaterialIcon style={{fontSize: '1.7rem'}} name={statusMap[props.status]} />
}

const MaterialIcon = props => <i {...props} className="material-icons">{props.name}</i>

class ChatInput extends Component {
  constructor(props) {
    super(props)
    this.timerId = null
    this.state = {
      text: ''
    }
  }

  clearInput(target) {
    target.value = '';
  }

  typingHandler(e) {
    const text = this.state.text
    switch(e.keyCode) {
      case 13:
        this.props.appendMessages(text, stanzas.MessageType.Chat, true)
        this.setState({ text: '' })
        break
      default:
        if (this.timerId) {
          clearTimeout(this.timerId)
        } else {
          this.props.sendChatState(stanzas.ChatState.Composing)
        }
        const timerId = setTimeout(() => {
          this.props.sendChatState(stanzas.ChatState.Paused)
          this.timerId = null
        }, 1000)
        this.timerId = timerId
    }
  }

  sendHandler(e) {
    e.stopPropagation()
    e.preventDefault()
    this.props.appendMessages(this.state.text, stanzas.MessageType.Chat, true)
    this.setState({ text: '' })
  }

  sendPhotoHandler(dataUrl, width, height) {
    this.props.appendMessages(JSON.stringify({
      dataUrl,
      width,
      height,
    }), stanzas.MessageType.Chat, true)
    this.setState({ text: '' })
  }

  render() {
    return (
      <div className="container">
        <div className="row chat-input">
          <div className="column">
            <PhotoAttachment onReady={({dataUrl, width, height}) => this.sendPhotoHandler(dataUrl, width, height)} />
            <input
              value={this.state.text}
              onChange={e => this.setState({ text: e.target.value })}
              onKeyUp={this.typingHandler.bind(this)}
              style={{ margin: 0, fontSize: '1.5rem', fontWeight: '500', outline: 'none', color: '#fff', width: '75%' }}
              type="text"
              placeholder="Type a message"
            />
            <button style={{float: 'right', background: 'none', border: 'none', padding: '0px 13px 0px 0px', margin: 0, width: '20%', textAlign: 'right'}} onClick={this.sendHandler.bind(this)} className="button send-button">Send</button>
          </div>
        </div>
      </div>
    );
  }
}

class PhotoAttachment extends Component {
  handleClickAttach(e) {
    document.getElementById('photoattachment').click()
  }

  handleFiles(e) {
    const file = document.getElementById('photoattachment').files[0]
    if (file.type.match(/image.*/)) {
      const cvs = document.createElement('canvas')
      const img = new Image()
      const objUrl = window.URL.createObjectURL(file)
      img.src = objUrl
      img.onload = () => {
        const maxWidth = Math.min(360, img.naturalWidth)
        const height = img.naturalWidth > 360 ? (maxWidth/img.naturalWidth)*img.naturalHeight : (img.naturalWidth/maxWidth)*img.naturalHeight
        cvs.width = maxWidth
        cvs.height = height
        const ctx = cvs.getContext('2d')
        const x = ctx.drawImage(img, 0, 0, cvs.width, cvs.height)
        const dataUrl = cvs.toDataURL('image/jpeg')
        this.props.onReady({dataUrl, width: cvs.width, height: cvs.height})
        window.URL.revokeObjectURL(objUrl)
      }
    }
  }

  render() {
    return(
      <div>
        <input accept="image/*" onChange={this.handleFiles.bind(this)} id="photoattachment" type="file" style={{display: 'none'}} />
        <MaterialIcon onClick={this.handleClickAttach.bind(this)} name="add_a_photo" style={{float: 'left', textAlign: 'left', width: '5%', padding: '7px 0px 0px 7px', color: 'white'}} />
      </div>
    );
  }
}

class Footer extends Component {
  render() {
    return (
      <div className="App-footer">
        <div className="container" style={{ padding: 0 }}>
          <div className="row">
            <div className="column" style={{ textAlign: 'center', margin: '0 auto' }}>
              {this.props.children}
            </div>
          </div>
        </div>
      </div>
    );
  }
}

class Credits extends Component {
  render() {
    return (
      <small className="App-credits">
        Thanks to React, milligram. Inspired by Whatsapp.
      </small>
    );
  }
}

const WSState = props => {
  console.log(props)
  switch(props.state) {
      case WebSocket.CONNECTING:
        return <span>Connecting</span>
      case WebSocket.OPEN:
        return <span>Online</span>
      case WebSocket.CLOSING:
        return <span>Disconnecting</span>
      case WebSocket.CLOSED:
        return <span>Disconnected</span>
      default:
        return <span>Disconnected</span>
  }
}

const ChatState = props => {
  console.log(props)
  const state = props.state
  let typing = []
  let active = []
  for (let [user, cs] of state.entries()) {
    if (cs === stanzas.ChatState.Active || cs === stanzas.ChatState.Paused) {
      active.push(user)
    }
    if (cs === stanzas.ChatState.Composing) {
      typing.push(user)
    }
  }
  console.log(typing, active)
  if (typing.length) {
    return <span>{typing.join(' ')} typing...</span>
  }
  if (active.length) {
    return <span>{active.join(' ')} online</span>
  }
  return <span>No one's in the room. Start inviting!</span>
  switch(props.state) {
      case stanzas.ChatState.Active:
        return <span>Online</span>
      case stanzas.ChatState.Composing:
        return <span>Typing...</span>
      case stanzas.ChatState.Gone:
        return <span>Offline</span>
      default:
        return <span>Online</span>
  }
}

class RegistrationPage extends Component {
  constructor(props) {
    super(props)
    this.state = {
      name: '',
      channel: window.location.hash,
    }
  }

  componentDidMount() {
    window.fbAsyncInit = function() {
      window.FB.init({
        appId      : '1681090165537430',
        xfbml      : true,
        version    : 'v2.6'
      });
    };
    (function(d, s, id){
       var js, fjs = d.getElementsByTagName(s)[0];
       if (d.getElementById(id)) {return;}
       js = d.createElement(s); js.id = id;
       js.src = "//connect.facebook.net/en_US/sdk.js";
       fjs.parentNode.insertBefore(js, fjs);
     }(document, 'script', 'facebook-jssdk'));
    const root = document.documentElement
    root.className += ' full-page-bg full-height'
    document.body.className += ' full-height'
    document.getElementById('root').className += ' full-height'
  }

  checkLoginState() {
    const cb = this.props.handleRegistrationForm
    window.FB.getLoginStatus(response => {
      window.FB.api('/me?fields=picture,first_name,last_name', res => {
        const {first_name, last_name, id, picture: {data: {url}}} = res
        cb({name: '@' + first_name})
      })
      console.log(response)
    });
  }

  render() {
    return (
      <div className="registration-form">
        <div>
        <input
          type="text"
          value={this.state.name}
          placeholder="Your Name"
          onChange={e => {
            const name = this.state.name
            if (name[0] !== '@' && name.length > 0) {
              return this.setState({name: '@' + e.target.value})
            }
            return this.setState({name: e.target.value})
          }}
          style={{
            fontWeight: this.state.name.length > 0 ? '600' : '300',
            fontSize: '2rem',
            color: '#fff',
            textShadow: '2px 4px 3px rgba(0,0,0,0.3)',
            textAlign: 'center',
            background: 'rgba(0,0,0,0.3)'
          }}
        />
        <input
          type="text"
          value={this.state.channel}
          placeholder="An Optional Channel"
          disabled={this.state.channel == window.location.hash && window.location.hash.length > 0}
          onChange={e => {
            const chan = this.state.channel
            if (chan[0] !== '#' && chan.length > 0) {
              return this.setState({channel: '#' + e.target.value})
            }
            return this.setState({channel: e.target.value})
          }}
          style={{
            fontWeight: this.state.channel.length > 0 ? '600' : '300',
            fontSize: '2rem',
            color: '#fff',
            textShadow: '2px 4px 3px rgba(0,0,0,0.3)',
            textAlign: 'center',
            background: 'rgba(0,0,0,0.3)'
          }}
        />
        <button onClick={() => this.props.handleRegistrationForm(this.state)} style={{ width: '100%' }}>Let's Chat</button>
        <div style={{ textAlign: 'center', width: '100%', color: 'white', fontWeight: '800' }}>OR</div>
          <button
            onClick={() => window.FB.login(this.checkLoginState())}
            style={{ background: '#3b5998', borderColor: '#8b9dc3', width: '100%' }}
          >Login with Facebook</button>
        </div>
      </div>
    );
  }
}

class ChatInputNotification extends Component {
  render() {
    return (
      <div className="chat-input-notification">{this.props.children}</div>
    );
  }
}

class Overlay extends Component {
  render() {
    return (
      <div className="overlay">
        <div>
          <h1>Yo</h1>
          <div className="mdl-spinner mdl-js-spinner is-active" />
        </div>
      </div>
    );
  }
}

class SideMenu extends Component {
  render() {
    return (
      <div className="sidemenu" />
    );
  }
}

class AppShell extends Component {
  render() {
    return (
      <div>
        {this.props.children}
      </div>
    );
  }
}

export default App;
