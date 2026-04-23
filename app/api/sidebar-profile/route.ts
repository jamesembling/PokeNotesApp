import { NextResponse } from "next/server";
import { getCurrentSidebarProfile } from "@/lib/db/profile";

export async function GET() {
  const profile = await getCurrentSidebarProfile();

  return NextResponse.json(
    {
      displayName: profile.displayName,
      email: profile.email,
      isAdmin: profile.role === "admin"
    },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0"
      }
    }
  );
}
