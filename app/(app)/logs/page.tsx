import { LazyImportLogButton } from "@/components/ui/LazyImportLogButton";
import { LogsSummaryCardsClient } from "@/components/ui/LogsSummaryCardsClient";
import { LogsWorkspaceClient } from "@/components/ui/LogsWorkspaceClient";
import { PageHeader } from "@/components/ui/PageHeader";

export default function LogsPage() {
  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Poke Notes", href: "/" },
          { label: "Battle Logs" }
        ]}
        title="Battle Logs"
        action={
          <LazyImportLogButton className="w-full justify-center sm:w-auto" />
        }
      />

      <LogsSummaryCardsClient />

      <LogsWorkspaceClient />
    </>
  );
}
