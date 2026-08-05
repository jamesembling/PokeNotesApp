import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import {
  preparePreviewEnvironment,
  validateEnvironmentSource,
  validatePreviewPort,
} from "../scripts/start-isolated-preview.mjs"

// Git exports repository-local variables while hooks run. They must not leak
// into the temporary repositories used by these tests. This list is Git's
// documented `rev-parse --local-env-vars` output; normal system environment
// such as PATH and HOME remains available to each subprocess.
const localGitEnvironmentNames = [
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_CONFIG",
  "GIT_CONFIG_PARAMETERS",
  "GIT_CONFIG_COUNT",
  "GIT_OBJECT_DIRECTORY",
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_IMPLICIT_WORK_TREE",
  "GIT_GRAFT_FILE",
  "GIT_INDEX_FILE",
  "GIT_NO_REPLACE_OBJECTS",
  "GIT_REPLACE_REF_BASE",
  "GIT_PREFIX",
  "GIT_SHALLOW_FILE",
  "GIT_COMMON_DIR",
]

function gitEnvironment() {
  const environment = { ...process.env }
  for (const name of localGitEnvironmentNames) delete environment[name]
  return environment
}

function git(root, args) {
  execFileSync("git", ["-C", root, ...args], {
    env: gitEnvironment(),
    stdio: "ignore",
  })
}

function gitOutput(root, args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    env: gitEnvironment(),
  }).trim()
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "pokenotes-isolated-preview-test-"))
  git(root, ["init"])
  writeFileSync(join(root, ".gitignore"), ".env\n.env.*\n")
  writeFileSync(join(root, "tracked"), "fixture\n")
  git(root, ["add", ".gitignore", "tracked"])
  git(root, ["-c", "user.name=Codex", "-c", "user.email=codex@example.invalid", "commit", "-m", "fixture"])
  const source = join(root, "source")
  git(root, ["worktree", "add", "--detach", source, "HEAD"])
  return { root, source }
}

function writeEnvironment(source, overrides = {}) {
  const values = {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-anon",
    POKE_NOTES_ENABLE_TEST_LOGIN: "1",
    POKE_NOTES_LOCAL_LOGIN_CODE: "fixture-code",
    POKE_NOTES_LOCAL_LOGIN_HOSTS: "localhost:3000",
    POKE_NOTES_TEST_LOGIN_EMAIL: "codex@example.invalid",
    POKE_NOTES_TEST_LOGIN_PASSWORD: "fixture-password",
    NODE_OPTIONS: "--trace-warnings",
    ...overrides,
  }
  const contents = [
    ...Object.entries(values).map(([key, value]) => `${key}=${value}`),
    "",
  ].join("\n")
  writeFileSync(join(source, ".env.local"), contents, { mode: 0o600 })
  chmodSync(join(source, ".env.local"), 0o600)
}

test("loads an explicit ignored same-repository source into the child environment", (t) => {
  const { root, source } = fixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeEnvironment(source)

  const result = preparePreviewEnvironment({
    repositoryRoot: root,
    environmentSource: source,
    port: 3313,
  })

  assert.deepEqual(result.loadedNames, [".env.local"])
  assert.equal(result.environment.NEXT_PUBLIC_SUPABASE_ANON_KEY, "fixture-anon")
  assert.equal(result.environment.PORT, "3313")
  assert.match(result.environment.POKE_NOTES_LOCAL_LOGIN_HOSTS, /127\.0\.0\.1:3313/)
  assert.equal(Object.hasOwn(result.environment, "NODE_OPTIONS"), false)
  assert.equal(process.execArgv.some((arg) => /env-file|dotenv/.test(arg)), false)
})

test("fixture repositories ignore inherited hook-local Git environment", (t) => {
  const protectedRoot = mkdtempSync(join(tmpdir(), "pokenotes-protected-repository-test-"))
  git(protectedRoot, ["init"])
  writeFileSync(join(protectedRoot, "protected"), "must remain unchanged\n")
  git(protectedRoot, ["add", "protected"])
  git(protectedRoot, [
    "-c",
    "user.name=Codex",
    "-c",
    "user.email=codex@example.invalid",
    "commit",
    "-m",
    "protected",
  ])
  git(protectedRoot, ["config", "codex.fixture-guard", "protected"])
  const protectedHead = gitOutput(protectedRoot, ["rev-parse", "HEAD"])

  const previousDirectory = process.env.GIT_DIR
  const previousWorkTree = process.env.GIT_WORK_TREE
  t.after(() => {
    if (previousDirectory === undefined) delete process.env.GIT_DIR
    else process.env.GIT_DIR = previousDirectory
    if (previousWorkTree === undefined) delete process.env.GIT_WORK_TREE
    else process.env.GIT_WORK_TREE = previousWorkTree
  })
  t.after(() => rmSync(protectedRoot, { recursive: true, force: true }))
  process.env.GIT_DIR = join(protectedRoot, ".git")
  process.env.GIT_WORK_TREE = protectedRoot

  const { root } = fixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  git(root, ["config", "codex.fixture-guard", "fixture"])
  git(root, ["add", "tracked"])

  assert.equal(gitOutput(root, ["rev-parse", "--is-inside-work-tree"]), "true")
  assert.equal(gitOutput(root, ["config", "codex.fixture-guard"]), "fixture")
  assert.equal(gitOutput(protectedRoot, ["rev-parse", "HEAD"]), protectedHead)
  assert.equal(gitOutput(protectedRoot, ["config", "codex.fixture-guard"]), "protected")
  assert.equal(gitOutput(protectedRoot, ["status", "--porcelain"]), "")
})

