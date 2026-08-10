require("dotenv").config();
const http = require("http");
const { Server } = require("socket.io");
const { TikTokLiveConnection } = require("tiktok-live-connector");

const key = process.env.EULERSTREAM_SIGN_API_KEY;
if (!key) throw new Error("EULERSTREAM_SIGN_API_KEY is required in relay/.env");
const server = http.createServer();
const io = new Server(server, { cors: { origin: true, methods: ["GET", "POST"] } });
const connections = new Map();
const send = (socket, type, data) => socket.emit("live-event", { type, data, at: Date.now() });

io.on("connection", socket => {
  socket.emit("relay-status", { state: "ready" });
  socket.on("connect-tiktok", async rawId => {
    const uniqueId = String(rawId || "").replace(/^@/, "").trim();
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(uniqueId)) return socket.emit("relay-status", { state: "error", message: "TikTok ID không h?p l?." });
    connections.get(socket.id)?.disconnect();
    const live = new TikTokLiveConnection(uniqueId, { signApiKey: key });
    connections.set(socket.id, live);
    socket.emit("relay-status", { state: "connecting", uniqueId });
    live.on("chat", event => send(socket, "comment", { name: event.user?.nickname || event.user?.uniqueId || "TikTok user", text: event.comment || "" }));
    live.on("member", event => send(socket, "join", { name: event.user?.nickname || event.user?.uniqueId || "TikTok user", text: "dã tham gia" }));
    live.on("gift", event => send(socket, "gift", { name: event.user?.nickname || event.user?.uniqueId || "TikTok user", giftName: event.giftDetails?.giftName || "quà t?ng", count: event.repeatCount || 1 }));
    live.on("follow", event => send(socket, "follow", { name: event.user?.nickname || event.user?.uniqueId || "TikTok user", text: "dã theo dõi" }));
    try { const state = await live.connect(); socket.emit("relay-status", { state: "connected", uniqueId, roomId: state.roomId }); }
    catch (error) { connections.delete(socket.id); socket.emit("relay-status", { state: "error", message: error instanceof Error ? error.message : "Không th? k?t n?i TikTok LIVE." }); }
  });
  socket.on("disconnect", () => { connections.get(socket.id)?.disconnect(); connections.delete(socket.id); });
});
server.listen(Number(process.env.PORT || 3000), () => console.log(`Live relay ready on port ${process.env.PORT || 3000}`));
