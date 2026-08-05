export interface MigrationPhase {
  readonly baselineBefore?: string;
  readonly baselineThrough?: string;
  readonly pendingMigrations: readonly string[];
  readonly confirmation?: {
    readonly environment: string;
    readonly value: string;
  };
}

export const MIGRATION_PHASES: Readonly<Record<string, MigrationPhase>>;

export function migrationPhase(name: string): MigrationPhase;

export function selectMigrationFilesForPhase(
  name: string,
  filenames: string[]
): {
  includedMigrations: string[];
  pendingMigrations: string[];
};

export function migrationPlanFromOutput(output: string): string[];

export function assertExactMigrationPlan(
  output: string,
  expectedMigrations: string[]
): string[];

export function assertNoProtectedPhasedMigrations(output: string): void;
