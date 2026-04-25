"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

function isSidebarProfile(value: unknown): value is SidebarProfile {
  if (!value || typeof value !== "object") {
    return false;
  }

  const profile = value as Record<string, unknown>;

  return (
    typeof profile.displayName === "string" &&
    typeof profile.email === "string" &&
    (typeof profile.isAdmin === "boolean" || typeof profile.isAdmin === "undefined")
  );
}

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
    <div className="border-t border-[var(--border)] pt-4">
      <Link
        className="flex items-center gap-3 rounded-lg px-1 py-1 transition hover:bg-[var(--bg-surface-alt)]"
        href="/profile"
        prefetch={false}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface-alt)] text-sm font-semibold text-[var(--text-primary)]">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
            {profile.displayName}
          </p>
          <p className="truncate text-xs text-[var(--text-muted)]">{profile.email}</p>
        </div>
      </Link>
      {profile.isAdmin ? (
        <Link
          className="mt-3 flex items-center rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-alt)] hover:text-[var(--text-primary)]"
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
  const [resolvedProfile, setResolvedProfile] = useState(profile);

  useEffect(() => {
    setResolvedProfile(profile);
  }, [profile]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadProfile() {
      try {
        const response = await fetch("/api/sidebar-profile", {
          cache: "no-store",
          signal: controller.signal
        });

        if (!response.ok) {
          return;
        }

        const nextProfile: unknown = await response.json();

        if (isSidebarProfile(nextProfile)) {
          setResolvedProfile(nextProfile);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("[sidebar] failed to load profile", error);
        }
      }
    }

    loadProfile();

    return () => {
      controller.abort();
    };
  }, []);

  return (
    <>
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-[var(--border)] bg-[var(--bg-surface)] min-[860px]:flex">
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

          <AccountBlock profile={resolvedProfile} />
        </div>
      </aside>

      <MobileSidebar navItems={navItems} profile={resolvedProfile} userDecks={userDecks} />
    </>
  );
}
