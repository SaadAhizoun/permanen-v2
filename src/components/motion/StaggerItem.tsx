import { type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { staggerItem, staggerItemReduced } from "@/lib/motion";

interface StaggerItemProps {
  children: ReactNode;
  className?: string;
  as?: "div" | "li";
}

/** A single entrance-animated child of `StaggerContainer`. */
export function StaggerItem({ children, className, as = "div" }: StaggerItemProps) {
  const shouldReduce = useReducedMotion();
  const variants = shouldReduce ? staggerItemReduced : staggerItem;
  if (as === "li") {
    return (
      <m.li className={className} variants={variants}>
        {children}
      </m.li>
    );
  }
  return (
    <m.div className={className} variants={variants}>
      {children}
    </m.div>
  );
}
