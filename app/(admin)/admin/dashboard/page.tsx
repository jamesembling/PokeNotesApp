import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function AdminDashboardPage() {
  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Poke Notes", href: "/" },
          { label: "Admin" },
          { label: "Dashboard" }
        ]}
        title="Admin Dashboard"
        subtitle="Operational controls and platform health will live here."
      />

      <Card>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Admin Dashboard</h2>
      </Card>
    </>
  );
}
