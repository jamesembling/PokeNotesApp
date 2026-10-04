import type { CardDefinition, CardDefinitionEvidence, CardDefinitionQuery } from './types';
export const STANDARD_FORMAT_FLOORS: Readonly<{ BRS: 'F'; SVI: 'G'; TEF: 'H' }>;
export const PTCGL_STANDARD_ROTATIONS: readonly { day: string; floor: string; sourceUrl: string; availableOn?: string; availabilitySourceUrl?: string }[];
export const STANDARD_BAN_EVIDENCE: Readonly<{ reviewedOn: string; bannedSourceCardIds: readonly string[]; sourceUrl: string; historicalSourceUrl: string; historicalAnnouncementDate: string }>;
export function validCardDefinitionDay(value?: string | null): string | undefined;
export const PTCGL_SET_AVAILABILITY: Readonly<Record<string,{ providerReleaseDate: string; availableOn: string; sourceUrl: string }>>;
export function cardDefinitionAvailability(card: Pick<CardDefinition, 'setId' | 'setReleaseDate'>, playedOn?: string): { status: 'available' | 'unavailable' | 'unverified'; day?: string; availableOn?: string; basis: 'ptcgl-announcement' | 'provider-release-date' | 'unknown'; sourceUrl?: string };
export function cardDefinitionPlayedDay(value?: string | null): string | undefined;
export function isSupportedBasicEnergy(card: CardDefinition): boolean;
export function standardFormatFloor(declared?: string): string | undefined;
export function ptcglStandardRotation(playedOn?: string): { day: string; floor: string; sourceUrl: string; availableOn?: string; availabilitySourceUrl?: string } | undefined;
export function partitionCardDefinitionsForFormat(definitions: readonly CardDefinition[], query?: Pick<CardDefinitionQuery, 'declaredFormat' | 'playedOn'> & { purpose?: 'retention' }, verifiedAbsentMark?: (card: CardDefinition) => boolean): {
  legal: CardDefinition[]; unverified: CardDefinition[]; aliases: CardDefinition[]; excluded: CardDefinition[];
  basis: NonNullable<CardDefinitionEvidence['formatBasis']>;
};
