import { type ButtonHTMLAttributes, forwardRef } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-bg hover:bg-accent-hover transition-colors",
  secondary:
    "border border-border bg-transparent text-text hover:border-muted hover:text-text transition-colors",
  ghost:
    "bg-transparent text-muted hover:text-text transition-colors",
  danger:
    "border border-danger text-danger hover:bg-danger/10 transition-colors",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", className = "", children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
