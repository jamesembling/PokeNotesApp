type DamageTimelinePoint = {
  opponentAttackDamage: number;
  selfAttackDamage: number;
};

export function summarizeDamageTimelineWindow(
  points: readonly DamageTimelinePoint[],
  totalGames: number,
  allTimeAttackDamage: number,
  allTimeOpponentAttackDamage: number
) {
  const normalizedTotalGames = Math.max(0, Math.round(totalGames));
  const isTruncated = points.length > 0 && normalizedTotalGames > points.length;
  const attackDamage = points.length
    ? points.reduce((total, point) => total + point.selfAttackDamage, 0)
    : allTimeAttackDamage;
  const opponentAttackDamage = points.length
    ? points.reduce((total, point) => total + point.opponentAttackDamage, 0)
    : allTimeOpponentAttackDamage;
  const endGame = Math.max(normalizedTotalGames, points.length, 1);

  return {
    attackDamage,
    endGame,
    isTruncated,
    opponentAttackDamage,
    startGame: isTruncated ? endGame - points.length + 1 : 1
  };
}
