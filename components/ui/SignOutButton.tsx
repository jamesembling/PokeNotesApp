"use client";

import { useTransition } from "react";
import { signOutAction } from "@/app/actions";
import { Button } from "@/components/shadcn/button";

export function SignOutButton({ className }: { className?: string }) {
  const [signOutPending, startSignOutTransition] = useTransition();

  const handleSignOut = async () => {
    startSignOutTransition(async () => {
      await signOutAction();
    });
  };

  return (
    <Button
      className={className}
      disabled={signOutPending}
      onClick={handleSignOut}
      variant="outline"
    >
      {signOutPending ? "Signing Out..." : "Sign Out"}
    </Button>
  );
}
