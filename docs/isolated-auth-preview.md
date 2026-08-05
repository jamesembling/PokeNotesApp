# Authenticated isolated previews

After bootstrapping an isolated worktree, start its authenticated development preview with an explicit environment source from another checkout of the same repository:

```bash
npm run dev:isolated-preview -- \
  --env-source=/absolute/path/to/PokeNotesV2 \
  --port=3313
```

The launcher securely opens each validated environment file once, verifies that its filesystem identity remains stable, and feeds those in-memory contents through Next.js's supported `@next/env` processing before passing the resulting environment directly to `next dev`. Names declared by that explicit source override matching ambient values, while duplicate names across source files retain Next's normal development-file precedence and unrelated process settings such as `PATH` remain available. It does not use Node preload or `--env-file` flags, so Next child workers inherit ordinary environment values rather than rejected `NODE_OPTIONS`. It binds only to loopback and refuses port 3000, which remains owned by the primary PokeNotes checkout.

The source must be the absolute top-level directory of a separate, non-symlinked worktree of this Git repository; nested directories are rejected. Every development `.env*` file Next would load must be ignored, untracked, regular, single-linked, and private to the current user. Required paired-login settings must already exist. The launcher clears `NODE_OPTIONS` before spawning Next so inherited or source-defined Node flags cannot cross the worker boundary. It never creates or changes test users, secrets, environment files, Supabase links, or browser state, and it logs file counts rather than keys or values.

Use the existing local auth state without copying it into the isolated worktree:

```bash
./node_modules/.bin/agent-browser \
  --session pokenotes-isolated-check-$(date +%s) \
  --state /absolute/path/to/PokeNotesV2/.agent-browser/pokenotes-local-auth.json \
  --allowed-domains localhost,127.0.0.1 \
  open http://localhost:3313/logs
```

Confirm both the visible protected page and final URL. If the saved state redirects to `/login`, refresh that existing ignored state through the repository auth workflow; never copy, commit, or regenerate credentials in the isolated worktree.
