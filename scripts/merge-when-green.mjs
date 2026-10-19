#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const MERGE_LABEL = "merge-when-green";
const REQUIRED_CHECKS = ["verify", "Database behavior"];
const ACCEPTED_RESULTS = new Set(["SUCCESS", "SKIPPED", "NEUTRAL"]);
// This workflow's own job can show up in a PR's check rollup; it must not wait on itself.
const OWN_CHECK = "Merge when green";
const CODEX_BOT = "chatgpt-codex-connector[bot]";

// Decide from a read-only snapshot whether a PR may merge now. Anything not
// clearly green waits: a later check, review or label event re-runs this.
export function decideMerge({ pr, checks, unresolvedThreads, codexReview, truncated }) {
  if (pr.state !== "OPEN") return { merge: false, reason: `PR is ${pr.state.toLowerCase()}.` };
  if (pr.isDraft) return { merge: false, reason: "PR is a draft." };
  if (pr.baseRefName !== "main") return { merge: false, reason: "PR does not target main." };
  if (!pr.labels.includes(MERGE_LABEL)) {
    return { merge: false, reason: `PR has no ${MERGE_LABEL} label.` };
  }

  if (truncated) {
    return { merge: false, reason: "Too many checks or review threads to read in one page." };
  }

  const relevant = checks.filter((check) => check.name !== OWN_CHECK);
  for (const name of REQUIRED_CHECKS) {
    if (!relevant.some((check) => check.name === name)) {
      return { merge: false, reason: `Required check ${name} has not reported yet.` };
    }
  }
  const notGreen = relevant.filter((check) => !ACCEPTED_RESULTS.has(check.result));
  if (notGreen.length) {
    const summary = notGreen.map((check) => `${check.name} (${check.result})`).join(", ");
    return { merge: false, reason: `Checks not green: ${summary}.` };
  }

  if (pr.mergeable !== "MERGEABLE") {
    return { merge: false, reason: `PR is not mergeable (${pr.mergeable}).` };
  }
  if (unresolvedThreads > 0) {
    return { merge: false, reason: `${unresolvedThreads} review thread(s) unresolved.` };
  }
  if (codexReview?.commitSha === pr.headRefOid && codexReview.status === "running") {
    return { merge: false, reason: "Codex review is still running on the head commit." };
  }
  return { merge: true, reason: "All checks green, no open threads, no review running." };
}

export function normalizeCheck(entry) {
  if (entry.__typename === "StatusContext") {
    return { name: entry.context, result: entry.state };
  }
  return {
    name: entry.name,
    result: entry.status === "COMPLETED" ? entry.conclusion : "PENDING"
  };
}

export function readCodexReview(comments) {
  for (const comment of [...comments].reverse()) {
    if (comment.user?.login !== CODEX_BOT) continue;
    const match = /codex-review-state:v1 (\{.*?\}) -->/.exec(comment.body ?? "");
    if (!match) continue;
    try {
      const review = JSON.parse(match[1]).code_review;
      return { commitSha: review?.commit_sha ?? null, status: review?.status ?? null };
    } catch {
      return null;
    }
  }
  return null;
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8" });
}

function ghJson(args) {
  return JSON.parse(gh(args));
}

function openPullRequestsFor(repo, sha) {
  return ghJson(["api", `repos/${repo}/commits/${sha}/pulls`])
    .filter((pr) => pr.state === "open")
    .map((pr) => pr.number);
}

function candidatePullRequests(repo, eventName, event) {
  if (eventName === "workflow_dispatch") return [Number(event.inputs.pr_number)];
  if (eventName === "pull_request_target") return [event.pull_request.number];
  if (eventName === "issue_comment") return event.issue.pull_request ? [event.issue.number] : [];
  if (eventName === "workflow_run") return openPullRequestsFor(repo, event.workflow_run.head_sha);
  // Third-party checks (such as Vercel) report as commit statuses or app check suites.
  if (eventName === "status") return openPullRequestsFor(repo, event.sha);
  if (eventName === "check_suite") return openPullRequestsFor(repo, event.check_suite.head_sha);
  return [];
}

function snapshot(repo, number) {
  const [owner, name] = repo.split("/");
  const data = ghJson([
    "api",
    "graphql",
    "-F",
    `owner=${owner}`,
    "-F",
    `name=${name}`,
    "-F",
    `number=${number}`,
    "-f",
    `query=query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){
      state isDraft baseRefName headRefOid mergeable title
      labels(first:50){nodes{name}}
      reviewThreads(first:100){pageInfo{hasNextPage} nodes{isResolved}}
      commits(last:1){nodes{commit{statusCheckRollup{contexts(first:100){pageInfo{hasNextPage} nodes{
        __typename ... on CheckRun{name status conclusion} ... on StatusContext{context state}
      }}}}}}
    }}}`
  ]).data.repository.pullRequest;
  const rollup = data.commits.nodes[0]?.commit.statusCheckRollup;
  const comments = ghJson([
    "api",
    "--paginate",
    "--slurp",
    `repos/${repo}/issues/${number}/comments`
  ]).flat();
  return {
    pr: {
      baseRefName: data.baseRefName,
      headRefOid: data.headRefOid,
      isDraft: data.isDraft,
      labels: data.labels.nodes.map((label) => label.name),
      mergeable: data.mergeable,
      state: data.state,
      title: data.title
    },
    checks: (rollup?.contexts.nodes ?? []).map(normalizeCheck),
    unresolvedThreads: data.reviewThreads.nodes.filter((thread) => !thread.isResolved).length,
    codexReview: readCodexReview(comments),
    // A later page could hide a failing check or an open thread, so never judge a partial read.
    truncated: Boolean(
      rollup?.contexts.pageInfo.hasNextPage || data.reviewThreads.pageInfo.hasNextPage
    )
  };
}

function mergeWhenGreen(repo, number) {
  const current = snapshot(repo, number);
  const decision = decideMerge(current);
  console.log(`PR #${number} at ${current.pr.headRefOid}: ${decision.reason}`);
  if (!decision.merge) return;

  // Pin to the head we just judged, so a push after the snapshot cannot merge unchecked.
  try {
    gh([
      "pr",
      "merge",
      String(number),
      "--repo",
      repo,
      "--squash",
      "--match-head-commit",
      current.pr.headRefOid,
      "--subject",
      `${current.pr.title} (#${number})`
    ]);
  } catch (error) {
    console.log(`Merge call failed: ${error.message.split("\n")[0]}`);
  }
  // The merge call's exit is only a diagnostic; confirm with a separate read.
  const after = ghJson([
    "pr",
    "view",
    String(number),
    "--repo",
    repo,
    "--json",
    "state,mergeCommit"
  ]);
  if (after.state === "MERGED") {
    console.log(`PR #${number} merged as ${after.mergeCommit.oid}.`);
  } else {
    console.log(`PR #${number} is still ${after.state}; a later event will re-check it.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const repo = process.env.GITHUB_REPOSITORY;
  const eventName = process.env.GITHUB_EVENT_NAME;
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  for (const number of candidatePullRequests(repo, eventName, event)) {
    mergeWhenGreen(repo, number);
  }
}
