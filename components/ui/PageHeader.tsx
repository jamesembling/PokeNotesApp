import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "@/components/shadcn/breadcrumb";

type PageBreadcrumbItem = {
  label: string;
  href?: string;
};

type PageHeaderProps = {
  breadcrumb: PageBreadcrumbItem[];
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
      <Breadcrumb>
        <BreadcrumbList className="gap-2">
          {breadcrumb.map((item, index) => {
            const isLast = index === breadcrumb.length - 1;

            return (
              <Fragment key={`${item.label}-${index}`}>
                <BreadcrumbItem>
                  {item.href && !isLast ? (
                    <BreadcrumbLink asChild className="hover:text-primary">
                      <Link href={item.href} prefetch={false}>
                        {item.label}
                      </Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{item.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
                {!isLast ? <BreadcrumbSeparator>/</BreadcrumbSeparator> : null}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

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
