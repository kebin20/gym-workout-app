# Installed web-app startup — v3.13.2

## Changes

- A post-build step generates `dist/client/startup-assets.json` from the production bundler's browser, Today, layout-context and checkbox dependency graphs plus CSS. Each listed file must exist or the build fails. Optional Progress, Holiday, nutrition, PDF/font and diagnostics chunks are not precached by this list.
- The worker verifies the HTML build marker, manifest version, referenced script/style URLs and every cached/downloaded asset's content type before committing the replacement HTML. Bounded parallel requests and timeouts keep warming best-effort; asset warming never blocks an online document response.
- An interrupted install, sign-in redirect, quota failure or unavailable asset retains the previous root shell and assets. Only a verified replacement permits cleanup; two prior shell/asset pairs remain. Cache creation order, not lexical version sorting, determines retention. API and sign-in routes still bypass shell caching.
- Home Screen launches request persistent storage after the enabled-logger milestone during idle time (with a timer fallback). Unsupported APIs, denial and exceptions are harmless. D1 remains authoritative; this is not a replacement for backup, nor a guarantee against user-initiated deletion.
- Progress's aggregate personal-record scan and the closed session-summary record scan no longer run during Today startup. Existing record calculations and callbacks are preserved and execute when those surfaces are opened.
- Progress → Data → Startup details loads on demand and shows page-to-logger time, Home Screen mode, verified offline-interface status and granted/best-effort storage. It makes no telemetry request and reads no workout records.

## Verification

Use Node >=22.13.0:

```sh
npm run build
npx tsc --noEmit --incremental false
node --test scripts/test-startup-cache.mjs scripts/test-workout-reliability.mjs scripts/test-day-report-alerts.mjs
```

The suite covers complete installs, failed assets, redirected sign-in pages, mismatched manifests, malformed cached JavaScript, quota failures, previous-cache retention, preload reuse, optional persistent storage, deferred computation and the existing workout/draft/outbox/timer/PDF regressions.

For production-web browser fixtures, start the local production Worker on port 9350, then `node scripts/pwa-startup-fixture.mjs`. Launch a disposable headless Chrome profile on debugging port 9343 and run `node scripts/test-pwa-startup-browser.mjs`. All API handlers use synthetic records in an in-memory database. No production data or private credentials are used. Ports 9340/9341 serve the same current web build with the v3.13.1/current worker strategies; neither serves a native bundle.

Checks cover five document relaunches per strategy, recovered drafts, 393px overflow, offline reopen, every actually requested startup JS/CSS URL, denied persistence after readiness, the diagnostics dialog, and recovery after a deliberately failed critical asset followed by connectivity recovery.

The final controlled run on this Mac returned a 96ms median for both worker strategies, with the same current UI and a 1,500ms HTML-server delay. Five launches ranged from 79–894ms for v3.13.1 and 81–120ms for the new worker. An earlier run returned medians of 79ms and 96ms respectively. These small desktop samples do not establish an additional speed improvement: v3.13.1 already removed the network wait. The current changes primarily reduce cold-cache/update failures and remove unnecessary startup work. A synthetic 288-record phase's previously unconditional personal-record scan took about 1.7ms median on this Mac; Today now skips it. These are desktop measurements, not iPhone results. All 41 automated regression tests passed, along with the production-web browser checks.

## Actual iPhone check

1. Open the installed app online and allow its cache to finish warming. In Startup details, check “Current interface verified.” Do not clear storage or delete/reinstall the shortcut as routine maintenance; doing so can discard drafts and queued saves.
2. Close and reopen several times with the same data/network conditions. Read “Page to usable logger” after each launch and record a median and range. Compare an idle/terminated launch separately from a warm resume.
3. Repeat offline only after the interface is verified. Confirm the same unfinished week/day, drafts and saved history remain visible, and confirm queued saves upload after reconnecting.

The timing starts at page navigation, not the Home Screen tap. It excludes the iOS launch animation and time before WebKit creates the page. A screen recording is required to measure tap-to-usable-logger. No real iPhone cold-launch claim is made without those device checks. First installs, explicit `?v=` refreshes, evicted caches and expired private sessions can still require networking/sign-in.

## Deployment rollback

The preceding v3.13.1 source is `e826da60ad5e5989c5f96751083298b9df164bc3` on GitHub. Prior owner-private Site version 81 is `appgprj_6a960f4cd8e48191a0f0921debad3bbe~appgver_ac859a3b7ed48191b5bee52eb943344f`, from successful deployment `appgdep_6ac59f938bdc8191ae693c4d137f44f9` with environment revision 4. It can be redeployed without resetting workout data. The older source backup documented in [rollback notes](rollback.md) remains intact. No database migrations or access changes are part of this release.
