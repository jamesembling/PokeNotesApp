export function getSafeRedirectPath(value: FormDataEntryValue | string | null, fallbackPath: string) {
  const path = String(value || "").trim();

  if (
    !path ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(path)
  ) {
    return fallbackPath;
  }

  return path;
}

export function getFormRedirectPath(formData: FormData, fallbackPath: string) {
  return getSafeRedirectPath(formData.get("redirectTo"), fallbackPath);
}

export function withRefreshToken(path: string, timestamp = Date.now()) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}r=${timestamp}`;
}
