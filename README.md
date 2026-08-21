# Live Lantern relay

Relay Socket.IO chuyển sự kiện TikTok LIVE thành dữ liệu cho Live Lantern.

## Chạy local

```powershell
npm install
Copy-Item .env.example .env
npm start
```

Điền `EULERSTREAM_SIGN_API_KEY` vào `.env`; không commit khóa này.
Điền thêm `GEMINI_API_KEY` nếu muốn bật trả lời tự động bằng Gemini; cũng không commit khóa này.

## Biến môi trường

- `EULERSTREAM_SIGN_API_KEY`: bắt buộc, khóa ký API cho `tiktok-live-connector`.
- `GEMINI_API_KEY`: tùy chọn, khóa Gemini API để relay tạo câu trả lời cho comment.
- `GEMINI_MODEL`: tùy chọn, model Gemini, mặc định `gemini-2.5-flash`.
- `PORT`: cổng HTTP, mặc định `3000`.

Có thể nhập key trực tiếp trong app. Key được giữ trong bộ nhớ của phiên Socket.IO, không ghi vào file `.env` hoặc repository; khi dùng app online nên kết nối bằng HTTPS/WSS.

## Socket contract

Client gửi `connect-tiktok` với TikTok ID không có/hoặc có `@`.

Relay phát:

- `relay-status`: `ready`, `connecting`, `connected`, `error`.
- `live-event`: `{ type, data, at }`, type là `comment`, `join`, `gift` hoặc `follow`.
- Client gửi `set-gemini-key` với key để cấu hình Gemini cho phiên hiện tại.
- Client gửi `set-ai-chat` với `true`/`false` để bật/tắt tự trả lời.
- Relay phát `ai-status`, `ai-response` và `ai-error` cho tính năng Gemini.

## Render

Trên Render, build command: `npm install`; start command: `npm start`. Thêm `EULERSTREAM_SIGN_API_KEY` và `GEMINI_API_KEY` (nếu dùng AI) trong Environment Variables.
