import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getLogSummaryStats, getLogsWindow } from "@/lib/db/logs";

export async function GET() {
  const user = await requireUser();
  const [stats, window] = await Promise.all([
    getLogSummaryStats(user.id),
    getLogsWindow(user.id)
  ]);

  return NextResponse.json(
    { stats, window },
    {
      headers: {
        "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0"
      }
    }
  );
}
