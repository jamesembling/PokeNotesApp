"use client";

import type { ComponentProps } from "react";
import {
  Button as ShadcnButton,
  type buttonVariants
} from "@/components/shadcn/button";
import { cn } from "@/lib/utils";
import type { VariantProps } from "class-variance-authority";

type ShadcnVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;
type LegacyButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonVariant = LegacyButtonVariant | ShadcnVariant;

type ButtonProps = Omit<ComponentProps<typeof ShadcnButton>, "variant"> & {
  variant?: ButtonVariant;
};

const variantMap: Record<ButtonVariant, ShadcnVariant> = {
  default: "default",
  primary: "default",
  secondary: "outline",
  ghost: "ghost",
  danger: "destructive",
  destructive: "destructive",
  outline: "outline",
  link: "link"
};

export function Button({
  className,
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <ShadcnButton
      className={cn(
        "h-auto min-h-9 px-4 py-2 text-[0.95rem] font-semibold",
        variant === "ghost" && "px-3 py-1.5",
        className
      )}
      type={type}
      variant={variantMap[variant]}
      {...props}
    />
  );
}
