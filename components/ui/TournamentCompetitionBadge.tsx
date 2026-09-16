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

  const imageClassName = `${className} shrink-0 object-contain`;

  if (badge.darkSrc) {
    return (
      <>
        <Image
          alt={badge.alt}
          className={`${imageClassName} dark:hidden`}
          height={56}
          sizes="56px"
          src={badge.src}
          width={56}
        />
        <Image
          alt={badge.alt}
          className={`${imageClassName} hidden dark:block`}
          height={56}
          sizes="56px"
          src={badge.darkSrc}
          width={56}
        />
      </>
    );
  }

  return (
    <Image
      alt={badge.alt}
      className={imageClassName}
      height={56}
      sizes="56px"
      src={badge.src}
      width={56}
    />
  );
}
