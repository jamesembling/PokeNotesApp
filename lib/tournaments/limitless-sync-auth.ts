export function isAuthorizedLimitlessSync(
  authorization: string | null,
  cronSecret: string | undefined,
  scheduledSyncSecret: string | undefined
) {
  return Boolean(authorization && [cronSecret, scheduledSyncSecret]
    .some((secret) => secret && authorization === `Bearer ${secret}`));
}
