import type { CardDefinition, CardDefinitionSourceCoverage } from "./types";
export function readSavedFormatInventory(client: unknown): Promise<string[]>;
export function publishCardDefinitionGeneration(client: unknown, input: { generationId: string; sourceManifestHash: string; sourceCoverage: CardDefinitionSourceCoverage; definitions: readonly CardDefinition[]; upstreamDefinitions: readonly CardDefinition[]; expectedSavedFormats: readonly string[] }): Promise<{generationId:string;storedPrintings:number;readbackVerified:true}>;
