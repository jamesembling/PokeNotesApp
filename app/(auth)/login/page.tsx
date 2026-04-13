"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    setIsLoading(true);

    const supabase = await createClient();
    const redirectTo = new URL("/auth/callback", window.location.origin).toString();

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo
      }
    });

    if (error) {
      setIsLoading(false);
    }
  };

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <PageHeader
          breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Login" }]}
          title="Login"
          subtitle="Sign in with Google to access your battle logs, strategy notes, and stats."
        />

        <Card className="max-w-xl">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-[var(--text-secondary)]">
              Use your Google account to continue into Poke Notes.
            </p>
            <div>
              <Button disabled={isLoading} onClick={handleSignIn}>
                {isLoading ? "Redirecting..." : "Sign in with Google"}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}
