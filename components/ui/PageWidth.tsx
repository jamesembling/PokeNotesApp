import type { ReactNode } from "react";

type PageWidthProps = {
  children: ReactNode;
  size?: "narrow" | "standard" | "wide";
};

const sizeClasses: Record<NonNullable<PageWidthProps["size"]>, string> = {
  narrow: "max-w-3xl",
  standard: "max-w-6xl",
  wide: "max-w-[90rem]"
};

export function PageWidth({ children, size = "standard" }: PageWidthProps) {
  return <div className={`mx-auto flex w-full flex-col gap-6 ${sizeClasses[size]}`}>{children}</div>;
}
