import type { Metadata } from "next";
import {
  generateSharedLogMetadata,
  SharedLogPage
} from "@/components/ui/SharedLogPage";

type SharedLogPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export async function generateMetadata({ params }: SharedLogPageProps): Promise<Metadata> {
  const { token } = await params;
  return generateSharedLogMetadata(token);
}

export default async function LegacySharedLogPage({ params }: SharedLogPageProps) {
  const { token } = await params;
  return <SharedLogPage token={token} />;
}
