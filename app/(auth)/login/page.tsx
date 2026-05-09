import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { PageHeader } from "@/components/ui/PageHeader";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const authError = params.error ? decodeURIComponent(params.error) : null;

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
            <p className="text-sm text-foreground">
              Use your Google account to continue into Poke Notes.
            </p>
            {authError ? (
              <Alert
                className="border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] text-[var(--color-loss)]"
                variant="destructive"
              >
                <AlertDescription>Google sign-in failed: {authError}</AlertDescription>
              </Alert>
            ) : null}
            <div>
              <Button asChild>
                <a href="/auth/sign-in/google">Sign in with Google</a>
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}
