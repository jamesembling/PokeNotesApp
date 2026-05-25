import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/shadcn/sidebar";
import { RoutePerformanceReporter } from "@/components/ui/RoutePerformanceReporter";
import { Sidebar, SidebarMobileTopbar } from "@/components/ui/Sidebar";
import type { AvatarColor } from "@/types/index";

type AppShellProfile = {
  avatarColor: AvatarColor;
  displayName: string;
  email: string;
  isAdmin?: boolean;
};

type AppShellProps = {
  children: ReactNode;
  profile: AppShellProfile;
};

export function AppShell({ children, profile }: AppShellProps) {
  return (
    <SidebarProvider>
      <Sidebar profile={profile} />
      <SidebarInset>
        <SidebarMobileTopbar />
        <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-6">{children}</div>
        </div>
      </SidebarInset>
      <RoutePerformanceReporter />
    </SidebarProvider>
  );
}
