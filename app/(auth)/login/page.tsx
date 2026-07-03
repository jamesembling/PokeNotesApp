import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/lib/auth";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

function isLocalDevHost(host: string) {
  const normalizedHost = host.toLowerCase();

  return (
    normalizedHost.startsWith("localhost") ||
    normalizedHost.startsWith("127.0.0.1") ||
    normalizedHost.startsWith("192.168.") ||
    normalizedHost.endsWith(".local:3000")
  );
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const authError = params.error ? decodeURIComponent(params.error) : null;
  const user = await getCurrentUser();
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "";
  const showDevLogin =
    process.env.NODE_ENV !== "production" &&
    process.env.POKE_NOTES_ENABLE_TEST_LOGIN === "1" &&
    isLocalDevHost(host);

  if (user) {
    redirect("/logs");
  }

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <PageHeader
          breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Login" }]}
          title="Login"
          subtitle={
            showDevLogin
              ? "Sign in locally to access your battle logs, strategy notes, and stats."
              : "Sign in with Google to access your battle logs, strategy notes, and stats."
          }
        />

        <Card className="max-w-xl">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-foreground">
              {showDevLogin
                ? "Use the local test account to continue into Poke Notes on this device."
                : "Use your Google account to continue into Poke Notes."}
            </p>
            {authError ? (
              <Alert
                className="border-loss-border bg-loss-bg text-loss"
                variant="destructive"
              >
                <AlertDescription>Google sign-in failed: {authError}</AlertDescription>
              </Alert>
            ) : null}
            <div>
              <form action={showDevLogin ? "/auth/dev-login" : "/auth/sign-in/google"} method="post">
                <Button type="submit">
                  {showDevLogin ? "Sign in locally" : "Sign in with Google"}
                </Button>
              </form>
            </div>
            {showDevLogin ? (
              <form action="/auth/sign-in/google" method="post">
                <Button type="submit" variant="outline">
                  Sign in with Google
                </Button>
              </form>
            ) : null}
          </div>
        </Card>
      </div>
    </main>
  );
}
