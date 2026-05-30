import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Poke Notes",
  description: "Competitive Pokemon TCG notes, logs, and analysis."
};

export default async function HomePage() {
  const user = await getCurrentUser();

  redirect(user ? "/logs" : "/login");
}
