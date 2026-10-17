type LockPackage = {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};
export function assessRuntimeAudit(
  lock: { packages: Record<string, LockPackage> },
  audit: { vulnerabilities?: Record<string, { severity: string; nodes?: string[] }> }
): { blocking: string[]; buildOnly: string[] };
