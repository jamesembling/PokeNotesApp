"use client";

import { createContext, useContext } from "react";

export const LogsRefreshContext = createContext<(() => Promise<void>) | null>(null);

export function useLogsRefresh() {
  return useContext(LogsRefreshContext);
}
