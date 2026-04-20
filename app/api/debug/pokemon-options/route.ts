import { NextResponse } from "next/server";
import { getPokemonOptions } from "@/lib/db/pokemon";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const options = await getPokemonOptions();
  const megaMatches = options.filter(
    (option) =>
      option.slug.includes("mega") ||
      option.label.toLowerCase().includes("mega") ||
      option.label.toLowerCase().includes("greninja") ||
      option.label.toLowerCase().includes("sharpedo"),
  );

  return NextResponse.json({
    count: options.length,
    hasGreninjaMega: options.some((option) => option.slug === "greninja-mega"),
    hasSharpedoMega: options.some((option) => option.slug === "sharpedo-mega"),
    matches: megaMatches,
  });
}
