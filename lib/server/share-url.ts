import { getPublicAppOrigin } from "@/lib/server/app-url";

const SHARED_LOG_PATH_PREFIX = "/s";

export function buildSharedLogPath(shareId: string) {
  return `${SHARED_LOG_PATH_PREFIX}/${encodeURIComponent(shareId)}`;
}

export function buildSharedLogUrl(appOrigin: string, shareId: string) {
  return `${appOrigin}${buildSharedLogPath(shareId)}`;
}

export async function getPublicSharedLogUrl(shareId: string) {
  return buildSharedLogUrl(await getPublicAppOrigin(), shareId);
}
