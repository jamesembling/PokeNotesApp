export interface PrePushFileSets {
  pushedFiles: string[];
  branchOwnedFiles: string[];
}

export function prePushFileSets(
  input: string,
  options?: { cwd?: string }
): PrePushFileSets;
