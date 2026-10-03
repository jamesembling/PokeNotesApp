import Link from "next/link";
import { Button } from "@/components/shadcn/button";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageWidth } from "@/components/ui/PageWidth";

export default function ReplayNotFound() {
  return <PageWidth size="standard">
    <PageHeader breadcrumb={[{ label: "Battle Replay", href: "/replays" }, { label: "Unavailable" }]} title="Replay unavailable" />
    <p className="max-w-prose text-sm text-muted-foreground">This Battle Log is unavailable or you do not have access to it.</p>
    <Button asChild className="self-start" variant="outline"><Link href="/replays" prefetch={false}>Choose a Battle Log</Link></Button>
  </PageWidth>;
}
