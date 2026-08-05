import assert from "node:assert/strict"
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { bootstrapWorktree } from "../scripts/bootstrap-worktree.mjs"

const lock = {
  name: "bootstrap-fixture",
  lockfileVersion: 3,
  packages: {
    "": { name: "bootstrap-fixture", version: "1.0.0" },
    "node_modules/next": { version: "16.3.0" },
  },
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "pokenotes-bootstrap-test-"))
  await writeFile(join(root, "package.json"), '{"name":"bootstrap-fixture","version":"1.0.0"}\n')
  await writeFile(join(root, "package-lock.json"), `${JSON.stringify(lock)}\n`)
  return root
}

async function fakeInstall(_command, args, { cwd }) {
  assert.deepEqual(args, ["ci", "--no-audit", "--no-fund"])
  await mkdir(join(cwd, "node_modules", "next", "dist", "docs"), { recursive: true })
  await writeFile(join(cwd, "node_modules", "next", "package.json"), '{"version":"16.3.0"}\n')
}

test("bootstraps missing dependencies without copying secret-bearing state", async (t) => {
  const root = await fixture()
  t.after(() => rm(root, { recursive: true, force: true }))
  const protectedFiles = {
    ".env.local": "fixture-env\n",
    ".vercel/project.json": "fixture-vercel\n",
    "supabase/.temp/project-ref": "fixture-project\n",
    ".agent-browser/auth.json": "fixture-auth\n",
  }

  for (const [relativePath, contents] of Object.entries(protectedFiles)) {
    await mkdir(join(root, relativePath, ".."), { recursive: true })
    await writeFile(join(root, relativePath), contents)
  }

  const result = await bootstrapWorktree({ repositoryRoot: root, runCommand: fakeInstall })

  assert.equal(result.nextVersion, "16.3.0")
  for (const [relativePath, contents] of Object.entries(protectedFiles)) {
    assert.equal(await readFile(join(root, relativePath), "utf8"), contents)
  }
})

test("removes an external node_modules symlink before installing locally", async (t) => {
  const root = await fixture()
  const externalModules = await mkdtemp(join(tmpdir(), "pokenotes-external-modules-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  t.after(() => rm(externalModules, { recursive: true, force: true }))
  await writeFile(join(externalModules, "sentinel"), "do not remove\n")
  await symlink(externalModules, join(root, "node_modules"))

  await bootstrapWorktree({ repositoryRoot: root, runCommand: fakeInstall })

  assert.equal(await readFile(join(externalModules, "sentinel"), "utf8"), "do not remove\n")
  assert.equal((await lstat(join(root, "node_modules"))).isSymbolicLink(), false)
})

test("fails closed when the installed framework differs from the lockfile", async (t) => {
  const root = await fixture()
  t.after(() => rm(root, { recursive: true, force: true }))
  const installWrongVersion = async (_command, _args, { cwd }) => {
    await mkdir(join(cwd, "node_modules", "next", "dist", "docs"), { recursive: true })
    await writeFile(join(cwd, "node_modules", "next", "package.json"), '{"version":"16.2.6"}\n')
  }

  await assert.rejects(
    bootstrapWorktree({ repositoryRoot: root, runCommand: installWrongVersion }),
    /Next\.js version mismatch: lockfile=16\.3\.0, installed=16\.2\.6/,
  )
})

test("fails closed when bundled Next.js docs are missing", async (t) => {
  const root = await fixture()
  t.after(() => rm(root, { recursive: true, force: true }))
  const installWithoutDocs = async (_command, _args, { cwd }) => {
    await mkdir(join(cwd, "node_modules", "next"), { recursive: true })
    await writeFile(join(cwd, "node_modules", "next", "package.json"), '{"version":"16.3.0"}\n')
  }

  await assert.rejects(
    bootstrapWorktree({ repositoryRoot: root, runCommand: installWithoutDocs }),
    /Bundled Next\.js docs are unavailable/,
  )
})
