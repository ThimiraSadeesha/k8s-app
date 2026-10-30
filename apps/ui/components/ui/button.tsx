import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap",
  {
    variants: {
      variant: {
        primary: "bg-fg text-bg hover:opacity-90",
        outline: "border border-border bg-transparent hover:bg-surface-2",
        ghost: "hover:bg-surface-2",
        danger: "border border-bad text-bad hover:bg-bad hover:text-bg",
      },
      size: { sm: "h-8 px-3", md: "h-9 px-4", icon: "h-9 w-9" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  loading?: boolean;
}

export function Button({ className, variant, size, loading, children, disabled, ...p }: ButtonProps) {
  return (
    <button className={cn(button({ variant, size }), className)} disabled={disabled || loading} {...p}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
