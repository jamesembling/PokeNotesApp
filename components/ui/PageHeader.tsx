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
import { PageTitle } from "@/components/ui/Typography";

type PageBreadcrumbItem = {
  label: string;
  href?: string;
};

type PageHeaderProps = {
  breadcrumb: PageBreadcrumbItem[];
  title?: string;
  variant?: "default" | "collection";
  subtitle?: string;
  meta?: ReactNode;
  action?: ReactNode;
  afterBreadcrumb?: ReactNode;
  mobileAction?: ReactNode;
  mobileTitle?: ReactNode;
};

export function PageHeader({
  breadcrumb,
  title = "",
  variant = "default",
  subtitle,
  meta,
  action,
  afterBreadcrumb,
  mobileAction,
  mobileTitle
}: PageHeaderProps) {
  const hasTitle = title.trim().length > 0;
  const hasMetaRow = hasTitle || Boolean(subtitle) || Boolean(meta) || Boolean(action);

  return (
    <header className="flex flex-col gap-4">
      <Breadcrumb className={afterBreadcrumb ? "hidden sm:block" : undefined}>
        <BreadcrumbList className="gap-2">
          {breadcrumb.map((item, index) => {
            const isLast = index === breadcrumb.length - 1;
            const nextItem = breadcrumb[index + 1];
            const hideCurrentPageOnMobile = isLast && !item.href && breadcrumb.length > 1;
            const separatorBeforeCurrentPage =
              !isLast && index === breadcrumb.length - 2 && !nextItem?.href;

            return (
              <Fragment key={`${item.label}-${index}`}>
                <BreadcrumbItem className={hideCurrentPageOnMobile ? "hidden sm:inline-flex" : undefined}>
                  {item.href ? (
                    <BreadcrumbLink asChild className="hover:text-primary">
                      <Link href={item.href} prefetch={false}>
                        {item.label}
                      </Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{item.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
                {!isLast ? (
                  <BreadcrumbSeparator
                    className={separatorBeforeCurrentPage ? "hidden sm:inline-flex" : undefined}
                  >
                    /
                  </BreadcrumbSeparator>
                ) : null}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      {afterBreadcrumb ? <div className="sm:hidden">{afterBreadcrumb}</div> : null}

      {hasMetaRow ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className={mobileAction ? "flex items-start justify-between gap-4 sm:block" : undefined}>
              {hasTitle ? (
                <PageTitle>
                  {mobileTitle ? (
                    <>
                      <span className="sm:hidden">{mobileTitle}</span>
                      <span className="hidden sm:inline">{title}</span>
                    </>
                  ) : (
                    title
                  )}
                </PageTitle>
              ) : null}
              {mobileAction ? <div className="shrink-0 sm:hidden">{mobileAction}</div> : null}
            </div>
            {subtitle ? (
              <p className="max-w-[65ch] text-base leading-7 text-muted-foreground">{subtitle}</p>
            ) : null}
            {meta ? <div>{meta}</div> : null}
          </div>

          {action ? <div className="sm:shrink-0">{action}</div> : null}
        </div>
      ) : null}

      {variant === "default" ? <div className="border-b border-border" /> : null}
    </header>
  );
}
