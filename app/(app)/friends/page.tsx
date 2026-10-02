import { FriendsView } from "@/components/ui/social/FriendsView";
import { getCurrentShowcase, getFriendConnections, searchPlayers } from "@/lib/db/social";

export default async function FriendsPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 40) : "";
  const [showcase, connections, results] = await Promise.all([
    getCurrentShowcase(),
    getFriendConnections(),
    query ? searchPlayers(query) : Promise.resolve([])
  ]);
  return <FriendsView connections={connections} query={query} results={results} showcase={showcase} />;
}
