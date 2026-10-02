import { notFound } from "next/navigation";
import { PlayerProfile } from "@/components/ui/social/PlayerProfile";
import { getCurrentShowcase, getPlayerProfile } from "@/lib/db/social";

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const [profile, showcase] = await Promise.all([getPlayerProfile(id), getCurrentShowcase()]);
  if (!profile) notFound();
  return <PlayerProfile canConnect={showcase.enabled} profile={profile} />;
}
