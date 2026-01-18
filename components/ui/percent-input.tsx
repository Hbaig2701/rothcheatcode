"use client";

import { forwardRef } from "react";
import CurrencyInputField from "react-currency-input-field";
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
    return (
      <InputGroup className={cn("w-full", className)}>
        <CurrencyInputField
          customInput={InputGroupInput}
          ref={ref}
          value={value?.toString() ?? ""}
          decimalsLimit={2}
          decimalScale={1}
          groupSeparator=""
          decimalSeparator="."
          placeholder={placeholder}
          disabled={disabled}
          onValueChange={(_, __, values) => {
            if (values?.float !== undefined && values.float !== null) {
              onChange(values.float);
            } else {
              onChange(undefined);
            }
          }}
          aria-invalid={ariaInvalid}
        />
        <InputGroupAddon align="inline-end">%</InputGroupAddon>
      </InputGroup>
    );
  }
);
PercentInput.displayName = "PercentInput";
