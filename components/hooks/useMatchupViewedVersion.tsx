"use client";

import { createContext, useContext, useRef, type MutableRefObject, type ReactNode } from "react";

const MatchupViewedVersionContext = createContext<MutableRefObject<string> | null>(null);

/** Header and note editors share only versions acknowledged by this page's own saves. */
export function MatchupViewedVersionProvider({
  children,
  initialVersion
}: {
  children: ReactNode;
  initialVersion: string;
}) {
  const version = useRef(initialVersion);
  return (
    <MatchupViewedVersionContext.Provider value={version}>
      {children}
    </MatchupViewedVersionContext.Provider>
  );
}

export function useMatchupViewedVersion(initialVersion: string) {
  const sharedVersion = useContext(MatchupViewedVersionContext);
  const localVersion = useRef(initialVersion);
  return sharedVersion ?? localVersion;
}
