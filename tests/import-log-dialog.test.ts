import "./support/dom";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { ImportLogDialog } from "@/components/ui/ImportLogDialog";
import { ImportDialogDataProvider } from "@/components/ui/ImportDialogDataProvider";
import { SiteFormatsProvider } from "@/components/ui/SiteFormatsProvider";
import type { PersistedBattleLogImportReview } from "@/lib/db/battle-log-import-drafts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("Battle Log review discards abandoned requests and saves a draft once", async (t) => {
  const originalFetch = globalThis.fetch;
  const reviews: ReturnType<typeof deferred<Response>>[] = [];
  const save = deferred<Response>();
  let saves = 0;
  const navigations: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (String(input) === "/api/log-import/review") {
      const request = deferred<Response>();
      reviews.push(request);
      return request.promise;
    }
    if (String(input) === "/api/log-import/save") {
      saves += 1;
      return save.promise;
    }
    return Response.json({ userDecks: [], deckLists: [] });
  }) as typeof fetch;
  const review: PersistedBattleLogImportReview = {
    draftId: "draft-1",
    expiresAt: "2026-11-07T10:30:00Z",
    date: "2026-11-07",
    selfPlayerName: "E2ETrainer",
    opponentPlayerName: "FixtureOpponent",
    selfDeckName: "Dragapult",
    opponentDeckName: "Charizard",
    selfDeckSlug: "dragapult",
    opponentDeckSlug: "charizard",
    selfSprites: ["dragapult"],
    opponentSprites: ["charizard"],
    result: "Win",
    goOrder: "First",
    coinTossWon: true,
    language: "en",
    totalTurns: 2,
    selfPrizesTaken: 1,
    opponentPrizesTaken: 0,
    selfAttackDamage: 200,
    opponentAttackDamage: 180,
    selfMulligans: 0,
    opponentMulligans: 0,
    reason: "Concede"
  };
  try {
    const formatsProps = {
      initialSiteFormats: {
        options: ["TEF-ASC"],
        defaultFormat: "TEF-ASC",
        source: "fallback" as const
      },
      children: createElement(ImportDialogDataProvider, null, createElement(ImportLogDialog))
    };
    render(
      createElement(
        AppRouterContext.Provider,
        {
          value: {
            bfcacheId: "import-test",
            back() {},
            forward() {},
            refresh() {},
            prefetch() {},
            replace() {},
            push(url: string) {
              navigations.push(url);
            }
          }
        },
        createElement(
          PathnameContext.Provider,
          { value: "/logs" },
          createElement(SiteFormatsProvider, formatsProps)
        )
      )
    );
    const rawLog = readFileSync("tests/e2e/fixtures/battle-log-valid.txt", "utf8");
    fireEvent.click(screen.getByRole("button", { name: "Import PTCGL Log" }));
    const clipboard = deferred<string>();
    t.mock.method(navigator.clipboard, "readText", () => clipboard.promise);
    fireEvent.click(screen.getByRole("button", { name: "Paste From Clipboard" }));
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    fireEvent.click(screen.getByRole("button", { name: "Import PTCGL Log" }));
    await act(async () => {
      clipboard.resolve(rawLog);
    });
    assert.equal(
      (screen.getByRole("textbox", { name: "Battle log" }) as HTMLTextAreaElement).value,
      "",
      "an abandoned clipboard read cannot paste into a later session"
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Battle log" }), {
      target: { value: rawLog }
    });
    await waitFor(() => assert.equal(reviews.length, 1));
    fireEvent.change(screen.getByRole("textbox", { name: "Battle log" }), {
      target: { value: "" }
    });
    await act(async () => {
      reviews[0].resolve(Response.json(review));
    });
    assert.ok(
      screen.queryByRole("textbox", { name: "Battle log" }),
      "clearing text invalidates the old response"
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Battle log" }), {
      target: { value: rawLog }
    });
    await waitFor(() => assert.equal(reviews.length, 2));
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    await act(async () => {
      reviews[1].resolve(Response.json(review));
    });
    fireEvent.click(screen.getByRole("button", { name: "Import PTCGL Log" }));
    assert.ok(
      screen.queryByRole("textbox", { name: "Battle log" }),
      "reopening never restores an abandoned review"
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Battle log" }), {
      target: { value: rawLog }
    });
    await waitFor(() => assert.equal(reviews.length, 3));
    // A whitespace-only edit leaves the reviewed log unchanged.
    fireEvent.change(screen.getByRole("textbox", { name: "Battle log" }), {
      target: { value: `${rawLog}\n ` }
    });
    await act(async () => {
      reviews[2].resolve(Response.json(review));
    });
    const form = screen.getByRole("textbox", { name: "Match notes" }).closest("form");
    assert.ok(form);
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    assert.equal(saves, 1, "concurrent submits share one in-flight save");
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    fireEvent.click(screen.getByRole("button", { name: "Import PTCGL Log" }));
    await act(async () => {
      save.resolve(Response.json({ ok: true, redirectTo: "/logs/log-1" }));
    });
    await act(async () => {
      await new Promise((done) => setTimeout(done, 350));
    });
    assert.deepEqual(navigations, [], "an abandoned save cannot navigate a later dialog session");
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});
