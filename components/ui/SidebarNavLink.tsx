"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export function SidebarNavLink({
  href,
  label,
  mobile = false,
  onNavigate
}: {
  href: string;
  label: string;
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
  const prefetchRoute = () => {
    if (!active) {
      router.prefetch(href);
    }
  };

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
      onClick={onNavigate}
      onFocus={prefetchRoute}
      onPointerEnter={prefetchRoute}
      prefetch={false}
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
}
