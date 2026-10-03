"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export const FRIEND_REQUESTS_UPDATED_EVENT = "pokenotes:friend-requests-updated";

export function useFriendRequestCount() {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    let request: AbortController | undefined;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      request?.abort();
      request = new AbortController();
      void fetch("/api/friend-requests/count", { cache: "no-store", signal: request.signal })
        .then(async response => {
          if (!response.ok) return;
          const data = await response.json() as { count?: unknown };
          if (active && Number.isSafeInteger(data.count) && Number(data.count) >= 0) setCount(Number(data.count));
        })
        .catch(() => { /* Preserve the last confirmed count until a successful refresh. */ });
    };
    refresh();
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    window.addEventListener(FRIEND_REQUESTS_UPDATED_EVENT, refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      request?.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(FRIEND_REQUESTS_UPDATED_EVENT, refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [pathname]);

  return count;
}
