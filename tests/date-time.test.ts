import assert from "node:assert/strict";
import test from "node:test";

test("app calendar dates stay on the London day during British Summer Time", async () => {
  const originalTimeZone = process.env.TZ;

  try {
    process.env.TZ = "UTC";

    const { APP_TIME_ZONE, formatAppCalendarDate } = await import("@/lib/date-time");

    assert.equal(APP_TIME_ZONE, "Europe/London");
    assert.equal(
      formatAppCalendarDate("2026-05-13T23:02:06.108258+00:00"),
      "14 May 2026"
    );
    assert.equal(
      formatAppCalendarDate("2026-05-13T22:59:23.021777+00:00"),
      "13 May 2026"
    );
  } finally {
    if (originalTimeZone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTimeZone;
    }
  }
});
