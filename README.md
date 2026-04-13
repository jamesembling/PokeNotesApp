# PokeNotesApp

## Local development

Start the app with:

```bash
npm run dev
```

If localhost starts showing missing chunk errors, half-styled pages, or random `Cannot find module './xyz.js'` errors, reset the Next.js build cache and restart the dev server:

```bash
npm run dev:reset
```

You can also do the steps manually:

```bash
npm run clean
npm run dev
```

When starting the dev server from Codex or another short-lived agent session, prefer a detached process so `localhost:3000` stays up across turns:

```bash
nohup npm run dev > /tmp/pokenotes-dev.log 2>&1 &
```

Then verify the server is up with:

```bash
curl -I http://127.0.0.1:3000
```

## Important note

Do not run `npm run build` at the same time as a live `npm run dev` server in this workspace.

Both commands write to the same [`.next`](/Users/jamesembling/Documents/Codex/workspaces/PokeNotesV2/.next) directory, which can leave the dev server serving mismatched or stale chunks.
