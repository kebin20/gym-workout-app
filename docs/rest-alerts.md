# Rest alerts — v3.13.4

## Delivery behavior

- Foreground completions reacquire the current service-worker registration for up to four seconds instead of failing immediately during activation or an update.
- Only `InvalidStateError` (no active worker, a confirmed rejected request) permits a retry: at most two retries. Permission failures, other errors and uncertain submission timeouts never dispatch another request. The rest's stable notification tag is unchanged.
- A readiness promise resolving after its deadline cannot send an alert. Resetting, switching exercises, starting a newer timer, disabling alerts or revoking permission cancels a waiting completion notification before submission.
- Audio resumes an existing interrupted context best-effort, with an 800ms bound. Sound readiness does not block system notification submission. A timeout or cancelled rest cannot play a late in-app beep. Closed contexts are recreated on the next user-initiated Start/Test action.
- Completion reports whether in-app sound started or was unavailable, and whether the notification request was accepted, blocked, unavailable or unconfirmed. Acceptance does **not** prove a banner appeared or sound was audible.
- Returning to the app refreshes permission and preference state. Other-tab preference changes also reconcile it. Diagnostics are session-local; no telemetry or workout-data request is added.

## Limits preserved

This is not server-scheduled Web Push. The timer still runs in the page; iOS can suspend it when locked or backgrounded. Screen wake is best-effort. Completions more than 30 seconds late remain suppressed to avoid stale alarms. Apple controls banner, Focus, sound and Watch routing. No guaranteed locked-screen or Watch delivery is claimed.

Changing exercise cancels its previous rest, while leaving Today and reopening the same exercise preserves an intentionally started countdown. The prior v3.13.3 navigation fix remains included. Data schemas, authentication, native prototype and artwork are unchanged.

## Checks

```sh
npx tsc --noEmit --incremental false
npm run build
node --test scripts/test-rest-alert-reliability.mjs scripts/test-day-report-alerts.mjs scripts/test-workout-reliability.mjs scripts/test-startup-cache.mjs
```

The added tests cover delayed worker readiness, bounded inactive-worker retries, permission/ambiguous failures without retry, late readiness, cancellation, uncertain submission timeouts, interrupted/blocked/hung audio and closed-context recovery. The actual-engine regression also checks visible failure diagnostics, notification-off preferences, permission refresh and no redispatch on focus. Synthetic tests do not establish actual iPhone or Watch receipt.

On the iPhone, open the installed app, check Alerts settings and use Test alert. Compare a completion with Liftline visible against one after locking/switching apps. Record whether there was an in-app beep, a banner, and the displayed delivery message; these are separate signals. Do not clear app storage to troubleshoot notification delivery.

## Rollback

The preceding live source is `1d462f883b217d18d4ea7de600763d7281119087` (v3.13.3), owner-private Site version 83: `appgprj_6a960f4cd8e48191a0f0921debad3bbe~appgver_edec24e112c08191b6ee60b42688d307`. No database migration is needed to revert it. The existing GitHub backup branch remains unchanged.
