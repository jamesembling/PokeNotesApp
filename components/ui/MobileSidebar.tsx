"use client";

import Link from "next/link";
import { useState } from "react";
import { CloseIcon, MenuIcon } from "@/components/ui/icons";
import { LazyImportLogButton } from "@/components/ui/LazyImportLogButton";
import { SidebarNavLink } from "@/components/ui/SidebarNavLink";
import { SidebarThemeToggle } from "@/components/ui/SidebarThemeToggle";
import { SignOutButton } from "@/components/ui/SignOutButton";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger
} from "@/components/shadcn/dialog";
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
    <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
      <div className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 min-[860px]:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <DialogTrigger asChild>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-alt)]"
                aria-expanded={drawerOpen}
                aria-label="Open navigation menu"
              >
                <MenuIcon />
              </button>
            </DialogTrigger>
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

      <DialogContent
        className="left-0 top-0 h-dvh w-[min(20rem,86vw)] max-w-none translate-x-0 translate-y-0 content-start overflow-hidden rounded-none border-y-0 border-l-0 border-r border-[var(--border)] bg-[var(--bg-surface)] p-0 shadow-xl min-[860px]:hidden"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Mobile navigation</DialogTitle>
        <div className="flex h-full flex-col px-4 py-6">
          <div className="flex items-center justify-between gap-3">
            <Link
              aria-label="Go to Poke Notes home"
              className="inline-flex items-center"
              href="/logs"
              onClick={closeDrawer}
              prefetch={false}
            >
              <img alt="Poke Notes" className="h-12 w-12" src="/pokeball-icon.svg" />
            </Link>
            <DialogClose asChild>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-alt)]"
                aria-label="Close navigation drawer"
              >
                <CloseIcon />
              </button>
            </DialogClose>
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
      </DialogContent>
    </Dialog>
  );
}
