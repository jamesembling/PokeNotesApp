"use client";

import { createContext, useContext, useRef, type ReactNode } from "react";
import { createSerialVersionChannel, type SerialVersionChannel } from "@/lib/client/coalesced-save-queue";

const MatchupViewedVersionContext = createContext<SerialVersionChannel | null>(null);

/**
 * Header and note editors share only versions acknowledged by this page's own saves,
 * and commit one at a time so neither reads a version the other is about to replace.
 */
export function MatchupViewedVersionProvider({
  children,
  initialVersion
}: {
  children: ReactNode;
  initialVersion: string;
}) {
  const channel = useRef<SerialVersionChannel | null>(null);
  if (channel.current === null) {
    channel.current = createSerialVersionChannel(initialVersion);
  }
  return (
    <MatchupViewedVersionContext.Provider value={channel.current}>
      {children}
    </MatchupViewedVersionContext.Provider>
  );
}

export function useMatchupViewedVersion(initialVersion: string) {
  const sharedChannel = useContext(MatchupViewedVersionContext);
  const localChannel = useRef<SerialVersionChannel | null>(null);
  if (sharedChannel === null && localChannel.current === null) {
    localChannel.current = createSerialVersionChannel(initialVersion);
  }
  const channel = sharedChannel ?? localChannel.current!;
  return { commitSerially: channel.commit, viewedVersionRef: channel.version };
}
