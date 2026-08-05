# Isolated worktree bootstrap

Run this once in every fresh implementation or detached-review worktree before reading framework guidance or collecting executable evidence:

```bash
node scripts/bootstrap-worktree.mjs
```

The command resolves the repository containing the script, so it works from any current directory and does not depend on a named branch. It:

- performs a clean `npm ci` from that worktree's committed `package-lock.json`;
- replaces existing dependency state and converts an external `node_modules` symlink into a local directory;
- verifies the installed Next.js version against the lockfile; and
- fails unless the required bundled Next.js docs exist at `node_modules/next/dist/docs/`.

This isolation is intentional. Never replace the local install with a `node_modules` symlink to another checkout: Turbopack rejects dependencies outside the worktree root, and stale shared dependencies can validate the wrong graph.

## Security boundary

Bootstrap manages dependencies only. It never copies or creates `.env*`, `.vercel/`, `.supabase/`, `supabase/.temp/`, `.agent-browser/`, auth state, credentials, user data, database links, or external resources. Environment and authenticated-preview setup are separate, explicitly authorized workflows.

`npm ci` requires package-registry access and a complete per-worktree install. The extra disk and install time are the cost of reproducible, independent evidence.

## Verification

After bootstrap, confirm the local dependency root and bundled guidance before running the task-specific gates:

```bash
test ! -L node_modules
test -d node_modules/next/dist/docs
node -p "require('./node_modules/next/package.json').version"
node --test tests/bootstrap-worktree.test.mjs
```
