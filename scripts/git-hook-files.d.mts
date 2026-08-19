export interface PrePushFileSets {
  pushedFiles: string[];
}

export function prePushFileSets(
  input: string,
  options: { cwd?: string; targetMainSha: string }
): PrePushFileSets;

export function remoteMainSha(
  remote: string,
  options?: { cwd?: string }
): string;
