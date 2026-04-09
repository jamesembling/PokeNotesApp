"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CloseIcon, MenuIcon, MoonIcon, SunIcon } from "@/components/ui/icons";
import { LazyImportLogButton } from "@/components/ui/LazyImportLogButton";
import { useTheme } from "@/components/ui/ThemeProvider";
import { createClient } from "@/lib/supabase/client";

type SidebarProfile = {
  displayName: string;
  email: string;
};

type SidebarProps = {
  profile: SidebarProfile;
};

const navItems = [
  { label: "Battle Logs", href: "/logs" },
  { label: "Deck Strategy", href: "/decks" },
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

export function Sidebar({ profile }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const initials = useMemo(() => getInitials(profile.displayName), [profile.displayName]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  const renderNavLink = (label: string, href: string, mobile = false) => {
    const active = isActive(href);

    return (
      <Link
        className={[
          "relative flex items-center rounded-lg px-3 py-2 text-sm transition",
          active
            ? "bg-[var(--bg-surface-alt)] font-semibold text-[var(--color-brand)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-alt)] hover:text-[var(--text-primary)]",
          mobile ? "min-h-11 text-base" : ""
        ].join(" ")}
        href={href}
        key={href}
        onClick={() => {
          if (mobile) {
            setDrawerOpen(false);
          }
        }}
      >
        {active ? (
          <span
            aria-hidden="true"
            className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-[var(--color-brand)]"
          />
        ) : null}
        <span className="pl-2">{label}</span>
      </Link>
    );
  };

  const accountBlock = (
    <div className="border-t border-[var(--border)] pt-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface-alt)] text-sm font-semibold text-[var(--text-primary)]">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
            {profile.displayName}
          </p>
          <p className="truncate text-xs text-[var(--text-muted)]">{profile.email}</p>
        </div>
      </div>
      <Button className="mt-4 w-full justify-center" onClick={handleSignOut} variant="secondary">
        Sign Out
      </Button>
    </div>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-[var(--border)] bg-[var(--bg-surface)] min-[860px]:flex">
        <div className="flex w-full flex-col px-4 py-6">
          <div className="flex items-center justify-between gap-3">
            <Link
              aria-label="Go to Poke Notes home"
              className="inline-flex items-center"
              href="/logs"
            >
              <img
                alt="Poke Notes"
                className="h-12 w-12"
                src="/pokeball-icon.svg"
              />
            </Link>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-alt)]"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? (
                <SunIcon className="h-5 w-5" />
              ) : (
                <MoonIcon className="h-5 w-5" />
              )}
            </button>
          </div>

          <div className="mt-8 flex flex-1 flex-col gap-6">
            <div className="space-y-3">
              <SectionLabel>NAVIGATE</SectionLabel>
              <nav className="flex flex-col gap-1" aria-label="Primary">
                {navItems.map((item) => renderNavLink(item.label, item.href))}
              </nav>
            </div>
          </div>

          {accountBlock}
        </div>
      </aside>

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
            >
              <img
                alt="Poke Notes"
                className="h-12 w-12"
                src="/pokeball-icon.svg"
              />
            </Link>
          </div>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-alt)]"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 min-[860px]:hidden">
          <button
            aria-label="Close navigation drawer"
            className="absolute inset-0 bg-[var(--bg-overlay)]"
            onClick={() => setDrawerOpen(false)}
            type="button"
          />
          <div className="relative flex h-full w-[min(20rem,86vw)] flex-col border-r border-[var(--border)] bg-[var(--bg-surface)] px-4 py-6 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <Link
                aria-label="Go to Poke Notes home"
                className="inline-flex items-center"
                href="/logs"
              >
                <img
                  alt="Poke Notes"
                  className="h-12 w-12"
                  src="/pokeball-icon.svg"
                />
              </Link>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-alt)]"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation drawer"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="mt-8 flex flex-1 flex-col gap-8 overflow-y-auto">
              <div className="space-y-3">
                <SectionLabel>QUICK ACTIONS</SectionLabel>
                <LazyImportLogButton className="w-full justify-center" />
              </div>

              <div className="space-y-3">
                <SectionLabel>NAVIGATE</SectionLabel>
                <nav className="flex flex-col gap-1" aria-label="Mobile navigation">
                  {navItems.map((item) => renderNavLink(item.label, item.href, true))}
                </nav>
              </div>

              <div className="space-y-3">
                <SectionLabel>ACCOUNT</SectionLabel>
                <div className="flex flex-col gap-2">
                  {renderNavLink("Profile", "/profile", true)}
                  <Button className="w-full justify-center" onClick={handleSignOut} variant="secondary">
                    Sign Out
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
