"use server";

import { revalidatePath } from "next/cache";
import { updateAdminUserRole } from "@/lib/db/admin";
import { reportError } from "@/lib/server/report-error";
import type { Role } from "@/types/index";

export async function updateAdminUserRoleAction(input: { userId: string; role: Role }) {
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
