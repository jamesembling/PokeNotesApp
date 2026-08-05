const MIGRATION_FILENAME = /^(\d{14})_[A-Za-z0-9_-]+\.sql$/;

export const MIGRATION_PHASES = Object.freeze({
  "share-phase-one": Object.freeze({
    baselineBefore: "20260804210800",
    pendingMigrations: Object.freeze([
      "20260804210800_make_log_share_lifecycle_atomic.sql",
      "20260804210932_make_tournament_writes_atomic.sql"
    ])
  }),
  "share-phase-two": Object.freeze({
    baselineThrough: "20260804210932",
    pendingMigrations: Object.freeze([
      "20260804212228_harden_log_share_writes_after_atomic_cutover.sql"
    ]),
    confirmation: Object.freeze({
      environment: "POKENOTES_SHARE_APP_CUTOVER_CONFIRM",
      value: "verified-share-rpc-cutover"
    })
  }),
  "coin-stats": Object.freeze({
    baselineThrough: "20260804212228",
    pendingMigrations: Object.freeze([
      "20260804224244_add_coin_toss_losses_to_stats.sql"
    ]),
    confirmation: Object.freeze({
      environment: "POKENOTES_COIN_STATS_DATA_IMPACT_CONFIRM",
      value: "approved-current-recounted-coin-stats-impact"
    })
  })
});

export function migrationPhase(name) {
  const phase = MIGRATION_PHASES[name];
  if (!phase) {
    throw new Error(
      `Unknown migration phase ${name ?? "(missing)"}. Expected share-phase-one, share-phase-two, or coin-stats.`
    );
  }
  return phase;
}

export function selectMigrationFilesForPhase(name, filenames) {
  const phase = migrationPhase(name);
  const migrations = filenames
    .map((filename) => {
      const match = MIGRATION_FILENAME.exec(filename);
      return match ? { filename, version: match[1] } : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.filename.localeCompare(right.filename));

  const available = new Set(migrations.map(({ filename }) => filename));
  for (const expected of phase.pendingMigrations) {
    if (!available.has(expected)) {
      throw new Error(`Required ${name} migration is missing: ${expected}.`);
    }
  }

  const included = migrations.filter(({ filename, version }) => {
    if (phase.pendingMigrations.includes(filename)) return true;
    if (phase.baselineBefore) return version < phase.baselineBefore;
    return version <= phase.baselineThrough;
  });

  return {
    includedMigrations: included.map(({ filename }) => filename),
    pendingMigrations: [...phase.pendingMigrations]
  };
}

export function migrationPlanFromOutput(output) {
  return [...output.matchAll(/\b(\d{14}_[A-Za-z0-9_-]+\.sql)\b/g)].map(
    (match) => match[1]
  );
}

export function assertExactMigrationPlan(output, expectedMigrations) {
  const actual = migrationPlanFromOutput(output);
  if (
    actual.length !== expectedMigrations.length ||
    actual.some((migration, index) => migration !== expectedMigrations[index])
  ) {
    throw new Error(
      `Disposable migration plan mismatch. Expected ${expectedMigrations.join(", ")}; ` +
        `received ${actual.length > 0 ? actual.join(", ") : "no migrations"}.`
    );
  }
  return actual;
}

export function assertNoProtectedPhasedMigrations(output) {
  const protectedMigrations = new Set(
    Object.values(MIGRATION_PHASES).flatMap((phase) => phase.pendingMigrations)
  );
  const detected = migrationPlanFromOutput(output).filter((migration) =>
    protectedMigrations.has(migration)
  );
  if (detected.length > 0) {
    throw new Error(
      `Generic disposable migration rehearsal cannot include phased migrations: ${detected.join(", ")}. Use the reviewed --phase release path.`
    );
  }
}
