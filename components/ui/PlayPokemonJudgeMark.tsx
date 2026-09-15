import Image from "next/image";

export function PlayPokemonJudgeMark({
  className = "size-12"
}: {
  className?: string;
}) {
  return (
    <Image
      alt="Play! Pokémon Professor logo"
      className={`${className} shrink-0 object-contain`}
      height={56}
      priority={false}
      sizes="56px"
      src="/play-pokemon-logo.png"
      width={56}
    />
  );
}
