"use client";

import { forwardRef, useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";

interface CurrencyInputProps {
  value: number | undefined; // value in cents
  onChange: (cents: number | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
  decimals?: number;
}

/**
 * Format a number string with commas as thousands separators.
 * Handles the integer part only; preserves any decimal portion.
 */
function formatWithCommas(raw: string): string {
  if (!raw) return "";
  const parts = raw.split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

/**
 * Strip commas from a formatted string to get the raw numeric string.
 */
function stripCommas(formatted: string): string {
  return formatted.replace(/,/g, "");
}

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  (
    {
      value,
      onChange,
      placeholder = "0",
      disabled,
      className,
      "aria-invalid": ariaInvalid,
      decimals = 2,
    },
    ref
  ) => {
    // Convert cents to dollar string for display
    const centsToDisplay = (cents: number | undefined): string => {
      if (cents === undefined) return "";
      return formatWithCommas((cents / 100).toString());
    };

    const [display, setDisplay] = useState(() => centsToDisplay(value));
    const lastReported = useRef(value);

    // Sync from parent when value changes externally (not from user typing)
    useEffect(() => {
      if (value !== lastReported.current) {
        lastReported.current = value;
        setDisplay(centsToDisplay(value));
      }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = stripCommas(e.target.value);

      // Build regex: allow digits, optional decimal with up to N decimal places
      const pattern = new RegExp(`^\\d*\\.?\\d{0,${decimals}}$`);

      if (raw === "" || pattern.test(raw)) {
        // Reformat with commas for display, preserving cursor-friendly intermediate states
        setDisplay(formatWithCommas(raw));

        const num = parseFloat(raw);
        if (!isNaN(num)) {
          const cents = Math.round(num * 100);
          lastReported.current = cents;
          onChange(cents);
        } else {
          lastReported.current = undefined;
          onChange(undefined);
        }
      }
    };

    return (
      <InputGroup className={cn("w-full", className)}>
        <InputGroupAddon align="inline-start">$</InputGroupAddon>
        <InputGroupInput
          ref={ref}
          type="text"
          inputMode="decimal"
          value={display}
          placeholder={placeholder}
          disabled={disabled}
          onChange={handleChange}
          aria-invalid={ariaInvalid}
        />
      </InputGroup>
    );
  }
);
CurrencyInput.displayName = "CurrencyInput";
