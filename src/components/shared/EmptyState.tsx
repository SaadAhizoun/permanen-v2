import { type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { emptyStateIcon, staggerItem } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  /** Very subtle idle float for the icon — disabled automatically under reduced motion. */
  floatIcon?: boolean;
}

export function EmptyState({ icon, title, description, action, className, floatIcon = false }: EmptyStateProps) {
  const shouldReduceMotion = useReducedMotion();
  return (
    <m.div
      variants={staggerItem}
      initial="initial"
      animate="animate"
      className={cn("flex flex-col items-center justify-center gap-1 py-12 text-center", className)}
    >
      {icon && (
        <m.div
          variants={emptyStateIcon}
          animate={
            floatIcon && !shouldReduceMotion
              ? { y: [0, -4, 0], transition: { duration: 3.2, repeat: Infinity, ease: "easeInOut" } }
              : undefined
          }
          aria-hidden="true"
          className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-b from-muted to-muted/60 text-muted-foreground ring-1 ring-border/60 [&_svg]:h-6 [&_svg]:w-6"
        >
          {icon}
        </m.div>
      )}
      <p className="font-medium text-foreground">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground leading-relaxed">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </m.div>
  );
}
