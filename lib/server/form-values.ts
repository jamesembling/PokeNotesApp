import type { GoPreference } from "@/types/index";
import { compactMap } from "@/lib/array";

export function normalizeSelectedSprites(values: FormDataEntryValue[], limit = 2) {
  return Array.from(
    new Set(
      compactMap(values, (value) => String(value || "").trim())
    )
  ).slice(0, limit);
}

export function parseJsonOrRepeatedSprites(args: {
  formData: FormData;
  jsonFieldName: string;
  repeatedFieldName: string;
  limit?: number;
}) {
  const jsonValue = String(args.formData.get(args.jsonFieldName) || "").trim();

  if (jsonValue) {
    try {
      const parsed = JSON.parse(jsonValue);
      if (Array.isArray(parsed)) {
        return normalizeSelectedSprites(parsed.map((value) => String(value ?? "")), args.limit);
      }
    } catch {
      // Fall through to repeated field parsing.
    }
  }

  return normalizeSelectedSprites(args.formData.getAll(args.repeatedFieldName), args.limit);
}

export function parseGoPreference(value: FormDataEntryValue | null): GoPreference {
  return value === "First" || value === "Second" ? value : "";
}

export function parseStringArray(values: FormDataEntryValue[]): string[] {
  return Array.from(
    new Set(
      compactMap(values, (value) => String(value || "").trim())
    )
  );
}
