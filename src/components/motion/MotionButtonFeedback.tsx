import { type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { cn } from "@/lib/utils";

interface MotionButtonFeedbackProps {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}

/**
 * Hover-lift + press-scale wrapper for clickable elements that aren't the
 * shared `Button` component (e.g. custom icon buttons, card actions). Avoid
 * using this around popover/dropdown triggers — the transform can throw off
 * Radix's positioning while open.
 */
export function MotionButtonFeedback({ children, className, disabled }: MotionButtonFeedbackProps) {
  const shouldReduce = useReducedMotion();
  if (disabled) {
    return <span className={className}>{children}</span>;
  }
  return (
    <m.span
      className={cn("inline-flex", className)}
      whileHover={shouldReduce ? undefined : { y: -1 }}
      whileTap={shouldReduce ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.15 }}
    >
      {children}
    </m.span>
  );
}
