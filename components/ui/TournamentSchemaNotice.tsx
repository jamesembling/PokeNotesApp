import { Card } from "@/components/ui/Card";

export function TournamentSchemaNotice() {
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <p className="ui-eyebrow">Setup Required</p>
        <h2 className="text-base font-semibold text-card-foreground">
          Tournament tables are missing from this database
        </h2>
        <p className="text-sm leading-6 text-foreground">
          This app expects the <code>tournaments</code> and <code>tournament_rounds</code> tables
          to exist. For a new project, run <code>schema.sql</code>. For an existing project,
          apply the relevant migration files in <code>sql/</code>, then reload this page.
        </p>
      </div>
    </Card>
  );
}
