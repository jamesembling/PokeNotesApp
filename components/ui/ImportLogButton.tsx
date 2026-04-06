"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";

type ImportLogButtonProps = {
  className?: string;
};

export function ImportLogButton({ className }: ImportLogButtonProps) {
  return (
    <Link href="/logs#import-log">
      <Button className={className}>Import PTCGL Log</Button>
    </Link>
  );
}
