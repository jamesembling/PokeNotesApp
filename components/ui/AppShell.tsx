import { Suspense, type ReactNode } from "react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/shadcn/sidebar";
import { RoutePerformanceReporter } from "@/components/ui/RoutePerformanceReporter";
import { RouteTimingMarker } from "@/components/ui/RouteTimingMarker";
import {
  Sidebar,
  SidebarAccount,
  SidebarAccountFallback,
  SidebarMobileTopbar
} from "@/components/ui/Sidebar";
import { SidebarThemeToggle } from "@/components/ui/SidebarThemeToggle";
import { ImportDialogDataProvider } from "@/components/ui/ImportDialogDataProvider";
import type { AvatarColor } from "@/types/index";

export type AppShellProfile = {
  avatarColor: AvatarColor;
  displayName: string;
  email: string;
  isAdmin?: boolean;
};

export type AppShellProfileResult = {
  durationMs: number;
  profile: AppShellProfile;
};

type AppShellProps = {
  children: ReactNode;
  profilePromise: Promise<AppShellProfileResult>;
};

async function SidebarAccountContent({
  profilePromise
}: {
  profilePromise: Promise<AppShellProfileResult>;
}) {
  const { durationMs, profile } = await profilePromise;

  return (
    <>
      <SidebarAccount profile={profile} />
      <RouteTimingMarker durationMs={durationMs} phase="shell-profile" />
    </>
  );
}

export function AppShell({ children, profilePromise }: AppShellProps) {
  return (
    <ImportDialogDataProvider>
      <SidebarProvider>
        <a
          className="fixed left-3 top-3 z-50 -translate-y-20 rounded-md bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-sm outline-none transition-transform focus:translate-y-0 focus:ring-2 focus:ring-ring"
          href="#main-content"
        >
          Skip to main content
        </a>
        <Sidebar
          account={
            <Suspense fallback={<SidebarAccountFallback />}>
              <SidebarAccountContent profilePromise={profilePromise} />
            </Suspense>
          }
        />
        <SidebarInset id="main-content" tabIndex={-1}>
          <SidebarMobileTopbar />
          <div className="hidden px-3 pt-3 min-[860px]:flex min-[860px]:items-center min-[860px]:gap-1 sm:px-5 lg:px-7">
            <SidebarTrigger size="icon-lg" />
            <SidebarThemeToggle tone="page" />
          </div>
          <div className="px-4 pb-6 pt-4 sm:px-6 sm:pb-8 sm:pt-5 lg:px-8">
            <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-6">{children}</div>
          </div>
        </SidebarInset>
        <RoutePerformanceReporter />
      </SidebarProvider>
    </ImportDialogDataProvider>
  );
}
