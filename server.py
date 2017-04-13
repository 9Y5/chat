import asyncio
import websockets
import flatbuffers
from stanzas import Message
from stanzas.Receipt import Receipt
from stanzas.Auth import Auth
from stanzas.ChatState import ChatState
from stanzas.MessageType import MessageType


online = dict()
channels = dict()
receipts = dict()


async def serialize_message(to=None, message=None, message_type=MessageType().Chat, from_user=None, chat_state=ChatState().Active, id=None, received=None, delivered=None, receipt=Receipt().Received):
    builder = flatbuffers.Builder(1024)
    m = builder.CreateString(message) if message else None
    c = builder.CreateString(to) if to else None
    u = builder.CreateString(from_user) if from_user else None
    i = builder.CreateString(id) if id else None

    Message.MessageStart(builder)
    Message.MessageAddTo(builder, c) if c else None
    Message.MessageAddType(builder, message_type)
    Message.MessageAddBody(builder, m) if m else None
    Message.MessageAddSender(builder, u) if u else None
    Message.MessageAddChatstate(builder, chat_state)
    Message.MessageAddReceived(builder, received) if received else None
    Message.MessageAddId(builder, i) if i else None
    Message.MessageAddReceipt(builder, receipt)

    msg = Message.MessageEnd(builder)

    builder.Finish(msg)

    return bytes(builder.Output())


async def authenticate(sock):
    buf = await sock.recv()
    auth = Auth.GetRootAsAuth(buf, 0)
    return auth.Channel(), auth.Username()


async def create_or_update_channel(chan, user, sock):
    global channels
    channels.setdefault(chan, {}).update({user: sock})


async def update_or_delete_channel(chan, user):
    global channels
    del channels[chan][user]
    if not len(channels[chan]):
        del channels[chan]


async def broadcast(to_chan, from_user, message):
    global channels
    for user, sock in channels[to_chan].items():
        if user == from_user:
            continue
        await sock.send(message)


async def broadcast_leaving(chan, user):
    text = '{} left'.format(user.decode('utf-8')[1:])
    msg = await serialize_message(chan, text, MessageType().Headline,
                                  user, ChatState().Gone)
    await broadcast(chan, user, msg)


async def ack(id, sock):
    try:
        msg = await serialize_message(id=id, receipt=Receipt().Received)
        await sock.send(msg)
    except Exception as e:
        print(e)


async def handle_receipt(my_sock, receipt, id):
    if receipt == Receipt().Request:
        await update_receipts(id, my_sock)
        await ack(id, my_sock)
        return True
    elif receipt == Receipt().Received:
        requester_sock = await update_receipts(id)
        await ack(id, requester_sock)
        return False


async def update_receipts(message_id, sock=None):
    global receipts
    if receipts.get(message_id, False):
        requester_sock = receipts[message_id]
        del receipts[message_id]
        return requester_sock
    receipts[message_id] = sock
    return


async def handle_messages(user, sock):
    global channels
    while True:
        buf = await sock.recv()
        print('RECV: {}'.format(buf))
        try:
            msg = Message.Message.GetRootAsMessage(buf, 0)
            is_continue = await handle_receipt(sock, msg.Receipt(),
                                               msg.Id().decode('utf-8'))
            if not is_continue:
                continue
            to_chan = msg.To()
            m = await serialize_message(to_chan, msg.Body(), msg.Type(),
                                        user, msg.Chatstate(), msg.Id(),
                                        receipt=Receipt().Request)
            await broadcast(to_chan, user, m)
        except Exception as e:
            print(e)
            continue


async def handler(sock, path):
    chan, user = await authenticate(sock)
    await create_or_update_channel(chan, user, sock)
    try:
        await handle_messages(user, sock)
    finally:
        await broadcast_leaving(chan, user)
        await update_or_delete_channel(chan, user)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Run the chat server.")
    parser.add_argument('--port', metavar='p', type=int, default=8888,
                        help='port to listen on (default: 8888)')
    parser.add_argument('--host', metavar='H', type=str, default='localhost',
                        help='host to listen on (default: localhost)')
    args = parser.parse_args()

    start_server = websockets.serve(handler, args.host, args.port)

    asyncio.get_event_loop().run_until_complete(start_server)
    asyncio.get_event_loop().run_forever()
