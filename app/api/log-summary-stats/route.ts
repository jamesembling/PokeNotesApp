import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getLogSummaryStats } from "@/lib/db/logs";

export async function GET() {
  const user = await requireUser();
  const stats = await getLogSummaryStats(user.id);

  return NextResponse.json(stats, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0"
    }
  });
}
