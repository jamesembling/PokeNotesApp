import Image from "next/image";
import { getTournamentCompetitionBadge } from "@/lib/tournaments/options";
import type { TournamentCategory } from "@/types/index";

export function TournamentCompetitionBadge({
  category,
  className = "size-12"
}: {
  category: TournamentCategory;
  className?: string;
}) {
  const badge = getTournamentCompetitionBadge(category);

  if (!badge) {
    return null;
  }

  return (
    <Image
      alt={badge.alt}
      className={`${className} shrink-0 object-contain`}
      height={56}
      sizes="56px"
      src={badge.src}
      width={56}
    />
  );
}
