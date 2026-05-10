"use client";

import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { Calendar } from "@/components/shadcn/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/shadcn/popover";
import { cn } from "@/lib/utils";

type DatePickerProps = {
  className?: string;
  defaultValue?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  value?: string;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});

function parseDateValue(value: string | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));

  if (!match) {
    return undefined;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, monthIndex, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) {
    return undefined;
  }

  return date;
}

function formatDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function DatePicker({
  className,
  defaultValue = "",
  disabled = false,
  id,
  name,
  onChange,
  placeholder = "Pick a date",
  required = false,
  value
}: DatePickerProps) {
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selectedValue = controlled ? value : internalValue;
  const selectedDate = parseDateValue(selectedValue);

  function handleSelect(nextDate: Date | undefined) {
    if (!nextDate) {
      return;
    }

    const nextValue = formatDateValue(nextDate);

    if (!controlled) {
      setInternalValue(nextValue);
    }

    onChange?.(nextValue);
  }

  return (
    <>
      {name ? (
        <input name={name} required={required} type="hidden" value={selectedValue || ""} />
      ) : null}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            aria-label={selectedDate ? DATE_FORMATTER.format(selectedDate) : placeholder}
            className={cn(
              "h-auto min-h-[2.75rem] w-full justify-start gap-2 rounded-lg border-border bg-muted px-3 py-2.5 text-left text-sm font-normal text-card-foreground data-[empty=true]:text-muted-foreground",
              className
            )}
            data-empty={!selectedDate}
            disabled={disabled}
            id={id}
            type="button"
            variant="outline"
          >
            <CalendarIcon data-icon="inline-start" />
            {selectedDate ? DATE_FORMATTER.format(selectedDate) : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            captionLayout="dropdown"
            mode="single"
            onSelect={handleSelect}
            selected={selectedDate}
          />
        </PopoverContent>
      </Popover>
    </>
  );
}
