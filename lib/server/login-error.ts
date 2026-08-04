export function getLoginAuthError(value: string | string[] | undefined) {
  const error = Array.isArray(value) ? value[0] : value;
  return error || null;
}
