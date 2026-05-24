import { revalidatePath } from "next/cache";

export function revalidateDeckAndLogWorkspace() {
  revalidatePath("/decks", "layout");
  revalidatePath("/logs", "layout");
}
