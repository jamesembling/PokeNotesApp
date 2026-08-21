# Test Strategy

Treat the suite as a confidence system. A passing test count is useful only when each case protects a distinct failure class through an appropriate observable seam.

## Admission

Add or retain a test when it protects at least one durable behavior:

- a product invariant or acceptance criterion;
- a meaningful boundary or state transition;
- a failure, retry, concurrency, permission, or ownership class;
- an integration contract whose failure would escape cheaper coverage;
- an operational policy where repository text or configuration is itself the executable contract.

A review finding earns a regression test only when the test can go red for the underlying defect. Review provenance stays in the issue, pull request, commit, or blame history.

## Placement and naming

Place a new case in the existing file that owns the production seam. Create a new file only when the change introduces a genuinely new subsystem, public boundary, or test level.

Name files and cases after durable behavior. Names based on PR or issue numbers, review rounds, fixes, corrections, quick wins, priorities, implementation phases, or agent handoffs are temporary artifacts and must be consolidated before merge.

## Evidence level

Use the cheapest seam that observes the same contract:

- Pure functions and domain state use direct module tests with independent expected values.
- Server actions and service adapters use their public inputs, outputs, mutations, and failure results.
- React behavior uses rendered interaction and accessibility queries.
- Critical authenticated journeys use browser checks.
- RLS, migrations, locks, triggers, grants, rollback, and concurrency use a disposable executable database boundary.
- Source-text assertions are reserved for contracts that are inherently textual: configuration, generated artifacts, migration ordering, workflow policy, or deliberate architectural bans that lack an executable boundary.

Source text containing a helper name, JSX shape, Tailwind class, call count, SQL phrase, or implementation branch is not evidence that the associated behavior works. Do not label source-shape checks as performance, accessibility, workflow, or database-behavior tests.

## Feature planning

Before implementation, map the feature's critical journeys and risks to the smallest useful set of tests. Cover distinct equivalence classes rather than every code branch or review comment. Cross-cutting changes may justify many cases, but the test plan must explain the seams and failure classes they buy.

Database-sensitive work follows `docs/migration-release.md`. Authenticated state-changing browser journeys use the resettable synthetic environment in `docs/agents/local-e2e.md` and follow the `pokenotes-browser-auth` skill when available.

## Browser journeys and fixture data

Keep browser coverage as a small set of coherent user journeys rather than one test per button, field, review comment, or fixture. A journey may cover several interactions when they naturally build on the same state, but it must retain clear checkpoints at important save, reload, permission, and destructive boundaries.

Reset the local E2E database before a full run. Seed only durable starting states that several journeys need; create one-off state through the UI inside the owning journey. Never use production account data as browser-test fixture data.

## Pull-request consolidation

Before merge:

1. Inspect added test files, cases, and lines alongside the production diff.
2. Merge overlapping cases and remove superseded assertions.
3. Move durable regressions into behavior-owned files.
4. Remove scratch tests and review-, PR-, issue-, or phase-labelled files.
5. Confirm each remaining case can fail for the defect it claims to detect.
6. Record which critical seams remain unverified, especially UI and database boundaries.

The suite is consolidated when every new case has one clear owner and failure class, no review history remains encoded in its structure, and broader evidence is not being substituted with a larger count of cheaper tests.
