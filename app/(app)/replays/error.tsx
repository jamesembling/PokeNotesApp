"use client";

import Link from "next/link";
import { Button } from "@/components/shadcn/button";
import { PageActions } from "@/components/ui/PageActions";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageWidth } from "@/components/ui/PageWidth";

export default function ReplayError({ retry }: { retry: () => void }) {
  return <PageWidth size="standard">
    <PageHeader breadcrumb={[{ label: "Poke Notes", href: "/dashboard" }, { label: "Battle Replay" }]} title="Battle Replay could not load" />
    <p className="max-w-prose text-sm text-muted-foreground">Try loading the replay again, or return to your Battle Logs.</p>
    <PageActions><Button onClick={retry} variant="outline">Retry</Button><Button asChild variant="outline"><Link href="/logs" prefetch={false}>Battle Logs</Link></Button></PageActions>
  </PageWidth>;
}
