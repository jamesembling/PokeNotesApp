"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { requireAdminAccess, updateAdminUserRole } from "@/lib/db/admin";
import { reportError } from "@/lib/server/report-error";
import type { Role } from "@/types/index";

export async function updateAdminUserRoleAction(input: { userId: string; role: Role }) {
  await requireAuth();
  await requireAdminAccess();

  try {
    await updateAdminUserRole(input.userId, input.role);
    revalidatePath("/admin/dashboard");

    return {
      ok: true as const
    };
  } catch (error) {
    reportError(error, {
      boundary: "admin-dashboard-actions",
      route: "/admin/dashboard"
    });

    return {
      ok: false as const,
      error: "Unable to update the user role right now."
    };
  }
}
