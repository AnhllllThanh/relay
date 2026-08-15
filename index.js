require('dotenv').config()

const http = require('http')
const { Server } = require('socket.io')
const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector')

const port = Number(process.env.PORT || 3000)
const signApiKey = process.env.EULERSTREAM_SIGN_API_KEY
const server = http.createServer()
const io = new Server(server, { cors: { origin: true, methods: ['GET', 'POST'] } })
const connections = new Map()
const connectionTokens = new Map()
let eventSequence = 0

const validateId = raw => /^[\w.-]{1,64}$/.test(String(raw || '').replace(/^@/, '').trim())
const normalizeId = raw => String(raw || '').replace(/^@/, '').trim()
const viewerName = event => event.user?.nickname || event.user?.uniqueId || event.user?.displayId || 'TikTok user'
const viewerId = event => event.user?.uniqueId || event.userId || event.user?.displayId || event.user?.nickname
const commentText = event => [event.comment, event.content, event.text, event.message?.content, event.message?.text, event.chatMessage?.content, event.data?.content, event.data?.text].find(value => typeof value === 'string' && value.trim())?.replace(/\s+/g, ' ').trim().slice(0, 480) || ''
const emitEvent = (socket, type, data) => { const at = Date.now(); socket.emit('live-event', { id: `${at}-${++eventSequence}`, type, data, at }) }
const emitViewerCount = (socket, value) => { const count = typeof value?.toNumber === 'function' ? value.toNumber() : Number(value); if (Number.isFinite(count) && count > 0) emitEvent(socket, 'viewerCount', { count }) }
const sendStatus = (socket, state, message) => socket.emit('relay-status', { state, ...(message ? { message } : {}) })
const disconnectLive = socketId => { const connection = connections.get(socketId); if (connection) connection.disconnect(); connections.delete(socketId); connectionTokens.delete(socketId) }

io.on('connection', socket => {
  sendStatus(socket, 'ready')
  socket.on('connect-tiktok', async rawId => {
    const tiktokId = normalizeId(rawId)
    if (!validateId(tiktokId)) return sendStatus(socket, 'error', 'TikTok ID không hợp lệ.')
    if (!signApiKey) return sendStatus(socket, 'error', 'Relay chưa có EULERSTREAM_SIGN_API_KEY.')

    disconnectLive(socket.id)
    const token = Symbol('live-session')
    connectionTokens.set(socket.id, token)
    sendStatus(socket, 'connecting')
    const live = new TikTokLiveConnection(tiktokId, { signApiKey })
    connections.set(socket.id, live)
    const isCurrent = () => connectionTokens.get(socket.id) === token

    live.on(WebcastEvent.CHAT, event => { const text = commentText(event); if (isCurrent() && text) emitEvent(socket, 'comment', { name: viewerName(event), viewerId: viewerId(event), text }) })
    live.on(WebcastEvent.MEMBER, event => { if (isCurrent()) { emitEvent(socket, 'join', { name: viewerName(event), viewerId: viewerId(event), text: 'đã tham gia' }); emitViewerCount(socket, event.memberCount ?? event.viewerCount) } })
    live.on(WebcastEvent.GIFT, event => { if (isCurrent()) emitEvent(socket, 'gift', { name: viewerName(event), viewerId: viewerId(event), text: '', giftName: event.giftDetails?.giftName || 'quà tặng', count: event.repeatCount || 1 }) })
    live.on(WebcastEvent.FOLLOW, event => { if (isCurrent()) emitEvent(socket, 'follow', { name: viewerName(event), viewerId: viewerId(event), text: 'đã theo dõi' }) })
    live.on(WebcastEvent.ROOM_USER, event => { if (isCurrent()) emitViewerCount(socket, event.viewerCount ?? event.totalUser ?? event.total ?? event.data?.viewerCount) })
    live.on(ControlEvent.ERROR, error => { if (isCurrent()) { console.error(`[TikTok ${tiktokId}]`, error); sendStatus(socket, 'error', 'TikTok LIVE đã báo lỗi.') } })

    try { const state = await live.connect(); if (isCurrent()) sendStatus(socket, 'connected', state.roomId ? `Đã vào phòng ${state.roomId}.` : undefined); else live.disconnect() }
    catch (error) { if (isCurrent()) { disconnectLive(socket.id); sendStatus(socket, 'error', error instanceof Error ? error.message : 'Không thể kết nối TikTok LIVE.') } }
  })
  socket.on('disconnect', () => disconnectLive(socket.id))
})

server.listen(port, () => console.log(`Live Lantern relay listening on ${port}`))
