# Authenticated isolated previews

After bootstrapping an isolated worktree, start its authenticated development preview with an explicit environment source from another checkout of the same repository:

```bash
npm run dev:isolated-preview -- \
  --env-source=/absolute/path/to/PokeNotesV2 \
  --port=3313
```

The launcher uses Next.js's supported `@next/env` loader, then passes the resulting environment directly to `next dev`. It does not use Node preload or `--env-file` flags, so Next child workers inherit ordinary environment values rather than rejected `NODE_OPTIONS`. It binds only to loopback and refuses port 3000, which remains owned by the primary PokeNotes checkout.

The source must be an absolute, non-symlinked checkout of this Git repository. Every development `.env*` file Next would load must be ignored, untracked, regular, and private to the current user. Required paired-login settings must already exist. The launcher never creates or changes test users, secrets, environment files, Supabase links, or browser state, and it logs file counts rather than keys or values.

Use the existing local auth state without copying it into the isolated worktree:

```bash
./node_modules/.bin/agent-browser \
  --session pokenotes-isolated-check-$(date +%s) \
  --state /absolute/path/to/PokeNotesV2/.agent-browser/pokenotes-local-auth.json \
  --allowed-domains localhost,127.0.0.1 \
  open http://localhost:3313/logs
```

Confirm both the visible protected page and final URL. If the saved state redirects to `/login`, refresh that existing ignored state through the repository auth workflow; never copy, commit, or regenerate credentials in the isolated worktree.
