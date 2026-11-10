"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useId, useState, useTransition, type ReactNode } from "react";
import {
  CalculatorIcon,
  CardsIcon,
  ChartLineIcon,
  ClipboardTextIcon,
  HouseIcon,
  ListBulletsIcon,
  PlayCircleIcon,
  TrophyIcon,
  UsersIcon,
  type Icon
} from "@phosphor-icons/react";
import { BadgeCheckIcon, ChevronsUpDownIcon, LogOutIcon, MenuIcon, ShieldIcon } from "lucide-react";
import { signOutAction } from "@/app/actions";
import { clearLastKnownLogsSnapshot } from "@/lib/client/logs-last-known";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/shadcn/dropdown-menu";
import { LazyImportLogButton } from "@/components/ui/LazyImportLogButton";
import { ProfileAvatar } from "@/components/ui/ProfileAvatar";
import { useFriendRequestCount } from "@/lib/social/use-friend-request-count";
import { SidebarThemeToggle } from "@/components/ui/SidebarThemeToggle";
import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar
} from "@/components/shadcn/sidebar";
import type { AvatarColor, DeckSelectionOption } from "@/types/index";

type SidebarProfile = {
  displayName: string;
  email: string;
  avatarColor: AvatarColor;
  avatarUrl?: string | null;
  isAdmin?: boolean;
};

type SidebarProps = {
  account: ReactNode;
  userDecks?: DeckSelectionOption[];
};

const navItems: Array<{ label: string; href: string; icon: Icon; beta?: boolean }> = [
  { label: "Dashboard", href: "/dashboard", icon: HouseIcon },
  { label: "Battle Logs", href: "/logs", icon: ClipboardTextIcon },
  { label: "Battle Replay", href: "/replays", icon: PlayCircleIcon, beta: true },
  { label: "Deck Strategy", href: "/decks", icon: CardsIcon },
  { label: "Deck Lists", href: "/deck-lists", icon: ListBulletsIcon },
  { label: "Tournaments", href: "/tournaments", icon: TrophyIcon },
  { label: "Stats", href: "/stats", icon: ChartLineIcon },
  { label: "Friends", href: "/friends", icon: UsersIcon },
  { label: "Probability Calculator", href: "/calculator", icon: CalculatorIcon }
];

function getInitials(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "PN";
  }

  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function AppSidebarLink({ href, icon: Icon, label, beta = false, incomingRequests = 0 }: { href: string; icon: Icon; label: string; beta?: boolean; incomingRequests?: number }) {
  const pathname = usePathname();
  const requestDescriptionId = useId();
  const { setOpenMobile } = useSidebar();
  const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        className="relative px-6 data-[active=true]:!rounded-none data-[active=true]:!bg-[var(--sidebar-active-bg)] data-[active=true]:font-semibold data-[active=true]:!text-[var(--sidebar-active-text)] data-[active=true]:hover:!bg-[var(--sidebar-active-bg-hover)] data-[active=true]:hover:!text-[var(--sidebar-active-text)] group-data-[collapsible=icon]:!h-10 group-data-[collapsible=icon]:!w-full group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:[&>span]:hidden group-data-[collapsible=icon]:[&_svg]:!size-6"
        isActive={active}
        tooltip={beta ? `${label} (Beta)` : label}
      >
        <Link aria-label={beta ? `${label} (Beta)` : undefined} aria-describedby={incomingRequests > 0 ? requestDescriptionId : undefined} href={href} onClick={() => setOpenMobile(false)} prefetch={false}>
          <Icon
            aria-hidden="true"
            className={
              active
                ? "text-[var(--sidebar-active-text)]"
                : "text-sidebar-foreground/75"
            }
            weight={active ? "fill" : "regular"}
          />
          <span>{label}</span>
          {beta ? <span aria-hidden="true" className={`ml-auto shrink-0 text-xs ${active ? "text-[var(--sidebar-active-text)]" : "text-sidebar-foreground/75"}`}>Beta</span> : null}
          {incomingRequests > 0 ? <span aria-hidden="true" className="ml-auto size-2 shrink-0 rounded-full bg-primary ring-2 ring-background group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:right-2 group-data-[collapsible=icon]:top-2 group-data-[collapsible=icon]:!block" data-friend-request-indicator="" /> : null}
        </Link>
      </SidebarMenuButton>
      {incomingRequests > 0 ? <span className="sr-only" id={requestDescriptionId}>{incomingRequests} pending friend {incomingRequests === 1 ? "request" : "requests"}</span> : null}
    </SidebarMenuItem>
  );
}

function SidebarLogo({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      aria-label="Go to Poke Notes home"
      className="inline-flex items-center"
      href="/dashboard"
      onClick={onNavigate}
      prefetch={false}
    >
      <Image
        alt="Poke Notes"
        className="size-12 group-data-[collapsible=icon]:size-8"
        height={48}
        loading="eager"
        src="/pokeball-icon.svg"
        width={48}
      />
    </Link>
  );
}

export function SidebarMobileTopbar() {
  const { setOpenMobile } = useSidebar();

  return (
    <div className="sticky top-0 z-30 border-b border-sidebar-border bg-sidebar px-4 py-2 min-[860px]:hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            aria-label="Open navigation menu"
            className="text-sidebar-foreground"
            onClick={() => setOpenMobile(true)}
            size="icon-lg"
            variant="ghost"
          >
            <MenuIcon />
          </Button>
          <SidebarLogo />
        </div>
        <SidebarThemeToggle />
      </div>
    </div>
  );
}

