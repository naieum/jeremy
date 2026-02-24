import { type InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm text-text placeholder-muted focus:border-muted focus:outline-none font-mono ${className}`}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";
