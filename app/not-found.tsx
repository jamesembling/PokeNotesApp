import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function NotFound() {
  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <Card className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-kicker)]">
              Not Found
            </p>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              That page does not exist in this workspace.
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              The route may have moved, or you may need to sign in before it becomes available.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href="/">
              <Button>Back Home</Button>
            </Link>
            <Link href="/login">
              <Button variant="secondary">Go to Login</Button>
            </Link>
          </div>
        </Card>
      </div>
    </main>
  );
}
