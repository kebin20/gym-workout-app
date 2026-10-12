# Startup profiling — v3.15.1

Progress → Data → Startup details → Startup breakdown shows on-device marks for document response, shell-to-module loading/evaluation, cached record/outbox recovery, unfinished-session/draft selection, usable logger, and the first server refresh. Marks are in memory only, recorded once per navigation; no telemetry or workout values are stored or transmitted. Stages can overlap and must not be summed. Server refresh is separate from the cached-startup milestone. iOS launch animation and pre-page web-process startup are outside these measurements.

Use the normal Home Screen icon for comparisons, after the current offline interface is verified. The install manifest already starts without a version query. Explicit `?v=` URLs intentionally await fresh network HTML and are not equivalent to a cached Home Screen cold launch. Do not clear caches between normal cold-launch measurements: that tests a different, uncached scenario and can affect device-only drafts.

Backup and Google Sheet controllers load on action rather than at startup. The small existing dialog state stays in WorkoutApp so navigation and previews remain compatible. Sheet-import refresh uses the authoritative, programme-scoped refresh path rather than replacing pending overlays manually. Raw device recovery stays eager so it can be used offline even if optional chunks have never loaded.

The timer engine, persisted deadline recovery, completion delivery, wake lock, and gesture-time sound preparation remain eager. Only alert settings/permission/test UI is deferred. Settings warm at idle after the first usable-logger mark; failures are ignored until opened, where a reconnect message leaves core timer controls available. Browser-controlled suspension and lock-screen delivery are unchanged.

The broader completion-index rewrite is deferred pending device traces. Active programme history is bounded and archived programmes already load separately; changing startup selection without measured benefit risks reintroducing wrong-week behavior.

Verify with TypeScript, a production build, and `npm run test:regression`. Compare the actual production startup graph against the v3.15.0 baseline (638,016 raw bytes / 184,669 gzip estimate across 33 JS/CSS assets). Compression estimates do not establish actual transfer sizes or iPhone launch-time gains. Physical-device verification remains necessary.
