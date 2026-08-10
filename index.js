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
const avatarUrl = event => {
  const visited = new Set();
  const findAvatar = (value, key = "", depth = 0) => {
    if (depth > 6 || value == null || visited.has(value)) return "";
    if (typeof value === "string") {
      const looksLikeAvatar = /avatar|profile|picture|image|thumb/i.test(key);
      return looksLikeAvatar && /^https:\/\//i.test(value) ? value : "";
    }
    if (typeof value !== "object") return "";
    visited.add(value);
    if (/avatar|profile|picture|image|thumb/i.test(key)) {
      for (const urlKey of ["urlList", "url_list", "url", "uri"]) {
        const candidate = value[urlKey];
        if (typeof candidate === "string" && /^https:\/\//i.test(candidate)) return candidate;
        if (Array.isArray(candidate)) {
          const url = candidate.find(item => typeof item === "string" && /^https:\/\//i.test(item));
          if (url) return url;
        }
      }
    }
    for (const [childKey, childValue] of Object.entries(value)) {
      const found = findAvatar(childValue, childKey, depth + 1);
      if (found) return found;
    }
    return "";
  };
  return findAvatar(event.user || event);
};
const commentText = event => {
  const visited = new Set();
  const findText = (value, key = "", depth = 0) => {
    if (depth > 4 || value == null || visited.has(value)) return "";
    if (typeof value === "string") return /^(comment|content|text|message|body|defaultpattern)$/i.test(key) && value.trim() ? value.trim() : "";
    if (typeof value !== "object") return "";
    visited.add(value);
    for (const [childKey, childValue] of Object.entries(value)) {
      const found = findText(childValue, childKey, depth + 1);
      if (found) return found;
    }
    return "";
  };
  return findText(event);
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
      const avatar = avatarUrl(event);
      console.log(`[CHAT] ${displayName(event)}: ${text} | avatar: ${avatar ? "yes" : "no"}`);
      send(socket, "comment", { name: displayName(event), avatar, text });
    });
    live.on("member", event => { const avatar = avatarUrl(event); console.log(`[JOIN] ${displayName(event)} | avatar: ${avatar ? "yes" : "no"}`); send(socket, "join", { name: displayName(event), avatar, text: "đã tham gia" }); });
    live.on("gift", event => { const avatar = avatarUrl(event); console.log(`[GIFT] ${displayName(event)} | avatar: ${avatar ? "yes" : "no"}`); send(socket, "gift", { name: displayName(event), avatar, giftName: event.giftDetails?.giftName || "quà tặng", count: event.repeatCount || 1 }); });
    live.on("follow", event => { const avatar = avatarUrl(event); console.log(`[FOLLOW] ${displayName(event)} | avatar: ${avatar ? "yes" : "no"}`); send(socket, "follow", { name: displayName(event), avatar, text: "đã theo dõi" }); });
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
