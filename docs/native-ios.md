# Bundled iOS prototype (not ready for personal workout logging)

Developed on `codex/fast-start-capacitor` and included in the v3.13.1 web release with user approval. The cached-web startup improvement is ready to ship; the native foundation remains guarded and must not be distributed as a usable workout logger until the storage decision and device acceptance tests below are complete. See [rollback notes](rollback.md) for the preserved pre-release source and deployment.

## What is implemented

- The installed web app returns a cached root shell immediately, with background refresh. Explicit `?v=` refreshes and first installs remain network-first. Sign-in routes and APIs never use the shell cache; redirected sign-in pages never overwrite it.
- A standalone Vite build reuses the existing React logger, lazy views, styles and v9 assets without the server framework. `capacitor.config.ts` points to `dist-mobile`, not a remote `server.url`.
- Capacitor 8.5.2 iOS project with Swift Package Manager, scene lifecycle support, existing Liftline app artwork, and a quiet launch background. The splash is released at the enabled-logger milestone, with a four-second error fallback.
- Native resume events reconcile the existing deadline timer instead of creating another engine.
- The web build does not import Capacitor. Bundled clients skip service-worker registration.

## Blocking decision: where native records live

The existing `/api/*` routes are protected by the Site's private hosting gate. Relative URLs in `capacitor://localhost` do **not** point to that backend, and a bundled app does not inherit Safari's authenticated session.

Choose either:

1. **Local-only:** durable device storage, no login, and import/export of the existing JSON backup format. Cloud/Google Sheet synchronization would not be available in this mode; retain it unchanged in the web app.
2. **Private cloud:** explicit secure provisioning/authenticated transport, while keeping the Site owner-only. Do not embed a service credential in JavaScript, a native binary, configuration, or Git. Do not make the private Site public to avoid login.

Until this is resolved, native devices show a setup guard instead of a logger that could falsely accept unsavable workouts. Browser client previews and the isolated test fixture exercise the shared UI only. They are not evidence of a working native data connection.

## Build and install after storage is implemented

Use Node >=22.13.0, full Xcode 26+ (not just Command Line Tools), an iOS simulator and/or a development-signed iPhone. Signing team selection is personal and is intentionally not committed.

```sh
npm ci
npm run build:mobile
npm run ios:sync
npm run ios:open
```

Select your development team and target iPhone in Xcode. Build/run there. Do not install this prototype as your sole workout tracker yet. App removal can delete local app data.

## Automated checks and launch comparison

```sh
node --test scripts/test-native-bundle.mjs scripts/test-workout-reliability.mjs scripts/test-day-report-alerts.mjs
npx tsc --noEmit --incremental false
npm run build
npm run build:mobile
```

For an isolated browser comparison, build the mobile client, run `node scripts/launch-fixture-server.mjs`, then launch an isolated headless Chrome with `--remote-debugging-port=9343 --user-data-dir=<temporary-directory>` and run `node scripts/test-launch-browser.mjs`.

This uses synthetic records, real API handlers in an in-memory database, and the same compiled UI for original/updated shell strategies. No production records or private credentials are used. The baseline worker is read from the pinned pre-release commit, so later changes to `main` cannot silently replace the original strategy.

The test closes/reopens five documents per variant, checks restored drafts and mobile overflow, tests both PWAs with networking disabled, and reloads the bundled client with APIs blocked. The “bundle” case serves local compiled assets over loopback: it does **not** measure WKWebView creation, iOS process startup, signing, or force-quitting a real device.

Measured on this Mac with Chrome, 7 October 2026 (five repeat document launches, 1,500ms artificial HTML-server delay):

| Client path                                    | Median to enabled logger |         Range |
| ---------------------------------------------- | -----------------------: | ------------: |
| Original installed-PWA strategy                |                  1,238ms | 1,107–1,887ms |
| Updated cached-PWA strategy                    |                     79ms |      77–329ms |
| Bundled client served locally with fixture API |                    101ms |      71–145ms |

This isolates the removed network wait, not a universal speed promise. The original worker uses the same compiled UI in this comparison; it is not a measurement of the live production site's full server/auth/CDN behaviour. Both production web and mobile client builds, TypeScript, Capacitor sync, and 35 automated checks passed. Native compilation and signing were not attempted without full Xcode. `npm audit --omit=dev` reported 21 advisories in the pre-existing web dependency tree and none named for the added Capacitor runtime packages; broad dependency upgrades are outside this branch's scope.

## Required iPhone acceptance checks before native distribution

- Launch offline on a fresh install, and repeat after importing existing records.
- Log/undo/edit a workout; force-quit and reopen; verify all saved sets, notes, RIR, session edits and unfinished drafts.
- Test Holiday records, phase/week startup selection, backup restore, PDF export and share/file handling. Web DOM downloads need real-device validation in a native WebView.
- Start a rest timer, background/lock the device, reopen and verify deadline/pause behaviour. Web notifications are not a substitute for native scheduled notifications; validate or implement native alert transport separately.
- Check portrait/landscape, safe areas, numeric keyboard and navigation on the actual iPhone.
- Compare 10 cold launches and 10 warm resumes against the installed PWA on the same device, with the same records and network conditions. Record time from tap to usable logger, not just splash disappearance; report medians and ranges.

Full native compile, simulator launch, device opening/closing and native data/alert/export behaviour remain unverified: only Command Line Tools were available during this implementation.
