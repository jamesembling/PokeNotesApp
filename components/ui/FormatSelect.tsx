"use client";

import { AppSelect } from "@/components/shadcn/app-select";

type FormatSelectProps = {
  "aria-label"?: string;
  className?: string;
  id?: string;
  name?: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  value: string;
};

export function FormatSelect({
  "aria-label": ariaLabel,
  className,
  id,
  name,
  onChange,
  options,
  placeholder = "Select format",
  value
}: FormatSelectProps) {
  return (
    <AppSelect
      aria-label={ariaLabel}
      className={className}
      id={id}
      name={name}
      onChange={onChange}
      options={options.map((option) => ({
        label: option,
        value: option
      }))}
      placeholder={placeholder}
      value={value}
    />
  );
}
