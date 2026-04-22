import assert from "node:assert/strict";
import test from "node:test";
import {
  extractBattleLogActionCardCandidate,
  resetBattleLogActionTagOverrideCache,
  resolveBattleLogActionTagOverride,
  resolveBattleLogActionTagOverrides
} from "@/lib/battle-log/action-tags";

test("extractBattleLogActionCardCandidate finds likely card names in played and attached lines", () => {
  assert.equal(
    extractBattleLogActionCardCandidate("Played Boss's Orders -> gusted Gabite into the Active Spot."),
    "Boss's Orders"
  );
  assert.equal(
    extractBattleLogActionCardCandidate("Johan attached Bravery Charm to Munkidori."),
    "Bravery Charm"
  );
  assert.equal(extractBattleLogActionCardCandidate("Johan benched Munkidori."), null);
  assert.equal(extractBattleLogActionCardCandidate("Johan played a card."), null);
});

test("resolveBattleLogActionTagOverride resolves supporter and tool cards via mocked Limitless responses", async (t) => {
  resetBattleLogActionTagOverrideCache();
  const originalFetch = global.fetch;

  global.fetch = (async (input: string | URL) => {
    const url = String(input);

    if (url.includes("/api/dm/search?")) {
      if (url.includes("Boss%27s+Orders")) {
        return new Response(JSON.stringify([{ id: "boss-orders", name: "Boss's Orders" }]), {
          status: 200
        });
      }

      if (url.includes("Bravery+Charm")) {
        return new Response(JSON.stringify([{ id: "bravery-charm", name: "Bravery Charm" }]), {
          status: 200
        });
      }
    }

    if (url.includes("/api/dm/versions?")) {
      if (url.includes("boss-orders")) {
        return new Response(JSON.stringify([{ type: "supporter" }]), {
          status: 200
        });
      }

      if (url.includes("bravery-charm")) {
        return new Response(JSON.stringify([{ type: "tool" }]), {
          status: 200
        });
      }
    }

    return new Response(JSON.stringify([]), { status: 200 });
  }) as typeof global.fetch;

  t.after(() => {
    global.fetch = originalFetch;
    resetBattleLogActionTagOverrideCache();
  });

  assert.deepEqual(
    await resolveBattleLogActionTagOverride(
      "Played Boss's Orders -> gusted Gabite into the Active Spot."
    ),
    { label: "Supporter", tag: "supporter" }
  );

  assert.deepEqual(
    await resolveBattleLogActionTagOverride("Johan attached Bravery Charm to Munkidori."),
    { label: "Tool", tag: "tool" }
  );
});

test("resolveBattleLogActionTagOverrides only returns overrides for titles that can be resolved", async (t) => {
  resetBattleLogActionTagOverrideCache();
  const originalFetch = global.fetch;

  global.fetch = (async (input: string | URL) => {
    const url = String(input);

    if (url.includes("/api/dm/search?") && url.includes("Boss%27s+Orders")) {
      return new Response(JSON.stringify([{ id: "boss-orders", name: "Boss's Orders" }]), {
        status: 200
      });
    }

    if (url.includes("/api/dm/versions?") && url.includes("boss-orders")) {
      return new Response(JSON.stringify([{ type: "supporter" }]), {
        status: 200
      });
    }

    return new Response(JSON.stringify([]), { status: 200 });
  }) as typeof global.fetch;

  t.after(() => {
    global.fetch = originalFetch;
    resetBattleLogActionTagOverrideCache();
  });

  const overrides = await resolveBattleLogActionTagOverrides([
    {
      title: "Turn #1 - Johan's Turn",
      player: "Johan",
      prizesAfterTurn: { Johan: 6, Cynthia: 6 },
      actions: [
        {
          title: "Played Boss's Orders -> gusted Gabite into the Active Spot.",
          details: []
        },
        {
          title: "Munkidori used Shadow Bullet -> 180 damage to Gabite.",
          details: []
        }
      ]
    }
  ]);

  assert.deepEqual(overrides, [[
    {
      label: "Supporter",
      tag: "supporter"
    },
    null
  ]]);
});

test("resolveBattleLogActionTagOverride reuses the cached lookup for repeated titles", async (t) => {
  resetBattleLogActionTagOverrideCache();
  const originalFetch = global.fetch;
  const calls: string[] = [];

  global.fetch = (async (input: string | URL) => {
    const url = String(input);
    calls.push(url);

    if (url.includes("/api/dm/search?")) {
      return new Response(JSON.stringify([{ id: "boss-orders", name: "Boss's Orders" }]), {
        status: 200
      });
    }

    if (url.includes("/api/dm/versions?")) {
      return new Response(JSON.stringify([{ type: "supporter" }]), {
        status: 200
      });
    }

    return new Response(JSON.stringify([]), { status: 200 });
  }) as typeof global.fetch;

  t.after(() => {
    global.fetch = originalFetch;
    resetBattleLogActionTagOverrideCache();
  });

  const title = "Played Boss's Orders -> gusted Gabite into the Active Spot.";

  assert.deepEqual(await resolveBattleLogActionTagOverride(title), {
    label: "Supporter",
    tag: "supporter"
  });
  assert.deepEqual(await resolveBattleLogActionTagOverride(title), {
    label: "Supporter",
    tag: "supporter"
  });
  assert.equal(calls.length, 2);
});
