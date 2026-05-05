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
  showDivider?: boolean;
};

export function PageHeader({
  breadcrumb,
  title,
  subtitle,
  action,
  showDivider = true
}: PageHeaderProps) {
  const hasTitle = title.trim().length > 0;
  const hasMetaRow = hasTitle || Boolean(subtitle) || Boolean(action);

  return (
    <header className="flex flex-col gap-4">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {breadcrumb.map((item, index) => {
            const isLast = index === breadcrumb.length - 1;

            return (
              <li className="flex items-center gap-2" key={`${item.label}-${index}`}>
                {item.href && !isLast ? (
                  <Link
                    className="transition hover:text-primary"
                    href={item.href}
                    prefetch={false}
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

      {hasMetaRow ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            {hasTitle ? (
              <h1 className="text-[2rem] font-semibold leading-tight tracking-[-0.02em] text-card-foreground sm:text-4xl">
                {title}
              </h1>
            ) : null}
            {subtitle ? (
              <p className="max-w-[65ch] text-base leading-7 text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>

          {action ? <div className="sm:shrink-0">{action}</div> : null}
        </div>
      ) : null}

      {showDivider ? <div className="border-b border-border" /> : null}
    </header>
  );
}
