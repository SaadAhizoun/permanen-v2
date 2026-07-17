import { type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { staggerContainer, staggerContainerReduced } from "@/lib/motion";

interface StaggerContainerProps {
  children: ReactNode;
  className?: string;
  as?: "div" | "ul" | "nav";
  /** Re-trigger the stagger when this changes (e.g. filters, dataset id). */
  triggerKey?: string | number;
}

/**
 * Orchestrates staggered entrance for a group of `StaggerItem` children.
 * Use for KPI card grids, table rows, list items, nav menus.
 */
export function StaggerContainer({ children, className, as = "div", triggerKey }: StaggerContainerProps) {
  const shouldReduce = useReducedMotion();
  const variants = shouldReduce ? staggerContainerReduced : staggerContainer;
  const sharedProps = {
    className,
    variants,
    initial: "initial" as const,
    animate: "animate" as const,
  };
  if (as === "ul") return <m.ul key={triggerKey} {...sharedProps}>{children}</m.ul>;
  if (as === "nav") return <m.nav key={triggerKey} {...sharedProps}>{children}</m.nav>;
  return <m.div key={triggerKey} {...sharedProps}>{children}</m.div>;
}
