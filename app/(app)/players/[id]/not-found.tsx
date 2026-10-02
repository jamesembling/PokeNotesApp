import Link from "next/link";
import { Button } from "@/components/shadcn/button";
import { PageHeader } from "@/components/ui/PageHeader";

export default function PlayerNotFound() {
  return <div><PageHeader breadcrumb={[{ label: "Poke Notes", href: "/dashboard" }, { label: "Friends", href: "/friends" }, { label: "Player profile" }]} title="Profile unavailable" /><p className="mt-6 max-w-prose text-sm leading-7 text-muted-foreground">This player profile is hidden or unavailable.</p><Button asChild className="mt-4" variant="outline"><Link href="/friends" prefetch={false}>Back to Friends</Link></Button></div>;
}
