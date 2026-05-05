"use client";

import Link from "next/link";
import { LazyImportLogButton } from "@/components/ui/LazyImportLogButton";
import { MobileSidebar } from "@/components/ui/MobileSidebar";
import { SidebarNavLink } from "@/components/ui/SidebarNavLink";
import { SidebarThemeToggle } from "@/components/ui/SidebarThemeToggle";
import { SignOutButton } from "@/components/ui/SignOutButton";
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

const navItems = [
  { label: "Battle Logs", href: "/logs" },
  { label: "Deck Strategy", href: "/decks" },
  { label: "Tournaments", href: "/tournaments" },
  { label: "Stats", href: "/stats" },
  { label: "Probability Calculator", href: "/calculator" }
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

function SectionLabel({ children }: { children: string }) {
  return <p className="ui-eyebrow">{children}</p>;
}

function AccountBlock({ profile }: { profile: SidebarProfile }) {
  const initials = getInitials(profile.displayName);

  return (
    <div className="border-t border-border pt-4">
      <Link
        className="flex items-center gap-3 rounded-lg px-1 py-1 transition hover:bg-muted"
        href="/profile"
        prefetch={false}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted text-sm font-semibold text-card-foreground">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-card-foreground">
            {profile.displayName}
          </p>
          <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
        </div>
      </Link>
      {profile.isAdmin ? (
        <Link
          className="mt-3 flex items-center rounded-lg px-3 py-2 text-sm text-foreground transition hover:bg-muted hover:text-card-foreground"
          href="/admin/dashboard"
          prefetch={false}
        >
          Admin Dashboard
        </Link>
      ) : null}
      <SignOutButton className="mt-4 w-full justify-center" />
    </div>
  );
}

export function Sidebar({ profile, userDecks = [] }: SidebarProps) {
  return (
    <>
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-border bg-card min-[860px]:flex">
        <div className="flex w-full flex-col px-4 py-6">
          <div className="flex items-center justify-between gap-3">
            <Link
              aria-label="Go to Poke Notes home"
              className="inline-flex items-center"
              href="/logs"
              prefetch={false}
            >
              <img alt="Poke Notes" className="h-12 w-12" src="/pokeball-icon.svg" />
            </Link>
            <SidebarThemeToggle />
          </div>

          <div className="mt-8 flex flex-1 flex-col gap-6">
            <div className="space-y-3">
              <SectionLabel>NAVIGATE</SectionLabel>
              <nav className="flex flex-col gap-1" aria-label="Primary">
                {navItems.map((item) => (
                  <SidebarNavLink href={item.href} key={item.href} label={item.label} />
                ))}
              </nav>
              <div className="pt-3">
                <LazyImportLogButton className="w-full justify-center" initialUserDecks={userDecks} />
              </div>
            </div>
          </div>

          <AccountBlock profile={profile} />
        </div>
      </aside>

      <MobileSidebar navItems={navItems} profile={profile} userDecks={userDecks} />
    </>
  );
}
