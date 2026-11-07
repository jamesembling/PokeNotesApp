/** Shared saved-Standard logical pool for replay and retained publication.
 * Older physical artwork is an alias question: without exact same-card/errata
 * evidence it cannot add an operative family beyond an eligible current print.
 * No provider live legality boolean is interpreted as a historical rule.
 */
const STANDARD_FORMAT_FLOORS = Object.freeze({ BRS: 'F', SVI: 'G', TEF: 'H' });
const PTCGL_STANDARD_ROTATIONS = Object.freeze([
  { day: '2024-03-21', floor: 'F', sourceUrl: 'https://www.pokemon.com/us/pokemon-news/2024-pokemon-tcg-standard-format-rotation-announcement' },
  { day: '2025-03-27', floor: 'G', sourceUrl: 'https://www.pokemon.com/uk/pokemon-news/2025-pokemon-tcg-standard-format-rotation-announcement' },
  { day: '2026-03-26', floor: 'H', sourceUrl: 'https://www.pokemon.com/us/news/2026-pokemon-tcg-standard-format-rotation-announcement', availableOn: '2026-03-26T17:00:00Z', availabilitySourceUrl: 'https://community.pokemon.com/en-us/discussion/23169/mega-evolution-perfect-order-expansion-release' },
]);
// Standard only. The official list was independently read on the review date;
// Expanded exclusions must not leak into these saved Standard domains.
const STANDARD_BAN_EVIDENCE = Object.freeze({
  reviewedOn: '2026-10-04', bannedSourceCardIds: Object.freeze([]),
  sourceUrl: 'https://www.pokemon.com/us/play-pokemon/about/pokemon-tcg-banned-card-list',
  historicalSourceUrl: 'https://www.pokemon.com/uk/play-pokemon/about/mega-evolution/mega-evolution-banned-list-and-rule-changes-announcement',
  historicalAnnouncementDate: '2025-09-11',
});
// These dates distinguish potentially new unmarked families from older aliases;
// they never invent a regulation mark or certify an older printing as playable.
const firstMarkedExpansion = { F: '2022-02-25', G: '2023-03-31', H: '2024-03-22' };
const endpoints = {
  'TEF-30C': { day: '2026-09-16', sourceUrl: 'https://api.tcgdex.net/v2/en/sets/30th' },
  'TEF-PBL': { day: '2026-07-17', sourceUrl: 'https://www.pokemon.com/us/news/the-pokemon-tcg-mega-evolution-pitch-black-expansion-arrives-july-17-2026' },
};
export function validCardDefinitionDay(value) {
  const day = typeof value === 'string' ? value.slice(0, 10) : undefined;
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  const time = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === day ? day : undefined;
}
const cardDefinitionInstant = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
/** Query instants use UTC days; date-only source evidence retains its day.
 * Invalid or timezone-less timestamps cannot recover certainty by truncation. */
