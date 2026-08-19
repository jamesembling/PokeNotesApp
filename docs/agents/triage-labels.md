# Triage Labels

The PokeNotesV2 Issue Board stores triage classification separately from its delivery lifecycle.

## Categories

Store exactly one value in `Category` for every actively triaged issue.

| Canonical role | Board value   | Meaning                     |
| -------------- | ------------- | --------------------------- |
| `bug`          | `bug`         | Existing behavior is broken |
| `enhancement`  | `enhancement` | New feature or improvement  |

## Triage states

Store exactly one active value in `Triage State`.

| Canonical role     | Board value        | Meaning                                  |
| ------------------ | ------------------ | ---------------------------------------- |
| `needs-triage`     | `needs-triage`     | Maintainer needs to evaluate this issue  |
| `needs-info`       | `needs-info`       | Waiting for more information             |
| `ready-for-agent`  | `ready-for-agent`  | Fully specified and ready for an agent   |
| `ready-for-human`  | `ready-for-human`  | Requires human implementation or action  |
| `wontfix`          | `wontfix`          | Will not be actioned                     |

`Status` tracks delivery separately. Historical pages already marked `Resolved` before this workflow was introduced may omit `Triage State`; do not label completed work `ready-for-agent` merely to fill the field.

Before applying a value, inspect the live board schema. If `Category`, `Triage State`, or the required value is missing, report the mismatch instead of creating or renaming tracker properties without approval.
