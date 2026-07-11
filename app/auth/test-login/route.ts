import { NextResponse } from "next/server";

const NOT_FOUND_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache"
};

function notFound() {
  return NextResponse.json(
    { error: "Not found" },
    {
      headers: NOT_FOUND_HEADERS,
      status: 404
    }
  );
}

// The former bearer-URL test login is deliberately unavailable in every
// environment. Local browser and phone checks use the POST-only dev login.
export async function GET() {
  return notFound();
}

export async function POST() {
  return notFound();
}
