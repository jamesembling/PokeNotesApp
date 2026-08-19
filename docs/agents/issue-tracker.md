# Notion Issue Tracker

Issues and specifications live in the **PokeNotesV2 Issue Board**. Use the connected Notion integration and resolve the board by title.

## Read before write

1. Resolve the board and inspect its current property schema and values.
2. Fetch an existing issue before editing it.
3. Preserve its properties, workflow, and discussion history.
4. Apply only property values present in the current schema. Report a missing property or value as a schema mismatch.
5. For active triage, set exactly one `Category` and one `Triage State` using `docs/agents/triage-labels.md`.

Deletion requires an explicit user request naming the issue page.

## Operations

- **Publish:** Create one board page using the current title property and schema.
- **Fetch:** Find the referenced board page and return its current properties and content.
- **Update:** Append durable findings and decisions while preserving the existing discussion.
- **Triage:** Set both fields using `docs/agents/triage-labels.md`.

`Status` remains the separate delivery lifecycle: `Backlog`, `Ready`, `In Progress`, `Blocked`, `Review`, or `Resolved`. When listing work ready for pickup, exclude pages whose `Status` is `Resolved`. Historical resolved pages that predate this workflow may omit `Triage State`; do not invent a former readiness state solely to backfill them.

An operation is complete when the returned page shows the intended content and properties in the current board schema.

## Wayfinder

For `/wayfinder`:

- **Map**: one board page representing the overall effort, with Notes, Decisions-so-far, and Fog sections.
- **Child ticket**: one board page per research, prototype, grilling, or implementation task, linked back to its map.
- **Blocking**: record blocking relationships using an existing relation property when available. Otherwise, add a clearly labelled `Blocked by` section linking to the blocker pages.
- **Frontier**: select the first open, unblocked, and unclaimed child in the map's stated order.
- **Claim**: assign the issue or mark it claimed using the board's existing schema before beginning work.
- **Resolve**: append the answer or implementation result, mark the issue resolved using the existing status workflow, and add a context pointer to the map's Decisions-so-far.
