import { bexPilotBattleLogSections } from "@/lib/battle-replay/bex-pilot-log";
import {
  compileReplayPilot,
  type ReplayPilot,
} from "@/lib/battle-replay/generic-pilot";
import {
  replayEvents,
  replayFrames,
  replaySource,
} from "@/lib/battle-replay/prototype";

export const replayPilots: ReplayPilot[] = [
  {
    id: "original",
    label: "Original pilot",
    source: replaySource,
    events: replayEvents,
    frames: replayFrames,
    diagnostics: { evidencedActions: replayEvents.length, unresolvedMutations: 0 },
  },
  compileReplayPilot(
    "bex-0815",
    "Bex · 08:15",
    {
      logId: "c0e0c3e9-204a-4085-902d-198635ea40e9",
      playedOn: "4 September 2026",
      format: "TEF-PBL",
      result: "Win",
      selfDeck: "Dragapult / Blaziken",
      opponentDeck: "Dragapult",
      selfPrizesTaken: 6,
      opponentPrizesTaken: 4,
      turns: 7,
    },
    bexPilotBattleLogSections,
    "B3xCharz24",
  ),
];
