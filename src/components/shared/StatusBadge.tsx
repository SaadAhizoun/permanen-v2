import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

type StatusTone = "success" | "warning" | "danger" | "info" | "neutral" | "accent";

interface StatusBadgeProps {
  tone: StatusTone;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}

const toneClasses: Record<StatusTone, string> = {
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  danger: "bg-destructive/10 text-destructive border-destructive/20",
  info: "bg-info/10 text-info border-info/20",
  accent: "bg-accent/10 text-accent border-accent/20",
  neutral: "bg-muted text-muted-foreground border-transparent",
};

/** Status pill that never relies on color alone: pair with a label and/or icon. */
export function StatusBadge({ tone, children, icon, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-colors duration-component ease-standard",
        toneClasses[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
