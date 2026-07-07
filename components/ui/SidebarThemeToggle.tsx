"use client";

import { MoonIcon, SunIcon } from "@/components/ui/icons";
import { useTheme } from "@/components/ui/ThemeProvider";
import { Button } from "@/components/shadcn/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

type SidebarThemeToggleProps = {
  tone?: "page" | "sidebar";
};

export function SidebarThemeToggle({ tone = "sidebar" }: SidebarThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isMobile = useIsMobile();
  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  const button = (
    <Button
      aria-label={label}
      className={cn(
        tone === "sidebar"
          ? "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          : "text-foreground"
      )}
      onClick={toggleTheme}
      size="icon-lg"
      variant="ghost"
    >
      {theme === "dark" ? <SunIcon className="size-5" /> : <MoonIcon className="size-5" />}
    </Button>
  );

  if (isMobile) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {button}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
