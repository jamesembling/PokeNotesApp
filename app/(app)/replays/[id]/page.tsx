import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/shadcn/button";
import { BattleReplay } from "@/components/battle-replay/BattleReplay";
import { PageActions } from "@/components/ui/PageActions";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageWidth } from "@/components/ui/PageWidth";
import { ItemTitle } from "@/components/ui/Typography";
import { requireUser } from "@/lib/auth";
import { compileBattleReplay } from "@/lib/battle-replay/compiler";
import { getLogById } from "@/lib/db/logs";

export const metadata: Metadata = { title: "Battle Replay (Beta) | Poke Notes" };

export default async function ReplayPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ position?: string | string[] }>;
}) {
  const [user, { id }, query] = await Promise.all([requireUser(), params, searchParams]);
  if (!id || id.length > 256 || /[\u0000-\u001f\u007f]/.test(id)) notFound();
  const log = await getLogById(user.id, id);
  if (!log) notFound();
  const logHref = `/logs/${encodeURIComponent(log.id)}`;
  const program = compileBattleReplay(log);
  const requestedPosition = Array.isArray(query.position) ? query.position[0] : query.position;
  const position = requestedPosition && /^\d{1,8}$/.test(requestedPosition) ? Number(requestedPosition) : 0;
  const initialActionIndex = Math.min(position, Math.max(0, program.frames.length - 1));

  return <PageWidth size="wide">
    <PageHeader
      action={<PageActions><Button asChild variant="outline"><Link href={logHref} prefetch={false}>View Battle Log</Link></Button><Button asChild variant="outline"><Link href="/replays" prefetch={false}>Choose another game</Link></Button></PageActions>}
      breadcrumb={[{ label: "Poke Notes", href: "/dashboard" }, { label: "Battle Replay", href: "/replays" }, { label: "Replay" }]}
      subtitle="Beta · Follow the recorded actions. Hidden information and unresolved events remain labelled."
      title="Battle Replay"
    />
    {program.status === "unsupported" ? <section className="flex flex-col items-start gap-3 border-t border-border py-6" aria-label="Replay unavailable">
      <ItemTitle as="h2">This Battle Log cannot be replayed yet</ItemTitle>
      <p className="max-w-prose text-sm text-muted-foreground">Its saved actions do not contain enough supported information. You can still read the original Battle Log.</p>
      <Button asChild variant="outline"><Link href={logHref} prefetch={false}>View Battle Log</Link></Button>
    </section> : <BattleReplay initialActionIndex={initialActionIndex} key={program.id} program={program} />}
  </PageWidth>;
}
