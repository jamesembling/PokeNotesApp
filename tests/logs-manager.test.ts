import "./support/dom";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { afterEach } from "node:test";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { LogsManagerProps } from "@/components/ui/LogsManager";
import type { BattleLogSummary } from "@/types/index";

const require = createRequire(import.meta.url);
type LoadMoreResult = Awaited<
  ReturnType<typeof import("@/app/(app)/logs/actions").loadMoreLogsAction>
>;
let loadMore: (date: string) => Promise<LoadMoreResult>;
const actionsPath = require.resolve("../app/(app)/logs/actions.ts");
require.cache[actionsPath] = {
  id: actionsPath,
  filename: actionsPath,
  loaded: true,
  exports: { loadMoreLogsAction: (date: string) => loadMore(date) }
} as NodeJS.Module;
const searchParams = new URLSearchParams();
const navigationPath = require.resolve("next/navigation");
require.cache[navigationPath] = {
  id: navigationPath,
  filename: navigationPath,
  loaded: true,
  exports: {
    useRouter: () => ({ prefetch() {}, refresh() {} }),
    usePathname: () => "/logs",
    useSearchParams: () => searchParams
  }
} as NodeJS.Module;
const { LogsManager } =
  require("../components/ui/LogsManager.tsx") as typeof import("@/components/ui/LogsManager");

const props: LogsManagerProps = {
  initialLogs: [],
  initialCanLoadMore: true,
  initialNextWindowEndDate: "2026-10-31",
  initialWindowStartDate: "2026-11-01",
  initialWindowEndDate: "2026-11-07"
};
const olderLog: BattleLogSummary = {
  id: "deleted-log",
  date: "2026-10-30",
  result: "Win",
  format: "TEF-DLR",
  goOrder: "First",
  selfPlayerName: "Owner",
  selfDeckName: "Owner deck",
  selfDeckSprites: [],
  opponentPlayerName: "Opponent",
  opponentDeckName: "Older opponent deck",
  opponentDeckSprites: [],
  totalTurns: 8,
  linkedDeckId: undefined,
  linkedDeckListId: undefined,
  importedAt: "2026-10-30T12:00:00Z"
};
const result: LoadMoreResult = {
  logs: [olderLog],
  hasMore: true,
  windowDays: 7,
  nextWindowEndDate: "2026-10-24",
  windowStartDate: "2026-10-25",
  windowEndDate: "2026-10-31"
};

afterEach(cleanup);

test("Refreshing Battle Logs invalidates pending pagination without losing fresh results", async () => {
  let resolveOld!: (result: LoadMoreResult) => void;
  const requested: string[] = [];
  loadMore = (date) => {
    requested.push(date);
    return new Promise((resolve) => {
      resolveOld = resolve;
    });
  };
  const view = render(createElement(LogsManager, props));
  fireEvent.click(screen.getByRole("button", { name: "Load More Logs" }));
  view.rerender(
    createElement(LogsManager, {
      ...props,
      initialLogs: [],
      initialCanLoadMore: false,
      initialNextWindowEndDate: "2026-10-24"
    })
  );
  await act(async () => resolveOld(result));
  assert.ok(
    screen.queryByRole("link", { name: /Older opponent deck/ }) === null,
    "a superseded response must not restore deleted logs"
  );
  assert.ok(screen.queryByRole("button", { name: "Load More Logs" }) === null);
  assert.ok(
    screen.getByText("No battle logs yet. Import your first PTCGL log to start tracking results.")
  );

  view.rerender(
    createElement(LogsManager, {
      ...props,
      initialLogs: [],
      initialNextWindowEndDate: "2026-10-24"
    })
  );
  loadMore = async (date) => {
    requested.push(date);
    return { ...result, hasMore: false };
  };
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Load More Logs" })));
  assert.ok(screen.getByRole("link", { name: /Older opponent deck/ }));
  assert.deepEqual(requested, ["2026-10-31", "2026-10-24"]);

  let rejectOld!: (error: Error) => void;
  loadMore = () =>
    new Promise((_, reject) => {
      rejectOld = reject;
    });
  view.rerender(createElement(LogsManager, { ...props, initialLogs: [] }));
  fireEvent.click(screen.getByRole("button", { name: "Load More Logs" }));
  view.rerender(
    createElement(LogsManager, { ...props, initialLogs: [], initialCanLoadMore: false })
  );
  await act(async () => rejectOld(new Error("Old request failed")));
  assert.ok(screen.queryByText("Couldn't load more logs right now. Please try again.") === null);
});
