"use client";

import { createContext, useCallback, useContext, useRef, type MutableRefObject, type ReactNode } from "react";

type MatchupWriteChannel = {
  pendingWrite: MutableRefObject<Promise<void>>;
  version: MutableRefObject<string>;
};

/** A Matchup write receives the version it must match and resolves to the version it committed. */
type MatchupWrite = (expectedVersion: string) => Promise<string>;

const MatchupViewedVersionContext = createContext<MatchupWriteChannel | null>(null);

function createMatchupWriteChannel(initialVersion: string): MatchupWriteChannel {
  return {
    pendingWrite: { current: Promise.resolve() },
    version: { current: initialVersion }
  };
}

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
  const channel = useRef<MatchupWriteChannel | null>(null);
  if (channel.current === null) {
    channel.current = createMatchupWriteChannel(initialVersion);
  }
  return (
    <MatchupViewedVersionContext.Provider value={channel.current}>
      {children}
    </MatchupViewedVersionContext.Provider>
  );
}

export function useMatchupViewedVersion(initialVersion: string) {
  const sharedChannel = useContext(MatchupViewedVersionContext);
  const localChannel = useRef<MatchupWriteChannel | null>(null);
  if (sharedChannel === null && localChannel.current === null) {
    localChannel.current = createMatchupWriteChannel(initialVersion);
  }
  const channel = sharedChannel ?? localChannel.current!;

  const commitSerially = useCallback(
    (write: MatchupWrite) => {
      const commit = channel.pendingWrite.current.then(async () => {
        channel.version.current = await write(channel.version.current);
      });
      channel.pendingWrite.current = commit.catch(() => undefined);
      return commit;
    },
    [channel]
  );

  return { commitSerially, viewedVersionRef: channel.version };
}
