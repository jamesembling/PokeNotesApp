"use client";

import { SocialErrorState } from "@/components/ui/social/SocialErrorState";

export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <SocialErrorState retry={retry} title="Player profile" />;
}
