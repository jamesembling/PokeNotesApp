import { NextResponse } from "next/server";
import { getSiteFormats } from "@/lib/formats/catalog";

export async function GET() {
  const siteFormats = await getSiteFormats();
  return NextResponse.json(siteFormats);
}
