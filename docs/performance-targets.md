# Performance Targets

These are the working benchmarks for production route work on the Vercel app.

## Current Pain Points

- `/logs -> /logs/:id`: 5075ms, slowest resource `/logs/:id` 4116ms.
- Hard load `/logs`: 3352ms, slowest resource `/logs/:id` 2442ms.
- Hard load `/calculator`: 3352ms, slowest resource `/calculator` 2817ms.
- `/logs -> /logs/:id`: 1873ms, slowest resource `/logs/:id` 1487ms.
- `/tournaments/:id -> /tournaments`: 1619ms.
- `/logs/:id -> /logs`: 1272ms.
- `/logs -> /decks`: 1214ms.
- `/stats -> /decks`: 1062ms.

## Targets

- Sidebar and navigation tap feedback: instant, under 100ms.
- Route shell visible: under 250ms.
- Main list pages usable: 500-700ms.
- Battle-log summary visible: 300-500ms.
- Full battle-log body loaded: 800-1200ms.
- Worst-case tail: under 1500ms, with no 3-5s route loads.

## Measurement Rule

Use production telemetry from `route_performance_events` and browser resource timing
against `https://poke-notes-app.vercel.app`. Localhost timings are useful for
regression checks, but they are not the benchmark for this work.
