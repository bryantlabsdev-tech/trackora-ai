# Mobile release checklist

## Before each store submission

- [ ] Bump version in `package.json`, Android `versionCode`, iOS `CFBundleShortVersionString`
- [ ] `npm run build` with production `VITE_API_BASE_URL` (HTTPS)
- [ ] `npm run cap:sync`
- [ ] Test sign-in, one generation, copy form, Pro checkout (sandbox) on device
- [ ] Confirm `VITE_SENTRY_DSN` set for crash reporting (optional)
- [ ] Privacy Policy and Terms URLs load in app WebView (`/privacy`, `/terms`)

## Android

- [ ] Release build signed with upload key
- [ ] Play Console: store listing, content rating, data safety form aligned with [Privacy Policy](../src/components/PrivacyPolicyContent.tsx)

## iOS

- [ ] Archive in Xcode; TestFlight smoke test
- [ ] App Store Connect: privacy nutrition labels match data collection (auth, coaching text, billing)

## Post-release

- [ ] Monitor Sentry and Stripe webhooks for 24h
- [ ] `npm run metrics:summary` for generation volume
