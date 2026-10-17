import "./support/dom";
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TournamentLocationField } from "@/components/ui/TournamentLocationField";

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

test("Tournament location suggestions are keyboard-selectable and fall back to manual entry", async () => {
  const requested: string[] = [];
  let lookupFails = false;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requested.push(String(input));
    if (lookupFails) {
      return new Response(JSON.stringify({ error: "unavailable" }), { status: 503 });
    }
    return Response.json({
      suggestions: [
        { id: "store-1", label: "Card Hub Leeds", address: "1 Boar Lane, Leeds" },
        { id: "store-2", label: "Card Hub York", address: "2 Stonegate, York" }
      ]
    });
  }) as typeof fetch;

  render(createElement(TournamentLocationField));
  const location = screen.getByRole("combobox", { name: "Location" });

  fireEvent.change(location, { target: { value: "Card Hub" } });
  const options = await screen.findAllByRole("option");
  assert.deepEqual(options.map((option) => option.textContent), [
    "Card Hub Leeds1 Boar Lane, Leeds",
    "Card Hub York2 Stonegate, York"
  ]);
  assert.equal(location.getAttribute("aria-expanded"), "true");
  assert.equal(screen.getByRole("status").textContent, "2 UK Play! Store suggestions available.");
  assert.match(requested[0], /\/api\/location-suggestions\?q=Card%20Hub$/);

  fireEvent.keyDown(location, { key: "ArrowDown" });
  assert.equal(location.getAttribute("aria-activedescendant"), options[1].id);
  fireEvent.keyDown(location, { key: "Enter" });

  assert.equal((location as HTMLInputElement).value, "Card Hub York");
  assert.equal(screen.queryByRole("listbox"), null);
  assert.equal(location.getAttribute("aria-expanded"), "false");

  lookupFails = true;
  fireEvent.change(location, { target: { value: "Card Hub Hull" } });
  await waitFor(() =>
    assert.equal(
      screen.getByRole("status").textContent,
      "Play! Store suggestions are unavailable. You can still enter a location manually."
    )
  );
  assert.equal((location as HTMLInputElement).value, "Card Hub Hull");
  assert.equal(screen.queryByRole("listbox"), null);
});