test("approved source values override harmless ambient collisions", (t) => {
  const { root, source } = fixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeEnvironment(source)

  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const previousCode = process.env.POKE_NOTES_LOCAL_LOGIN_CODE
  const previousPath = process.env.PATH
  t.after(() => {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl
    if (previousCode === undefined) delete process.env.POKE_NOTES_LOCAL_LOGIN_CODE
    else process.env.POKE_NOTES_LOCAL_LOGIN_CODE = previousCode
  })
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ambient.invalid"
  process.env.POKE_NOTES_LOCAL_LOGIN_CODE = "ambient-code"

  const result = preparePreviewEnvironment({
    repositoryRoot: root,
    environmentSource: source,
    port: 3313,
  })

  assert.equal(result.environment.NEXT_PUBLIC_SUPABASE_URL, "https://example.invalid")
  assert.equal(result.environment.POKE_NOTES_LOCAL_LOGIN_CODE, "fixture-code")
  assert.equal(result.environment.PATH, previousPath)
  assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, "https://ambient.invalid")
  assert.equal(process.env.POKE_NOTES_LOCAL_LOGIN_CODE, "ambient-code")
})

test("uses Next development environment file precedence for duplicate keys", (t) => {
  const { root, source } = fixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeEnvironment(source, {
    NEXT_PUBLIC_SUPABASE_URL: "https://local.invalid",
    POKE_NOTES_LOCAL_LOGIN_CODE: "local-code",
  })
  writeFileSync(
    join(source, ".env.development.local"),
    [
      "NEXT_PUBLIC_SUPABASE_URL=https://development-local.invalid",
      "POKE_NOTES_LOCAL_LOGIN_CODE=development-local-code",
      "",
    ].join("\n"),
    { mode: 0o600 },
  )

  const result = preparePreviewEnvironment({
    repositoryRoot: root,
    environmentSource: source,
    port: 3313,
  })

  assert.deepEqual(result.loadedNames, [".env.development.local", ".env.local"])
  assert.equal(
    result.environment.NEXT_PUBLIC_SUPABASE_URL,
    "https://development-local.invalid",
  )
  assert.equal(
    result.environment.POKE_NOTES_LOCAL_LOGIN_CODE,
    "development-local-code",
  )
})

test("reserves the primary checkout port", () => {
  assert.throws(() => validatePreviewPort(3000), /reserved for the primary PokeNotes checkout/)
  assert.equal(validatePreviewPort(3313), 3313)
})

test("rejects missing, permissive, and symlinked environment sources", (t) => {
  const { root, source } = fixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))

  assert.throws(
    () => validateEnvironmentSource({ repositoryRoot: root, environmentSource: source }),
    /no ignored development environment files/,
  )

  writeEnvironment(source)
  chmodSync(join(source, ".env.local"), 0o644)
  assert.throws(
    () => validateEnvironmentSource({ repositoryRoot: root, environmentSource: source }),
    /must not be readable or writable by group or other users/,
  )

  rmSync(join(source, ".env.local"))
  writeFileSync(join(source, "secret-source"), "fixture\n", { mode: 0o600 })
  symlinkSync(join(source, "secret-source"), join(source, ".env.local"))
  assert.throws(
    () => validateEnvironmentSource({ repositoryRoot: root, environmentSource: source }),
    /must be a regular file/,
  )
})

test("rejects an environment checkout from another repository", (t) => {
  const first = fixture()
  const second = fixture()
  t.after(() => rmSync(first.root, { recursive: true, force: true }))
  t.after(() => rmSync(second.root, { recursive: true, force: true }))
  writeEnvironment(second.source)

  assert.throws(
    () =>
      validateEnvironmentSource({
        repositoryRoot: first.root,
        environmentSource: second.source,
      }),
    /another checkout of this Git repository/,
  )
})

test("rejects a nested directory inside an otherwise valid source worktree", (t) => {
  const { root, source } = fixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const nestedSource = join(source, "nested")
  mkdirSync(nestedSource)
  writeEnvironment(nestedSource)

  assert.throws(
    () => validateEnvironmentSource({ repositoryRoot: root, environmentSource: nestedSource }),
    /must be the top-level directory of a separate Git worktree/,
  )
})

test("rejects a hard-linked environment file", (t) => {
  const { root, source } = fixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const otherPath = join(source, "hardlink-source")
  writeFileSync(otherPath, "fixture\n", { mode: 0o600 })
  linkSync(otherPath, join(source, ".env.local"))

  assert.throws(
    () => validateEnvironmentSource({ repositoryRoot: root, environmentSource: source }),
    /must not be hard-linked to another filesystem path/,
  )
})

test("rejects an environment file replaced between validation and secure open", (t) => {
  const { root, source } = fixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeEnvironment(source)
  const replacementPath = join(source, ".env.local.replacement")
  writeFileSync(replacementPath, "HARMLESS_REPLACEMENT=1\n", { mode: 0o600 })
  let replaced = false

  assert.throws(
    () =>
      validateEnvironmentSource({
        repositoryRoot: root,
        environmentSource: source,
        beforeEnvironmentOpen({ name, path }) {
          if (name !== ".env.local" || replaced) return
          replaced = true
          rmSync(path)
          renameSync(replacementPath, path)
        },
      }),
    /changed between validation and secure read/,
  )
})

test("rejects the isolated checkout itself as the environment source", (t) => {
  const { root } = fixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeEnvironment(root)

  assert.throws(
    () => validateEnvironmentSource({ repositoryRoot: root, environmentSource: root }),
    /must be a separate checkout/,
  )
})
