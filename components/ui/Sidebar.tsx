"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import {
  CalculatorIcon,
  CardsIcon,
  ChartLineIcon,
  ClipboardTextIcon,
  TrophyIcon,
  type Icon
} from "@phosphor-icons/react";
import { BadgeCheckIcon, ChevronsUpDownIcon, LogOutIcon, MenuIcon, ShieldIcon } from "lucide-react";
import { signOutAction } from "@/app/actions";
import { Avatar, AvatarFallback } from "@/components/shadcn/avatar";
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
import { SidebarThemeToggle } from "@/components/ui/SidebarThemeToggle";
import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar
} from "@/components/shadcn/sidebar";
import type { DeckSelectionOption } from "@/types/index";

type SidebarProfile = {
  displayName: string;
  email: string;
  isAdmin?: boolean;
};

type SidebarProps = {
  userDecks?: DeckSelectionOption[];
  profile: SidebarProfile;
};

const navItems: Array<{ label: string; href: string; icon: Icon }> = [
  { label: "Battle Logs", href: "/logs", icon: ClipboardTextIcon },
  { label: "Deck Strategy", href: "/decks", icon: CardsIcon },
  { label: "Tournaments", href: "/tournaments", icon: TrophyIcon },
  { label: "Stats", href: "/stats", icon: ChartLineIcon },
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

function AppSidebarLink({ href, icon: Icon, label }: { href: string; icon: Icon; label: string }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        className="relative data-[active=true]:font-semibold data-[active=true]:text-primary"
        isActive={active}
      >
        <Link href={href} onClick={() => setOpenMobile(false)} prefetch={false}>
          {active ? (
            <span
              aria-hidden="true"
              className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-primary group-data-[collapsible=icon]:hidden"
            />
          ) : null}
          <Icon
            aria-hidden="true"
            className={active ? "ml-2 text-primary" : "ml-2 text-muted-foreground"}
            weight={active ? "fill" : "regular"}
          />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function SidebarLogo({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      aria-label="Go to Poke Notes home"
      className="inline-flex items-center"
      href="/logs"
      onClick={onNavigate}
      prefetch={false}
    >
      <img alt="Poke Notes" className="h-12 w-12" src="/pokeball-icon.svg" />
    </Link>
  );
}

export function SidebarMobileTopbar() {
  return (
    <div className="sticky top-0 z-30 border-b border-sidebar-border bg-sidebar px-4 py-3 min-[860px]:hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <SidebarTrigger
            aria-label="Open navigation menu"
            className="text-sidebar-foreground"
            size="icon-lg"
          >
            <MenuIcon />
          </SidebarTrigger>
          <SidebarLogo />
        </div>
        <SidebarThemeToggle />
      </div>
    </div>
  );
}

function SidebarNav({ userDecks }: { userDecks: DeckSelectionOption[] }) {
  return (
    <SidebarContent className="px-2 py-3">
      <SidebarGroup>
        <SidebarGroupLabel className="ui-eyebrow h-auto px-2 py-2">
          NAVIGATE
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu className="gap-1">
            {navItems.map((item) => (
              <AppSidebarLink
                href={item.href}
                icon={item.icon}
                key={item.href}
                label={item.label}
              />
            ))}
          </SidebarMenu>
          <div className="px-2 pt-4 group-data-[collapsible=icon]:hidden">
            <LazyImportLogButton className="w-full justify-center" initialUserDecks={userDecks} />
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  );
}

function AccountBlock({ profile }: { profile: SidebarProfile }) {
  const initials = getInitials(profile.displayName);
  const { isMobile, setOpenMobile } = useSidebar();
  const [signOutPending, startSignOutTransition] = useTransition();

  function handleSignOut() {
    startSignOutTransition(async () => {
      await signOutAction();
    });
  }

  return (
    <SidebarFooter className="border-t border-sidebar-border p-2">
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                size="lg"
              >
                <Avatar className="size-8 rounded-lg">
                  <AvatarFallback className="rounded-lg text-xs font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{profile.displayName}</span>
                  <span className="truncate text-xs text-muted-foreground">{profile.email}</span>
                </div>
                <ChevronsUpDownIcon className="ml-auto" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="min-w-56 rounded-lg"
              side={isMobile ? "bottom" : "right"}
              sideOffset={4}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg text-xs font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
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
                    onClick={() => setOpenMobile(false)}
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
                      onClick={() => setOpenMobile(false)}
                      prefetch={false}
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

export function Sidebar({ profile, userDecks = [] }: SidebarProps) {
  const { setOpenMobile } = useSidebar();

  return (
    <ShadcnSidebar className="border-sidebar-border" collapsible="offcanvas">
      <SidebarHeader className="p-4">
        <div className="flex items-center justify-between gap-3">
          <SidebarLogo onNavigate={() => setOpenMobile(false)} />
          <div className="flex items-center gap-1">
            <SidebarThemeToggle />
            <SidebarTrigger
              aria-label="Close navigation menu"
              className="text-sidebar-foreground min-[860px]:hidden"
              size="icon-lg"
            >
              <MenuIcon />
            </SidebarTrigger>
          </div>
        </div>
      </SidebarHeader>
      <SidebarNav userDecks={userDecks} />
      <AccountBlock profile={profile} />
    </ShadcnSidebar>
  );
}
