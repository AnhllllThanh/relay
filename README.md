# Live Lantern relay

Relay Socket.IO chuyển sự kiện TikTok LIVE thành dữ liệu cho Live Lantern.

## Chạy local

```powershell
npm install
Copy-Item .env.example .env
npm start
```

Điền `EULERSTREAM_SIGN_API_KEY` vào `.env`; không commit khóa này.

## Biến môi trường

- `EULERSTREAM_SIGN_API_KEY`: bắt buộc, khóa ký API cho `tiktok-live-connector`.
- `PORT`: cổng HTTP, mặc định `3000`.

## Socket contract

Client gửi `connect-tiktok` với TikTok ID không có/hoặc có `@`.

Relay phát:

- `relay-status`: `ready`, `connecting`, `connected`, `error`.
- `live-event`: `{ type, data, at }`, type là `comment`, `join`, `gift` hoặc `follow`.

## Render

Trên Render, build command: `npm install`; start command: `npm start`. Thêm `EULERSTREAM_SIGN_API_KEY` trong Environment Variables.
