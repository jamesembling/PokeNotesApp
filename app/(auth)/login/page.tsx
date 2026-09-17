import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { ClearPrivateBrowserCache } from "@/components/ui/ClearPrivateBrowserCache";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/lib/auth";
import { getLoginAuthError } from "@/lib/server/login-error";
import { getLocalLoginPageState } from "@/lib/server/local-test-login";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    localError?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const authError = getLoginAuthError(params.error);
  const user = await getCurrentUser();
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "";
  const { requiresPairingCode, showLocalLogin } = getLocalLoginPageState(host);
  const localError =
    params.localError === "pairing-code"
      ? "That local pairing code was not accepted. Copy the current code from your Mac and try again."
      : params.localError === "sign-in"
        ? "The local test account could not be signed in. Run the local auth setup again on your Mac."
        : null;

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <ClearPrivateBrowserCache />
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <PageHeader
          breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Login" }]}
          title="Login"
          subtitle={
            showLocalLogin
              ? "Sign in locally to access your battle logs, strategy notes, and stats."
              : "Sign in with Google to access your battle logs, strategy notes, and stats."
          }
        />

        <Card className="max-w-xl">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-foreground">
              {showLocalLogin
                ? "Use the local test account and current pairing code to continue into Poke Notes on this device."
                : "Use your Google account to continue into Poke Notes."}
            </p>
            {authError ? (
              <Alert
                className="border-loss-border bg-loss-bg text-loss-strong"
                variant="destructive"
              >
                <AlertDescription>Google sign-in failed: {authError}</AlertDescription>
              </Alert>
            ) : null}
            {localError ? (
              <Alert
                className="border-loss-border bg-loss-bg text-loss-strong"
                variant="destructive"
              >
                <AlertDescription>{localError}</AlertDescription>
              </Alert>
            ) : null}
            <div>
              <form
                action={showLocalLogin ? "/auth/dev-login" : "/auth/sign-in/google"}
                className="flex flex-col gap-4"
                method="post"
              >
                {showLocalLogin && requiresPairingCode ? (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="local-pairing-code">Local pairing code</Label>
                    <Input
                      autoCapitalize="none"
                      autoComplete="one-time-code"
                      id="local-pairing-code"
                      name="pairingCode"
                      required
                      spellCheck={false}
                      type="password"
                    />
                    <p className="text-sm text-muted-foreground">
                      On your Mac, run npm run auth:local:copy-code, then paste the code here.
                    </p>
                  </div>
                ) : null}
                <Button type="submit">
                  {showLocalLogin ? "Sign in locally" : "Sign in with Google"}
                </Button>
              </form>
            </div>
            {showLocalLogin ? (
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
