import { BattleLogDetailClientPage } from "@/components/ui/BattleLogDetailClientPage";

type LogDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function LogDetailPage({ params }: LogDetailPageProps) {
  const { id } = await params;

  return <BattleLogDetailClientPage logId={id} />;
}
