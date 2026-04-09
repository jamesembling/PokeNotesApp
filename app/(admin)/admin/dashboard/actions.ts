"use server";

import { revalidatePath } from "next/cache";
import { updateAdminUserRole } from "@/lib/db/admin";
import type { Role } from "@/types/index";

export async function updateAdminUserRoleAction(input: { userId: string; role: Role }) {
  try {
    await updateAdminUserRole(input.userId, input.role);
    revalidatePath("/admin/dashboard");

    return {
      ok: true as const
    };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Unable to update the user role."
    };
  }
}
