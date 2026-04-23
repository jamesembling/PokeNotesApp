"use client";

import { useTransition } from "react";
import { signOutAction } from "@/app/actions";
import { Button } from "@/components/ui/Button";

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
      variant="secondary"
    >
      {signOutPending ? "Signing Out..." : "Sign Out"}
    </Button>
  );
}
