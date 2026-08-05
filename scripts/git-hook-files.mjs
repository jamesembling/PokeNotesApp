import { spawnSync } from "node:child_process";

const zeroSha = /^0+$/;

function lines(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function gitOutput(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false
  });

  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.status ?? 1}`;
    throw new Error(`git ${args.join(" ")} failed: ${detail}`);
  }

  return result.stdout.trim();
}

function changedFiles(base, tip, cwd) {
  return lines(
    gitOutput(
      ["diff", "--name-only", "--no-renames", "--diff-filter=ACMDT", `${base}..${tip}`],
      cwd
    )
  );
}

function targetDiffBase(localSha, targetMainSha, cwd) {
  if (!targetMainSha) {
    throw new Error("The remote main commit is required for safe pre-push classification.");
  }

  gitOutput(["cat-file", "-e", `${targetMainSha}^{commit}`], cwd);
  const base = gitOutput(["merge-base", localSha, targetMainSha], cwd);
  if (!base) {
    throw new Error(`No merge base found between ${localSha} and remote main ${targetMainSha}.`);
  }
  return base;
}

function sorted(values) {
  return [...new Set(values)].sort();
}

export function remoteMainSha(remote, { cwd = process.cwd() } = {}) {
  if (!remote) {
    throw new Error("The push remote is required to resolve its main branch safely.");
  }

  const result = gitOutput(
    ["ls-remote", "--exit-code", remote, "refs/heads/main"],
    cwd
  );
  const [sha, ref, ...extra] = result.split(/\s+/);
  if (!/^[0-9a-f]{40}$/i.test(sha ?? "") || ref !== "refs/heads/main" || extra.length > 0) {
    throw new Error(`Could not parse the main branch returned by remote ${remote}.`);
  }
  return sha;
}

export function prePushFileSets(
  input,
  { cwd = process.cwd(), targetMainSha } = {}
) {
  const pushedFiles = new Set();
  const branchOwnedFiles = new Set();
  const updates = lines(input);

  for (const line of updates) {
    const [, localSha, , remoteSha] = line.split(/\s+/);
    if (!localSha || zeroSha.test(localSha)) {
      continue;
    }

    const branchBase = targetDiffBase(localSha, targetMainSha, cwd);
    const pushBase = remoteSha && !zeroSha.test(remoteSha) ? remoteSha : branchBase;

    for (const file of changedFiles(pushBase, localSha, cwd)) {
      pushedFiles.add(file);
    }
    for (const file of changedFiles(branchBase, localSha, cwd)) {
      branchOwnedFiles.add(file);
    }
  }

  if (updates.length === 0) {
    const localSha = gitOutput(["rev-parse", "HEAD"], cwd);
    const branchBase = targetDiffBase(localSha, targetMainSha, cwd);

    let pushBase = branchBase;
    const upstream = spawnSync("git", ["rev-parse", "@{u}"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      shell: false
    });
    if (upstream.status === 0 && upstream.stdout.trim()) {
      pushBase = upstream.stdout.trim();
    }

    for (const file of changedFiles(pushBase, localSha, cwd)) {
      pushedFiles.add(file);
    }
    for (const file of changedFiles(branchBase, localSha, cwd)) {
      branchOwnedFiles.add(file);
    }
  }

  return {
    pushedFiles: sorted(pushedFiles),
    branchOwnedFiles: sorted(branchOwnedFiles)
  };
}
