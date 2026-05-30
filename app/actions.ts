"use server";

import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function signOutAction() {
  const [, supabase] = await Promise.all([requireAuth(), createClient()]);
  await supabase.auth.signOut();
  redirect("/login");
}
