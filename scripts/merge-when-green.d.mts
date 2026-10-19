type CheckResult = { name: string; result: string };
type CodexReview = { commitSha: string | null; status: string | null } | null;
type MergeSnapshot = {
  pr: {
    baseRefName: string;
    headRefOid: string;
    isDraft: boolean;
    labels: string[];
    mergeable: string;
    state: string;
  };
  checks: CheckResult[];
  unresolvedThreads: number;
  codexReview: CodexReview;
};
export const MERGE_LABEL: string;
export function decideMerge(snapshot: MergeSnapshot): { merge: boolean; reason: string };
export function normalizeCheck(
  entry:
    | { __typename: "CheckRun"; name: string; status: string; conclusion: string | null }
    | { __typename: "StatusContext"; context: string; state: string }
): CheckResult;
export function readCodexReview(
  comments: { body?: string | null; user?: { login?: string } | null }[]
): CodexReview;
