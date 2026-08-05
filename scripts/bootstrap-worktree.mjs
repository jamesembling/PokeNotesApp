#!/usr/bin/env node

import { createHash } from "node:crypto"
import { lstat, readFile, realpath, rm, stat } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const scriptPath = fileURLToPath(import.meta.url)
const defaultRepositoryRoot = resolve(dirname(scriptPath), "..")

async function pathState(path) {
  try {
    return await lstat(path)
  } catch (error) {
    if (error?.code === "ENOENT") return null
    throw error
  }
}

function run(command, args, options) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options })
    child.once("error", reject)
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} was terminated by ${signal}`))
      } else if (code !== 0) {
        reject(new Error(`${command} exited with status ${code}`))
      } else {
        resolvePromise()
      }
    })
  })
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"))
}

export async function bootstrapWorktree({
  repositoryRoot = defaultRepositoryRoot,
  npmCommand = process.platform === "win32" ? "npm.cmd" : "npm",
  runCommand = run,
} = {}) {
  const root = await realpath(repositoryRoot)
  const packagePath = join(root, "package.json")
  const lockPath = join(root, "package-lock.json")
  const modulesPath = join(root, "node_modules")

  await stat(packagePath)
  const lockContents = await readFile(lockPath)
  const lockHash = createHash("sha256").update(lockContents).digest("hex")
  const before = await pathState(modulesPath)

  if (before?.isSymbolicLink()) {
    console.log("Removing the unsupported node_modules symlink before the clean install.")
    await rm(modulesPath)
  } else if (before) {
    console.log("Replacing the existing dependency state from package-lock.json.")
  } else {
    console.log("Installing this worktree's dependencies from package-lock.json.")
  }

  console.log(`Lockfile SHA-256: ${lockHash}`)
  await runCommand(npmCommand, ["ci", "--no-audit", "--no-fund"], { cwd: root })

  const installedModules = await lstat(modulesPath)
  if (!installedModules.isDirectory() || installedModules.isSymbolicLink()) {
    throw new Error("npm ci did not create a local node_modules directory")
  }

  const lock = JSON.parse(lockContents.toString("utf8"))
  const expectedNextVersion = lock.packages?.["node_modules/next"]?.version
  const installedNext = await readJson(join(modulesPath, "next", "package.json"))
  if (!expectedNextVersion || installedNext.version !== expectedNextVersion) {
    throw new Error(
      `Next.js version mismatch: lockfile=${expectedNextVersion ?? "missing"}, installed=${installedNext.version}`,
    )
  }

  const docsPath = join(modulesPath, "next", "dist", "docs")
  const docs = await pathState(docsPath)
  if (!docs?.isDirectory()) {
    throw new Error(`Bundled Next.js docs are unavailable at ${docsPath}`)
  }

  console.log(`Worktree ready: local Next.js ${installedNext.version} with bundled docs.`)
  return { lockHash, nextVersion: installedNext.version, repositoryRoot: root }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  bootstrapWorktree().catch((error) => {
    console.error(`Worktree bootstrap failed: ${error.message}`)
    process.exitCode = 1
  })
}
