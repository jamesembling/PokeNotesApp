import { NextResponse } from "next/server";
import { getSiteFormats } from "@/lib/formats/catalog";
import { reportError } from "@/lib/server/report-error";

export async function GET() {
  try {
    const siteFormats = await getSiteFormats();
    return NextResponse.json(siteFormats);
  } catch (error) {
    reportError(error, {
      action: "getSiteFormats",
      area: "api",
      boundary: "site-formats-route",
      route: "/api/site-formats"
    });

    return NextResponse.json(
      {
        error: "We couldn't load tournament formats right now."
      },
      { status: 500 }
    );
  }
}
