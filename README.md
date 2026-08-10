# EulerStream TikTok LIVE Relay

The relay holds the EulerStream key; the Android app never receives it.

## Setup

1. Revoke any key previously exposed in chat and create a new one.
2. Create `relay/.env` with `EULERSTREAM_SIGN_API_KEY=...` (do not commit it).
3. Run `npm start`.

## Development

The app must use a relay URL reachable from its device. For a phone on the same Wi-Fi network, use your computer's LAN IP and port 3000. For a production APK, deploy the relay behind HTTPS/WSS.
