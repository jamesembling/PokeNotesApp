import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function ProfilePage() {
  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Profile" }]}
        title="Profile"
        subtitle="Your account settings and PTCGL identity will be managed here."
      />

      <Card>
        <p className="text-sm text-[var(--text-secondary)]">
          Profile editing and preferences will be connected here.
        </p>
      </Card>
    </>
  );
}
