import { Card } from "@/components/ui/Card";

export function TournamentSchemaNotice() {
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <p className="ui-eyebrow">Setup Required</p>
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
          Tournament tables have not been created in Supabase yet
        </h2>
        <p className="text-sm leading-6 text-[var(--text-secondary)]">
          The tournament routes are implemented in the app, but your current database does not yet
          include the new <code>tournaments</code> and <code>tournament_rounds</code> tables.
          Apply the latest SQL from <code>schema.sql</code>, then reload this page.
        </p>
      </div>
    </Card>
  );
}
