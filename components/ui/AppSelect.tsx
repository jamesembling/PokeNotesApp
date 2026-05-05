"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/shadcn/select";

const EMPTY_SELECT_VALUE = "__empty__";

export type AppSelectOption = {
  label: string;
  value: string;
};

type AppSelectProps = {
  className?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  onBlur?: () => void;
  onChange: (value: string) => void;
  options: AppSelectOption[];
  placeholder?: string;
  value: string;
};

function toRadixValue(value: string) {
  return value === "" ? EMPTY_SELECT_VALUE : value;
}

function fromRadixValue(value: string) {
  return value === EMPTY_SELECT_VALUE ? "" : value;
}

export function AppSelect({
  className,
  disabled = false,
  id,
  name,
  onBlur,
  onChange,
  options,
  placeholder = "Select",
  value
}: AppSelectProps) {
  const hasEmptyOption = options.some((option) => option.value === "");

  return (
    <>
      {name && !disabled ? <input name={name} type="hidden" value={value} /> : null}
      <Select
        disabled={disabled}
        onValueChange={(nextValue) => onChange(fromRadixValue(nextValue))}
        value={toRadixValue(value)}
      >
        <SelectTrigger
          className={[
            "h-auto min-h-[2.75rem] w-full bg-[var(--bg-surface-alt)] px-3 py-2.5 text-[var(--text-primary)]",
            className
          ]
            .filter(Boolean)
            .join(" ")}
          id={id}
          onBlur={onBlur}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent align="start" position="popper">
          <SelectGroup>
            {!hasEmptyOption ? (
              <SelectItem disabled value={EMPTY_SELECT_VALUE}>
                {placeholder}
              </SelectItem>
            ) : null}
            {options.map((option) => (
              <SelectItem key={`${option.value}-${option.label}`} value={toRadixValue(option.value)}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </>
  );
}
