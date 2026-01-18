"use client";

import { forwardRef } from "react";
import CurrencyInputField from "react-currency-input-field";
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
    },
    ref
  ) => {
    // Convert cents to dollars for display
    const displayValue =
      value !== undefined ? (value / 100).toString() : "";

    return (
      <InputGroup className={cn("w-full", className)}>
        <InputGroupAddon align="inline-start">$</InputGroupAddon>
        <CurrencyInputField
          customInput={InputGroupInput}
          ref={ref}
          value={displayValue}
          decimalsLimit={2}
          decimalScale={2}
          groupSeparator=","
          decimalSeparator="."
          placeholder={placeholder}
          disabled={disabled}
          onValueChange={(_, __, values) => {
            // Convert dollars to cents
            if (values?.float !== undefined && values.float !== null) {
              onChange(Math.round(values.float * 100));
            } else {
              onChange(undefined);
            }
          }}
          aria-invalid={ariaInvalid}
        />
      </InputGroup>
    );
  }
);
CurrencyInput.displayName = "CurrencyInput";
