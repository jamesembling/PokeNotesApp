# Performance Targets

These are the working benchmarks for production route work on the Vercel app. Production telemetry is the source of truth; measurements below are dated snapshots and must not be presented as permanent route characteristics.

## Latest Production Snapshot

Verified 14 July 2026 from aggregate-only `route_performance_events` data for the preceding seven days. Dynamic identifiers were normalized before grouping, and only journeys with at least five samples are shown.

| Journey | Type | Samples | p75 | p95 | Latest sample (UTC) |
| --- | --- | ---: | ---: | ---: | --- |
| `/logs` | Hard load | 83 | 540 ms | 3,564 ms | 14 July 14:38 |
| `/tournaments` | Hard load | 6 | 369 ms | 2,441 ms | 12 July 14:56 |
| `/calculator` | Hard load | 8 | 201 ms | 2,132 ms | 12 July 14:46 |
| `/decks` | Hard load | 10 | 840 ms | 1,518 ms | 11 July 23:45 |
| `/logs/:id` to `/logs` | App route | 11 | 209 ms | 621 ms | 14 July 13:27 |
| `/decks/:id` | Hard load | 9 | 391 ms | 472 ms | 11 July 23:17 |
| `/profile` | Hard load | 7 | 324 ms | 392 ms | 11 July 23:18 |
| `/stats` | Hard load | 5 | 250 ms | 389 ms | 11 July 23:19 |
| `/logs` to `/decks` | App route | 5 | 271 ms | 325 ms | 11 July 19:45 |
| `/logs` to `/logs/:id` | App route | 5 | 318 ms | 325 ms | 11 July 23:45 |

The `/logs` median-to-p75 experience is close to the list-page target, but its p95 is currently outside the worst-case target. The smaller hard-load groups also contain slow tails. These aggregates establish where to investigate; they do not identify the cause, device mix, or whether a single cold/network cohort dominates the tail.

The 11 July health-review snapshot remains valid for that narrower sample—67 `/logs` hard loads at p75 426 ms and p95 652 ms—but it must not be described as the current seven-day result.

## Targets

- Sidebar and navigation tap feedback: instant, under 100 ms.
- Route shell visible: under 250 ms.
- Main list pages usable: 500–700 ms.
- Battle Log summary visible: 300–500 ms.
- Full Battle Log body loaded: 800–1,200 ms.
- Worst-case tail: under 1,500 ms, with no recurring 3–5 second route loads.

## Measurement Rules

- Use production telemetry from `route_performance_events` and browser resource timing against `https://poke-notes-app.vercel.app`.
- State the measurement window, sample count, percentile, event type, and environment with every performance claim.
- Normalize dynamic route IDs before aggregation and do not expose user IDs, raw paths containing record IDs, logs, or other private content.
- Separate RUM, production journey-runner results, and localhost diagnostics. They answer different questions and must not be merged into one timing claim.
- Treat small samples as directional. Do not declare a regression fixed from one manual navigation or a low-volume percentile alone.

### Battle Logs bootstrap timeline

Successful `/api/logs/bootstrap` responses include `diagnostics.requestTimeline`, also available as JSON in the loaded page's `[data-route-bootstrap-timeline]` attribute. Capture it and the bootstrap Resource Timing entry after a natural slow visit, before reloading or making another bootstrap request. These additional fields are available in the response and page only; they are not stored in `route_performance_events`.

- `proxyRequestStartedAtEpochMs` and `routeStartedAtEpochMs` identify proxy and handler entry. The proxy timestamp follows ingress header sanitization and excludes platform work before proxy execution.
- `proxyAuthStartedMs`, `proxyAuthEndedMs`, and `proxyAuthMs` describe the proxy session check, relative to proxy entry. The existing `proxyAuthRefreshed` flag means Supabase wrote cookies, which can also happen when clearing a session; correlate Auth logs before claiming a successful token refresh. `proxyRequestCorrelationId` joins the forwarded request; the existing route correlation ID remains unchanged. `proxyRegion` identifies the proxy function's region when available; compare it with the route's existing `runtimeRegion`.
- `proxyToRouteMs` covers proxy entry through route entry. `proxyAuthEndToRouteMs` starts at the end of the proxy session check, so it includes remaining proxy work, dispatch, module loading, and any route startup. Neither value isolates a platform cold start. Both compare clocks in separate functions: negative values remain visible in JSON to expose clock skew.
- `routePreAuthMs` covers handler entry through the start of route authentication. `routeHandlerMs` ends at `routeResponsePreparedAtEpochMs`, before JSON serialization and response delivery.
- `processUptimeMs` is sampled at handler entry. Compare it with the existing `runtimeBootAgeMs`, which measures the age of the performance module rather than the server process. Neither alone proves the platform's cold-start classification.

`Server-Timing` exposes `bootstrap-pre-auth`, `bootstrap-handler`, `bootstrap-proxy-to-route`, and `bootstrap-proxy-auth-end-to-route` alongside existing auth/data metrics. Negative or unavailable cross-function intervals are omitted from the header. These intervals overlap; do not sum them. Browser waiting time can still include network and platform work outside all reported intervals. Do not subtract browser epoch timestamps from server epochs to attribute that remainder: the browser and server clocks are not synchronized.

For a repeatable authenticated production journey:

```sh
npm run perf:prod:auth # once, or when saved auth expires
npm run perf:prod
```

For an iPhone-sized production replay:

```sh
npm run perf:prod -- --viewport=390x844 --session=iphone-check
```

For quick local route/API triage:

```sh
npm run perf:probe
```

The local probe separates HTML page routes from JSON APIs and reports payload/parse information where applicable. Localhost timings are useful for regression diagnosis, but they are not the production benchmark.
