#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process"
import { lstatSync, realpathSync } from "node:fs"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import nextEnv from "@next/env"

const scriptPath = fileURLToPath(import.meta.url)
const defaultRepositoryRoot = resolve(dirname(scriptPath), "..")
const developmentEnvFiles = [
  ".env.development.local",
  ".env.local",
  ".env.development",
  ".env",
]
const requiredEnvironment = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "POKE_NOTES_LOCAL_LOGIN_CODE",
  "POKE_NOTES_TEST_LOGIN_EMAIL",
  "POKE_NOTES_TEST_LOGIN_PASSWORD",
]

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
}

function gitSucceeds(root, args) {
  try {
    git(root, args)
    return true
  } catch {
    return false
  }
}

function commonGitDirectory(root) {
  return realpathSync(git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]))
}

export function validatePreviewPort(value) {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("--port must be an integer from 1024 through 65535")
  }
  if (port === 3000) {
    throw new Error("Port 3000 is reserved for the primary PokeNotes checkout")
  }
  return port
}

export function validateEnvironmentSource({
  repositoryRoot = defaultRepositoryRoot,
  environmentSource,
} = {}) {
  if (!environmentSource || !isAbsolute(environmentSource)) {
    throw new Error("--env-source must be an explicit absolute checkout path")
  }

  const requestedState = lstatSync(environmentSource)
  if (!requestedState.isDirectory() || requestedState.isSymbolicLink()) {
    throw new Error("--env-source must be a real checkout directory, not a symlink")
  }

  const sourceRoot = realpathSync(environmentSource)
  const targetRoot = realpathSync(repositoryRoot)
  if (sourceRoot === targetRoot) {
    throw new Error("--env-source must be a separate checkout, not the isolated worktree")
  }
  if (commonGitDirectory(sourceRoot) !== commonGitDirectory(targetRoot)) {
    throw new Error("--env-source must be another checkout of this Git repository")
  }

  const approvedFiles = []
  for (const name of developmentEnvFiles) {
    const path = join(sourceRoot, name)
    let state
    try {
      state = lstatSync(path)
    } catch (error) {
      if (error?.code === "ENOENT") continue
      throw error
    }

    if (!state.isFile() || state.isSymbolicLink()) {
      throw new Error(`${name} must be a regular file, not a symlink or special file`)
    }
    if ((state.mode & 0o077) !== 0) {
      throw new Error(`${name} must not be readable or writable by group or other users`)
    }

    const relativePath = relative(sourceRoot, path)
    if (gitSucceeds(sourceRoot, ["ls-files", "--error-unmatch", "--", relativePath])) {
      throw new Error(`${name} is tracked; preview environment sources must remain ignored`)
    }
    if (!gitSucceeds(sourceRoot, ["check-ignore", "--quiet", "--", relativePath])) {
      throw new Error(`${name} is not ignored by the source checkout`)
    }
    approvedFiles.push(name)
  }

  if (approvedFiles.length === 0) {
    throw new Error("The approved source checkout has no ignored development environment files")
  }

  return { approvedFiles, sourceRoot }
}

export function preparePreviewEnvironment({
  repositoryRoot = defaultRepositoryRoot,
  environmentSource,
  port,
} = {}) {
  const previewPort = validatePreviewPort(port)
  const { approvedFiles, sourceRoot } = validateEnvironmentSource({
    repositoryRoot,
    environmentSource,
  })

  if (/(?:^|\s)--(?:env-file|require|r)(?:=|\s)/.test(process.env.NODE_OPTIONS || "")) {
    throw new Error("NODE_OPTIONS contains an unsupported environment-loading flag")
  }

  const quietLog = { info() {}, error() {} }
  const { combinedEnv, loadedEnvFiles } = nextEnv.loadEnvConfig(
    sourceRoot,
    true,
    quietLog,
    true,
  )
  const loadedNames = loadedEnvFiles.map(({ path }) => path)
  if (loadedNames.some((name) => !approvedFiles.includes(name))) {
    throw new Error("Next.js loaded an environment file outside the approved source set")
  }

  const sourceKeys = new Set(loadedEnvFiles.flatMap(({ env }) => Object.keys(env)))
  for (const key of requiredEnvironment) {
    if (!sourceKeys.has(key) || !combinedEnv[key]) {
      throw new Error(`Approved environment is missing required key ${key}`)
    }
  }
  if (combinedEnv.POKE_NOTES_ENABLE_TEST_LOGIN !== "1") {
    throw new Error("Approved environment does not enable the development-only paired login")
  }

  const loopbackHosts = [
    `localhost:${previewPort}`,
    `127.0.0.1:${previewPort}`,
    `[::1]:${previewPort}`,
  ]
  const configuredHosts = String(combinedEnv.POKE_NOTES_LOCAL_LOGIN_HOSTS || "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean)

  return {
    environment: {
      ...combinedEnv,
      NODE_ENV: "development",
      PORT: String(previewPort),
      POKE_NOTES_LOCAL_LOGIN_HOSTS: Array.from(
        new Set([...configuredHosts, ...loopbackHosts]),
      ).join(","),
    },
    loadedNames,
    port: previewPort,
    sourceRoot,
  }
}

export async function startIsolatedPreview({
  repositoryRoot = defaultRepositoryRoot,
  environmentSource,
  port,
  spawnCommand = spawn,
} = {}) {
  const prepared = preparePreviewEnvironment({ repositoryRoot, environmentSource, port })
  const nextCli = join(repositoryRoot, "node_modules", "next", "dist", "bin", "next")
  const child = spawnCommand(
    process.execPath,
    [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(prepared.port)],
    {
      cwd: repositoryRoot,
      env: prepared.environment,
      stdio: "inherit",
    },
  )

  const forwardInterrupt = () => child.kill("SIGINT")
  const forwardTermination = () => child.kill("SIGTERM")
  process.once("SIGINT", forwardInterrupt)
  process.once("SIGTERM", forwardTermination)

  try {
    return await new Promise((resolvePromise, reject) => {
      child.once("error", reject)
      child.once("exit", (code, signal) => {
        if (signal && signal !== "SIGINT" && signal !== "SIGTERM") {
          reject(new Error(`Isolated preview was terminated by ${signal}`))
        } else {
          resolvePromise(code ?? 0)
        }
      })
    })
  } finally {
    process.removeListener("SIGINT", forwardInterrupt)
    process.removeListener("SIGTERM", forwardTermination)
  }
}

function parseArguments(argv) {
  const values = new Map()
  for (const argument of argv) {
    const separator = argument.indexOf("=")
    if (separator === -1) {
      throw new Error(`Arguments must use --name=value syntax: ${argument}`)
    }
    values.set(argument.slice(0, separator), argument.slice(separator + 1))
  }
  for (const key of values.keys()) {
    if (key !== "--env-source" && key !== "--port") {
      throw new Error(`Unsupported argument ${key}`)
    }
  }
  return {
    environmentSource: values.get("--env-source"),
    port: values.get("--port"),
  }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  try {
    const options = parseArguments(process.argv.slice(2))
    const prepared = validateEnvironmentSource({ environmentSource: options.environmentSource })
    console.log(
      `Starting isolated preview from ${prepared.approvedFiles.length} approved ignored environment file(s); values are not logged.`,
    )
    process.exitCode = await startIsolatedPreview(options)
  } catch (error) {
    console.error(`Isolated preview failed: ${error.message}`)
    process.exitCode = 1
  }
}
