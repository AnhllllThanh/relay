require("dotenv").config();
const http = require("http");
const { Server } = require("socket.io");
const { TikTokLiveConnection } = require("tiktok-live-connector");

const key = process.env.EULERSTREAM_SIGN_API_KEY;
if (!key) throw new Error("EULERSTREAM_SIGN_API_KEY is required in relay/.env");

const server = http.createServer();
const io = new Server(server, { cors: { origin: true, methods: ["GET", "POST"] } });
const connections = new Map();
const displayName = event => event.user?.nickname || event.user?.uniqueId || event.user?.displayId || event.user?.displayName || "TikTok user";
const normaliseComment = value => String(value || "").replace(/\s+/g, " ").trim().slice(0, 480);
const commentText = event => {
  const candidates = [
    event.comment,
    event.content,
    event.text,
    event.message?.content,
    event.message?.text,
    event.chatMessage?.content,
    event.data?.content,
    event.data?.text,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return normaliseComment(candidate);
    if (Array.isArray(candidate)) {
      const text = candidate.map(item => typeof item === "string" ? item : item?.text || item?.content || "").join("");
      if (text.trim()) return normaliseComment(text);
    }
  }
  return "";
};
const send = (socket, type, data) => socket.emit("live-event", { type, data, at: Date.now() });

io.on("connection", socket => {
  socket.emit("relay-status", { state: "ready" });
  socket.on("connect-tiktok", async rawId => {
    const uniqueId = String(rawId || "").replace(/^@/, "").trim();
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(uniqueId)) return socket.emit("relay-status", { state: "error", message: "TikTok ID không hợp lệ." });

    connections.get(socket.id)?.disconnect();
    const live = new TikTokLiveConnection(uniqueId, { signApiKey: key });
    connections.set(socket.id, live);
    socket.emit("relay-status", { state: "connecting", uniqueId });

    live.on("chat", event => {
      const text = commentText(event);
      if (!text) {
        console.warn("Đã nhận chat nhưng không tìm thấy nội dung:", Object.keys(event));
        socket.emit("relay-status", { state: "warning", message: "Nhận được chat rỗng từ TikTok." });
        return;
      }
      console.log(`[CHAT] ${displayName(event)}: ${text}`);
      send(socket, "comment", { name: displayName(event), text });
    });
    live.on("member", event => send(socket, "join", { name: displayName(event), text: "đã tham gia" }));
    live.on("gift", event => send(socket, "gift", { name: displayName(event), giftName: event.giftDetails?.giftName || "quà tặng", count: event.repeatCount || 1 }));
    live.on("follow", event => send(socket, "follow", { name: displayName(event), text: "đã theo dõi" }));
    live.on("error", error => console.error("TikTok relay error:", error));

    try {
      const state = await live.connect();
      socket.emit("relay-status", { state: "connected", uniqueId, roomId: state.roomId });
    } catch (error) {
      connections.delete(socket.id);
      socket.emit("relay-status", { state: "error", message: error instanceof Error ? error.message : "Không thể kết nối TikTok LIVE." });
    }
  });
  socket.on("disconnect", () => { connections.get(socket.id)?.disconnect(); connections.delete(socket.id); });
});

server.listen(Number(process.env.PORT || 3000), () => console.log(`Live relay ready on port ${process.env.PORT || 3000}`));
