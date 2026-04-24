"use client";

import Link from "next/link";
import { useState } from "react";
import { CloseIcon, MenuIcon } from "@/components/ui/icons";
import { LazyImportLogButton } from "@/components/ui/LazyImportLogButton";
import { SidebarNavLink } from "@/components/ui/SidebarNavLink";
import { SidebarThemeToggle } from "@/components/ui/SidebarThemeToggle";
import { SignOutButton } from "@/components/ui/SignOutButton";
import type { DeckSelectionOption } from "@/types/index";

type NavItem = {
  href: string;
  label: string;
};

type MobileSidebarProfile = {
  isAdmin?: boolean;
};

function SectionLabel({ children }: { children: string }) {
  return <p className="ui-eyebrow">{children}</p>;
}

export function MobileSidebar({
  navItems,
  profile,
  userDecks = []
}: {
  navItems: NavItem[];
  profile: MobileSidebarProfile;
  userDecks?: DeckSelectionOption[];
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = () => setDrawerOpen(false);

  return (
    <>
      <div className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 min-[860px]:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-alt)]"
              aria-expanded={drawerOpen}
              aria-label="Open navigation menu"
              onClick={() => setDrawerOpen(true)}
            >
              <MenuIcon />
            </button>
            <Link
              aria-label="Go to Poke Notes home"
              className="inline-flex items-center"
              href="/logs"
              prefetch={false}
            >
              <img alt="Poke Notes" className="h-12 w-12" src="/pokeball-icon.svg" />
            </Link>
          </div>
          <SidebarThemeToggle />
        </div>
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 min-[860px]:hidden">
          <button
            aria-label="Close navigation drawer"
            className="absolute inset-0 bg-[var(--bg-overlay)]"
            onClick={closeDrawer}
            type="button"
          />
          <div className="relative flex h-full w-[min(20rem,86vw)] flex-col border-r border-[var(--border)] bg-[var(--bg-surface)] px-4 py-6 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <Link
                aria-label="Go to Poke Notes home"
                className="inline-flex items-center"
                href="/logs"
                prefetch={false}
              >
                <img alt="Poke Notes" className="h-12 w-12" src="/pokeball-icon.svg" />
              </Link>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-alt)]"
                onClick={closeDrawer}
                aria-label="Close navigation drawer"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="mt-8 flex flex-1 flex-col gap-8 overflow-y-auto">
              <div className="space-y-3">
                <SectionLabel>QUICK ACTIONS</SectionLabel>
                <LazyImportLogButton className="w-full justify-center" initialUserDecks={userDecks} />
              </div>

              <div className="space-y-3">
                <SectionLabel>NAVIGATE</SectionLabel>
                <nav className="flex flex-col gap-1" aria-label="Mobile navigation">
                  {navItems.map((item) => (
                    <SidebarNavLink
                      href={item.href}
                      key={item.href}
                      label={item.label}
                      mobile
                      onNavigate={closeDrawer}
                    />
                  ))}
                </nav>
              </div>

              <div className="space-y-3">
                <SectionLabel>ACCOUNT</SectionLabel>
                <div className="flex flex-col gap-2">
                  <SidebarNavLink
                    href="/profile"
                    label="Profile"
                    mobile
                    onNavigate={closeDrawer}
                  />
                  {profile.isAdmin ? (
                    <SidebarNavLink
                      href="/admin/dashboard"
                      label="Admin Dashboard"
                      mobile
                      onNavigate={closeDrawer}
                    />
                  ) : null}
                  <SignOutButton className="w-full justify-center" />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
