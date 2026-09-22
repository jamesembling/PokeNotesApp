import assert from "node:assert/strict";
import test from "node:test";
import { parseUpcomingLimitlessEvents } from "@/lib/tournaments/limitless-events";

const now = Date.parse("2026-09-22T12:00:00.000Z");

function row(id: string, date: string, platform = "PTCGL", format = "Standard", registrations = "4 / 32") {
  return `<tr data-platform="${platform}" data-date="${date}" data-name="Weekly &amp; Open" data-organizer="League" data-players="4"><td class="date"><a href="/tournament/${id}/details"></a></td><td class="format"><img data-tooltip="${format}"/></td><td class="registrations"><a>${registrations}</a></td></tr>`;
}

test("upcoming discovery keeps only 30-day Standard TCG Live events and reads capacity", () => {
  const html = [
    row("aaaaaaaaaaaaaaaaaaaaaaaa", "2026-09-23T12:00:00.000Z"),
    row("bbbbbbbbbbbbbbbbbbbbbbbb", "2026-09-23T13:00:00.000Z", "PTCGO"),
    row("cccccccccccccccccccccccc", "2026-09-23T14:00:00.000Z", "PTCGL", "Expanded"),
    row("dddddddddddddddddddddddd", "2026-09-21T14:00:00.000Z"),
    row("eeeeeeeeeeeeeeeeeeeeeeee", "2026-10-23T14:00:00.000Z")
  ].join("");
  const events = parseUpcomingLimitlessEvents(`<table class="upcoming-tournaments">${html}</table>`, now);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    id: "aaaaaaaaaaaaaaaaaaaaaaaa",
    name: "Weekly & Open",
    organizer: "League",
    startsAt: "2026-09-23T12:00:00.000Z",
    platform: "PTCGL",
    format: "Standard",
    registeredPlayers: 4,
    registrationCapacity: 32,
    url: "https://play.limitlesstcg.com/tournament/aaaaaaaaaaaaaaaaaaaaaaaa/details"
  });
});
