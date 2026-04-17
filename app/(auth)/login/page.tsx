import { Card } from "@/components/ui/Card";
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
            <p className="text-sm text-[var(--text-secondary)]">
              Use your Google account to continue into Poke Notes.
            </p>
            {authError ? (
              <div className="rounded-lg border border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] px-4 py-3 text-sm text-[var(--color-loss)]">
                Google sign-in failed: {authError}
              </div>
            ) : null}
            <div>
              <a
                className="ui-control-text inline-flex items-center justify-center rounded-lg bg-[var(--color-brand)] px-4 py-2 text-[var(--text-inverse)] transition hover:bg-[var(--color-brand-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-page)]"
                href="/auth/sign-in/google"
              >
                Sign in with Google
              </a>
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}
