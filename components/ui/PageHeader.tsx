import Link from "next/link";
import type { ReactNode } from "react";

type BreadcrumbItem = {
  label: string;
  href?: string;
};

type PageHeaderProps = {
  breadcrumb: BreadcrumbItem[];
  title: string;
  subtitle?: string;
  action?: ReactNode;
};

export function PageHeader({
  breadcrumb,
  title,
  subtitle,
  action
}: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-muted)]">
          {breadcrumb.map((item, index) => {
            const isLast = index === breadcrumb.length - 1;

            return (
              <li className="flex items-center gap-2" key={`${item.label}-${index}`}>
                {item.href && !isLast ? (
                  <Link
                    className="transition hover:text-[var(--color-brand)]"
                    href={item.href}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span>{item.label}</span>
                )}
                {!isLast ? <span aria-hidden="true">/</span> : null}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h1 className="font-display text-[2rem] font-semibold tracking-[-0.04em] text-[var(--text-primary)] sm:text-4xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="max-w-3xl text-sm text-[var(--text-muted)]">{subtitle}</p>
          ) : null}
        </div>

        {action ? <div className="sm:shrink-0">{action}</div> : null}
      </div>

      <div className="border-b border-[var(--border)]" />
    </header>
  );
}
