# Trackora on Android & iOS (Capacitor)

The React UI ships inside a native WebView. **Your OpenAI API key stays only in the Express server** (`.env` on a machine you control). The mobile app calls the same `/api/ai` route over the network—it never embeds secrets.

## What you need

- **Node.js** (already used for the web app)
- **Android:** [Android Studio](https://developer.android.com/studio) (SDK, emulator or USB device)
- **iOS (Mac only):** Xcode, [CocoaPods](https://cocoapods.org/) (`brew install cocoapods` or `sudo gem install cocoapods` if needed)

If `pod install` or `npm run cap:sync` fails with a CocoaPods **Unicode / ASCII-8BIT** error, your terminal locale is not UTF-8. The `cap:sync` script sets `LANG` and `LC_ALL` to `en_US.UTF-8` for that step; you can also add `export LANG=en_US.UTF-8` and `export LC_ALL=en_US.UTF-8` to your shell profile.

## Point the app at your API

Capacitor apps do **not** use the Vite dev proxy. Set the API origin **without a trailing slash**:

1. Copy `.env.example` → `.env.local` (or add to `.env`)
2. Set `VITE_API_BASE_URL=http://YOUR_LAN_IP:3001` (example)
3. Run `npm run build` then `npm run cap:sync` so Vite bakes the value into `dist/`

On the **server** `.env`, set `LISTEN_HOST=0.0.0.0` so devices on your Wi‑Fi can reach `http://YOUR_LAN_IP:3001`. Keep `OPENAI_API_KEY` server-side only.

**HTTPS / iOS:** iOS blocks plain HTTP by default. For production, put the API behind HTTPS. For local dev you may add an App Transport Security exception in Xcode (debug only).

## Scripts

| Script            | What it does                                      |
| ----------------- | ------------------------------------------------- |
| `npm run build`   | Vite build → `dist/`                              |
| `npm run cap:sync`| `build` + copy web assets into native projects    |
| `npm run cap:open:android` | Opens Android Studio                       |
| `npm run cap:open:ios`     | Opens Xcode                                |
| `npm run cap:android`      | Sync + open Android Studio                 |
| `npm run cap:ios`          | Sync + open Xcode                          |

## Commands

**Android**

```bash
npm run cap:android
```

In Android Studio: pick a device/emulator → Run.

**iOS (Mac)**

```bash
cd ios/App && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install && cd ../..
npm run cap:ios
```

In Xcode: select a simulator or device → Run. First time, open `ios/App/App.xcworkspace` if CocoaPods created it.

## Regenerating native projects

If you delete `android/` or `ios/`, run:

```bash
npm run build
npx cap add android
npx cap add ios
npx cap sync
```