function SidebarNav({ userDecks }: { userDecks?: DeckSelectionOption[] }) {
  const incomingRequests = useFriendRequestCount();
  return (
    <SidebarContent className="px-2 py-3 group-data-[collapsible=icon]:px-0">
      <SidebarGroup className="group-data-[collapsible=icon]:p-0">
        <SidebarGroupContent>
          <SidebarMenu className="-mx-4 w-[calc(100%+2rem)] gap-1 group-data-[collapsible=icon]:mx-0 group-data-[collapsible=icon]:w-full">
            {navItems.map((item) => (
              <AppSidebarLink
                href={item.href}
                icon={item.icon}
                key={item.href}
                label={item.label}
                beta={item.beta}
                incomingRequests={item.href === "/friends" ? incomingRequests : 0}
              />
            ))}
          </SidebarMenu>
          <div className="px-2 pt-4 group-data-[collapsible=icon]:hidden">
            <LazyImportLogButton className="w-full justify-center max-sm:min-h-11" initialUserDecks={userDecks} />
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  );
}

export function SidebarAccount({ profile }: { profile: SidebarProfile }) {
  const initials = getInitials(profile.displayName);
  const { isMobile, setOpenMobile } = useSidebar();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [signOutPending, startSignOutTransition] = useTransition();

  function closeAccountNavigationMenus() {
    setAccountMenuOpen(false);
    setOpenMobile(false);
  }

  function handleAccountMenuOpenChange(open: boolean) {
    setAccountMenuOpen(open);
  }

  function handleSignOut() {
    startSignOutTransition(async () => {
      clearLastKnownLogsSnapshot();
      await signOutAction();
    });
  }

  return (
    <SidebarFooter className="border-t border-sidebar-border p-2 group-data-[collapsible=icon]:p-0">
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu
            modal={false}
            open={accountMenuOpen}
            onOpenChange={handleAccountMenuOpenChange}
          >
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:!h-12 group-data-[collapsible=icon]:!w-full group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:rounded-none group-data-[collapsible=icon]:p-0"
                size="lg"
              >
                <ProfileAvatar avatarUrl={profile.avatarUrl} avatarColor={profile.avatarColor} fallback={initials} />
                <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-medium">{profile.displayName}</span>
                  <span className="truncate text-xs text-muted-foreground">{profile.email}</span>
                </div>
                <ChevronsUpDownIcon className="ml-auto group-data-[collapsible=icon]:hidden" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="min-w-56 rounded-lg"
              side={isMobile ? "bottom" : "top"}
              sideOffset={4}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <ProfileAvatar avatarUrl={profile.avatarUrl} avatarColor={profile.avatarColor} fallback={initials} />
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{profile.displayName}</span>
                    <span className="truncate text-xs text-muted-foreground">{profile.email}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                  <Link
                    href="/profile"
                    onClick={closeAccountNavigationMenus}
                    prefetch={false}
                  >
                    <BadgeCheckIcon />
                    Account
                  </Link>
                </DropdownMenuItem>
                {profile.isAdmin ? (
                  <DropdownMenuItem asChild>
                    <Link
                      href="/admin/dashboard"
                      onClick={closeAccountNavigationMenus}
                    >
                      <ShieldIcon />
                      Admin Dashboard
                    </Link>
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  disabled={signOutPending}
                  onSelect={(event) => {
                    event.preventDefault();
                    handleSignOut();
                  }}
                >
                  <LogOutIcon />
                  {signOutPending ? "Signing Out..." : "Sign Out"}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}

export function SidebarAccountFallback() {
  return (
    <SidebarFooter
      aria-hidden="true"
      className="border-t border-sidebar-border p-2 group-data-[collapsible=icon]:p-0"
    >
      <div className="flex h-12 items-center gap-2 px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
        <Skeleton className="size-8 shrink-0 rounded-full" />
        <div className="grid flex-1 gap-1.5 group-data-[collapsible=icon]:hidden">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-32 max-w-full" />
        </div>
      </div>
    </SidebarFooter>
  );
}

export function Sidebar({ account, userDecks }: SidebarProps) {
  const { setOpenMobile } = useSidebar();

  return (
    <ShadcnSidebar className="border-sidebar-border" collapsible="icon">
      <SidebarHeader className="p-4 group-data-[collapsible=icon]:p-2">
        <div className="flex items-center justify-between gap-3 group-data-[collapsible=icon]:justify-center">
          <SidebarLogo onNavigate={() => setOpenMobile(false)} />
          <div className="flex items-center gap-1 group-data-[collapsible=icon]:hidden min-[860px]:hidden">
            <SidebarThemeToggle />
            <Button
              aria-label="Close navigation menu"
              className="text-sidebar-foreground min-[860px]:hidden"
              onClick={() => setOpenMobile(false)}
              size="icon-lg"
              variant="ghost"
            >
              <MenuIcon />
            </Button>
          </div>
        </div>
      </SidebarHeader>
      <SidebarNav userDecks={userDecks} />
      {account}
      <SidebarRail />
    </ShadcnSidebar>
  );
}
