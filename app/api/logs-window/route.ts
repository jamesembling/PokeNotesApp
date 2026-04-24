import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getLogsWindow } from "@/lib/db/logs";

export async function GET(request: NextRequest) {
  const user = await requireUser();
  const windowEndDate = request.nextUrl.searchParams.get("windowEndDate") || undefined;
  const page = await getLogsWindow(user.id, { windowEndDate });

  return NextResponse.json(page, {
    headers: {
      "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0"
    }
  });
}
