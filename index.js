require('dotenv').config()

const http = require('http')
const { Server } = require('socket.io')
const { TikTokLiveConnection } = require('tiktok-live-connector')

const port = Number(process.env.PORT || 3000)
const signApiKey = process.env.EULERSTREAM_SIGN_API_KEY
const server = http.createServer()
const io = new Server(server, { cors: { origin: true, methods: ['GET', 'POST'] } })
const connections = new Map()

const validateId = raw => /^[\w.-]{1,64}$/.test(String(raw || '').replace(/^@/, '').trim())
const normalizeId = raw => String(raw || '').replace(/^@/, '').trim()
const viewerName = event => event.user?.nickname || event.user?.uniqueId || event.user?.displayId || 'TikTok user'
const commentText = event => [event.comment, event.content, event.text, event.message?.content, event.message?.text, event.chatMessage?.content, event.data?.content, event.data?.text].find(value => typeof value === 'string' && value.trim())?.replace(/\s+/g, ' ').trim().slice(0, 480) || ''
const emitEvent = (socket, type, data) => socket.emit('live-event', { type, data, at: Date.now() })
const sendStatus = (socket, state, message) => socket.emit('relay-status', { state, ...(message ? { message } : {}) })
const disconnectLive = socketId => { const connection = connections.get(socketId); if (connection) connection.disconnect(); connections.delete(socketId) }

io.on('connection', socket => {
  sendStatus(socket, 'ready')
  socket.on('connect-tiktok', async rawId => {
    const tiktokId = normalizeId(rawId)
    if (!validateId(tiktokId)) return sendStatus(socket, 'error', 'TikTok ID không hợp lệ.')
    if (!signApiKey) return sendStatus(socket, 'error', 'Relay chưa có EULERSTREAM_SIGN_API_KEY.')

    disconnectLive(socket.id)
    sendStatus(socket, 'connecting')
    const live = new TikTokLiveConnection(tiktokId, { signApiKey })
    connections.set(socket.id, live)

    live.on('chat', event => { const text = commentText(event); if (text) emitEvent(socket, 'comment', { name: viewerName(event), text }) })
    live.on('member', event => emitEvent(socket, 'join', { name: viewerName(event), text: 'đã tham gia' }))
    live.on('gift', event => emitEvent(socket, 'gift', { name: viewerName(event), text: '', giftName: event.giftDetails?.giftName || 'quà tặng', count: event.repeatCount || 1 }))
    live.on('follow', event => emitEvent(socket, 'follow', { name: viewerName(event), text: 'đã theo dõi' }))
    live.on('error', error => { console.error(`[TikTok ${tiktokId}]`, error); sendStatus(socket, 'error', 'TikTok LIVE đã báo lỗi.') })

    try { const state = await live.connect(); sendStatus(socket, 'connected', state.roomId ? `Đã vào phòng ${state.roomId}.` : undefined) }
    catch (error) { disconnectLive(socket.id); sendStatus(socket, 'error', error instanceof Error ? error.message : 'Không thể kết nối TikTok LIVE.') }
  })
  socket.on('disconnect', () => disconnectLive(socket.id))
})

server.listen(port, () => console.log(`Live Lantern relay listening on ${port}`))