"use client";

import { forwardRef, useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";

interface PercentInputProps {
  value: number | undefined; // value as percentage (e.g., 6 for 6%)
  onChange: (percent: number | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
}

export const PercentInput = forwardRef<HTMLInputElement, PercentInputProps>(
  (
    {
      value,
      onChange,
      placeholder = "0",
      disabled,
      className,
      "aria-invalid": ariaInvalid,
    },
    ref
  ) => {
    // Local display string — decoupled from numeric value so intermediate
    // states like "7." or "12" (mid-edit) are preserved.
    const [display, setDisplay] = useState(value?.toString() ?? "");
    const lastReported = useRef(value);

    // Sync from parent when value changes externally (not from user typing)
    useEffect(() => {
      if (value !== lastReported.current) {
        lastReported.current = value;
        setDisplay(value?.toString() ?? "");
      }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;

      // Allow empty string, digits, and one decimal point with up to 2 decimal places
      if (raw === "" || /^\d*\.?\d{0,2}$/.test(raw)) {
        setDisplay(raw);
        const num = parseFloat(raw);
        if (!isNaN(num)) {
          lastReported.current = num;
          onChange(num);
        } else {
          lastReported.current = undefined;
          onChange(undefined);
        }
      }
    };

    return (
      <InputGroup className={cn("w-full", className)}>
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
        <InputGroupAddon align="inline-end">%</InputGroupAddon>
      </InputGroup>
    );
  }
);
PercentInput.displayName = "PercentInput";
