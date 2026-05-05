"use client";

import { MoonIcon, SunIcon } from "@/components/ui/icons";
import { useTheme } from "@/components/ui/ThemeProvider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn/tooltip";

export function SidebarThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-alt)]"
          onClick={toggleTheme}
          aria-label={label}
        >
          {theme === "dark" ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