export function cardDefinitionPlayedDay(value) {
  const day = validCardDefinitionDay(value);
  if (!day) return undefined;
  if (value.length === 10) return day;
  const instant = cardDefinitionInstant(value);
  return Number.isFinite(instant) ? new Date(instant).toISOString().slice(0, 10) : undefined;
}
// Exact provider set identities/dates checked against the primary set API.
// Official Live announcements provide availability instants, never a universal
// offset from physical release. A date-only launch-day query cannot tell which
// side of 17:00 UTC the game occurred on.
const PTCGL_SET_AVAILABILITY = Object.freeze({
  me01: { providerReleaseDate: '2025-09-26', availableOn: '2025-09-25T17:00:00Z', sourceUrl: 'https://community.pokemon.com/en-us/discussion/20181/mega-evolution-expansion-release' },
  'me02.5': { providerReleaseDate: '2026-01-30', availableOn: '2026-01-29T17:00:00Z', sourceUrl: 'https://community.pokemon.com/en-us/discussion/22091/mega-evolution-ascended-heroes-expansion-release' },
  me03: { providerReleaseDate: '2026-03-27', availableOn: '2026-03-26T17:00:00Z', sourceUrl: 'https://community.pokemon.com/en-us/discussion/23169/mega-evolution-perfect-order-expansion-release' },
});
export function cardDefinitionAvailability(card, playedOn) {
  const gameDay = cardDefinitionPlayedDay(playedOn), providerDay = validCardDefinitionDay(card.setReleaseDate);
  const announced = PTCGL_SET_AVAILABILITY[card.setId];
  if (announced && providerDay === announced.providerReleaseDate) {
    const day = announced.availableOn.slice(0, 10);
    const instant = cardDefinitionInstant(playedOn);
    const status = !gameDay ? 'unverified' : Number.isFinite(instant)
      ? instant >= Date.parse(announced.availableOn) ? 'available' : 'unavailable'
      : gameDay > day ? 'available' : gameDay < day ? 'unavailable' : 'unverified';
    return { status, day, availableOn: announced.availableOn, basis: 'ptcgl-announcement', sourceUrl: announced.sourceUrl };
  }
  if (announced) return { status: 'unverified', ...(providerDay ? { day: providerDay } : {}), basis: 'unknown', sourceUrl: announced.sourceUrl };
  // A past primary release is the existing provider evidence. An unannounced
  // launch boundary cannot prove digital unavailability or establish eligibility.
  return { status: gameDay && providerDay && providerDay < gameDay ? 'available' : 'unverified',
    ...(providerDay ? { day: providerDay } : {}), basis: providerDay ? 'provider-release-date' : 'unknown' };
}
const name = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g,"'").toLowerCase().replace(/[^a-z0-9'+-]+/g,' ').replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim();
const basicTypes = new Set(['grass','fire','water','lightning','psychic','fighting','darkness','metal']);
export function isSupportedBasicEnergy(card) {
  if (card.category !== 'Energy' || card.abilities.length || card.attacks.length || card.rules?.length) return false;
  const match = /^(basic )?(grass|fire|water|lightning|psychic|fighting|darkness|metal) energy$/.exec(name(card.name));
  if (!match || (!match[1] && card.energyType !== 'Normal') || card.energyType === 'Special') return false;
  if (card.types == null) return Boolean(match[1]) && card.energyType === 'Normal';
  return Array.isArray(card.types) && card.types.length === 1 && basicTypes.has(name(card.types[0])) && name(card.types[0]) === match[2];
}
export function standardFormatFloor(declared) {
  return typeof declared === 'string' && /^(BRS|SVI|TEF)-[A-Z0-9]{3}(?:\/[A-Z0-9]{3})?$/.test(declared)
    ? STANDARD_FORMAT_FLOORS[declared.split('-')[0]] : undefined;
}
export function ptcglStandardRotation(playedOn) {
  const day = cardDefinitionPlayedDay(playedOn);
  // Announced annual calendars cover 2024–2026. Do not turn the review date
  // into a daily service expiry or invent the next year's rotation calendar.
  if (!day || day > '2026-12-31') return undefined;
  const instant = cardDefinitionInstant(playedOn);
  for (const rotation of [...PTCGL_STANDARD_ROTATIONS].reverse()) {
    if (rotation.availableOn) {
      if (Number.isFinite(instant)) {
        if (instant >= Date.parse(rotation.availableOn)) return rotation;
      } else {
        // The official 2026 launch notice ties rotation to this instant. A
        // date-only boundary cannot assert either side's legal name domain.
        if (day === rotation.day) return undefined;
        if (day > rotation.day) return rotation;
      }
    } else if (rotation.day <= day) return rotation;
  }
  return undefined;
}
/** Unverified arrays are diagnostics/proof blockers, never selectable printings.
 * Exact recorded identities must be resolved from the original input separately.
 * verifiedAbsentMark is supplied only by the authored scan-bound validator.
 */
export function partitionCardDefinitionsForFormat(definitions, query = {}, verifiedAbsentMark = () => false) {
  const declared = query.declaredFormat;
  const declaredFloor = standardFormatFloor(declared);
  const playedDate = cardDefinitionPlayedDay(query.playedOn);
  const retention = query.purpose === 'retention';
  const rotation = !retention && playedDate ? ptcglStandardRotation(query.playedOn) : undefined;
  const floor = declaredFloor && (query.playedOn !== undefined && !playedDate ? undefined : !playedDate || retention ? declaredFloor : rotation?.floor);
  const endpoint = endpoints[declared];
  // The saved newest-set suffix can lag the actual game. The recorded game day
  // supplies the upper bound when present. An undated newest-set suffix remains
  // advisory evidence and cannot exclude a later logged native effect.
  const upper = playedDate;
  const legal = [], unverified = [], aliases = [], excluded = [];
  const reasons = [];
  for (const card of definitions) {
    const day = validCardDefinitionDay(card.setReleaseDate);
    const availability = upper ? cardDefinitionAvailability(card, query.playedOn) : undefined;
    if (availability?.status === 'unavailable') { excluded.push(card); reasons.push({ sourceCardId: card.sourceCardId, reason: 'before_verified_ptcgl_availability' }); continue; }
    if (!floor) { unverified.push(card); continue; }
    const mark = /^[A-Z]$/.test(card.regulationMark ?? '') ? card.regulationMark : undefined;
    if ((mark && mark >= floor || isSupportedBasicEnergy(card)) && day && (!upper || availability?.status === 'available')) { legal.push(card); continue; }
    if (mark && mark < floor || verifiedAbsentMark(card) || day && day < firstMarkedExpansion[floor]) {
      aliases.push(card); reasons.push({ sourceCardId: card.sourceCardId, reason: 'older_physical_alias_requires_exact_reprint_evidence' }); continue;
    }
    unverified.push(card); reasons.push({ sourceCardId: card.sourceCardId, reason: !day ? 'missing_printing_release_date' : availability?.status === 'unverified' ? 'unverified_ptcgl_availability' : 'missing_regulation_mark' });
  }
  return { legal, unverified, aliases, excluded, basis: {
    declared: declared ?? '', status: !floor ? 'unsupported' : rotation && floor !== declaredFloor ? 'conflicting' : unverified.length || !upper ? 'partial' : 'applied',
    ...(floor ? { minimumRegulationMark: floor } : {}), ...(upper ? { latestReleaseDate: upper } : {}),
    ...(declaredFloor ? { declaredMinimumRegulationMark: declaredFloor } : {}),
    ...(rotation ? { rotationSourceUrl: rotation.sourceUrl, rotationDay: rotation.day, ...(rotation.availableOn ? { rotationAvailableOn: rotation.availableOn, rotationAvailabilitySourceUrl: rotation.availabilitySourceUrl } : {}) } : {}),
    ...(endpoint ? { releaseSourceUrl: endpoint.sourceUrl, declaredLatestSetReleaseDate: endpoint.day } : {}), ...(playedDate ? { playedDate } : {}),
    ...(floor ? { banEvidence: STANDARD_BAN_EVIDENCE } : {}),
    legalPrintingIds: legal.map((card) => card.sourceCardId), unverifiedPrintingIds: unverified.map((card) => card.sourceCardId),
    aliasPrintingIds: aliases.map((card) => card.sourceCardId), excludedPrintingIds: excluded.map((card) => card.sourceCardId), reasons,
  }};
}
