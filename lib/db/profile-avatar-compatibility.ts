type DatabaseResult = { error: { code?: string; message?: string } | null };

/** Retry only the additive avatar column, never authorization or unrelated failures. */
export async function withProfileAvatarColumn<T extends DatabaseResult>(
  query: (includeAvatar: boolean) => PromiseLike<T>
): Promise<T> {
  const result = await query(true);
  if (result.error && ["42703", "PGRST204"].includes(result.error.code ?? "") &&
    /\bavatar_path\b/.test(result.error.message ?? "") &&
    /\bprofiles\b/.test(result.error.message ?? "")) {
    return await query(false);
  }
  return result;
}

export function profileAvatarColumns(columns: string, includeAvatar: boolean) {
  return includeAvatar ? columns : columns.split(",").filter(column => column !== "avatar_path").join(",");
}
