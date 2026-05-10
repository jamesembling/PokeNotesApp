import Link from "next/link";
import { Button } from "@/components/shadcn/button";
import { ButtonGroup } from "@/components/shadcn/button-group";
import { Card } from "@/components/shadcn/card";

export default function NotFound() {
  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <Card className="space-y-4">
          <div className="space-y-2">
            <p className="ui-eyebrow">Not Found</p>
            <h1 className="font-display text-3xl font-semibold tracking-[-0.04em] text-card-foreground">
              That page does not exist in this workspace.
            </h1>
            <p className="text-sm text-foreground">
              The route may have moved, or you may need to sign in before it becomes available.
            </p>
          </div>

          <ButtonGroup className="max-w-full flex-wrap">
            <Button asChild>
              <Link href="/">Back Home</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/login">Go to Login</Link>
            </Button>
          </ButtonGroup>
        </Card>
      </div>
    </main>
  );
}
