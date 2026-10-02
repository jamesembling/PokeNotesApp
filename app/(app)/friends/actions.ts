"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { getCurrentShowcase, manageFriendship, updateShowcase } from "@/lib/db/social";
import { validateCardArtPrints } from "@/lib/social/card-art";
import { parseFriendshipForm, parseShowcaseForm, SocialValidationError } from "@/lib/social/validation";
import { reportError } from "@/lib/server/report-error";
import type { SocialActionState } from "@/lib/social/types";

function refreshSocialPages() {
  revalidatePath("/profile");
  revalidatePath("/friends");
  revalidatePath("/players/[id]", "page");
}

export async function saveShowcaseAction(_previous: SocialActionState, form: FormData): Promise<SocialActionState> {
  await requireAuth();
  try {
    const input = parseShowcaseForm(form);
    // Revoking profile visibility must remain possible during an artwork-provider outage.
    const saved = input.enabled ? await getCurrentShowcase() : null;
    const cards = input.enabled ? await validateCardArtPrints(input.favouriteCards, saved?.favouriteCards) : input.favouriteCards;
    await updateShowcase(input, cards);
    refreshSocialPages();
    return { success: "Player profile saved." };
  } catch (error) {
    if (error instanceof SocialValidationError) return { error: error.message };
    reportError(error, { boundary: "showcase-actions", route: "/profile" });
    return { error: "We couldn't save your player profile. Your changes are still here; try saving again." };
  }
}

export async function friendshipAction(_previous: SocialActionState, form: FormData): Promise<SocialActionState> {
  await requireAuth();
  try {
    const { targetUserId, operation } = parseFriendshipForm(form);
    await manageFriendship(targetUserId, operation);
    refreshSocialPages();
    const messages = { request: "Friend request sent.", accept: "Friend request accepted.", decline: "Friend request declined.", cancel: "Friend request cancelled.", remove: "Friend removed.", block: "Player blocked.", unblock: "Player unblocked." };
    return { success: messages[operation] };
  } catch (error) {
    if (error instanceof SocialValidationError) return { error: error.message };
    reportError(error, { boundary: "friendship-actions", route: "/friends" });
    return { error: "We couldn't update this connection. Refresh to check its current status, then try again." };
  }
}
