import { type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { sectionVariants, staggerItemReduced } from "@/lib/motion";

interface AnimatedSectionProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

/** Fade-and-rise entrance for a page section (card block, header, panel). */
export function AnimatedSection({ children, className, delay = 0 }: AnimatedSectionProps) {
  const shouldReduce = useReducedMotion();
  return (
    <m.div
      className={className}
      variants={shouldReduce ? staggerItemReduced : sectionVariants}
      initial="initial"
      animate="animate"
      transition={delay ? { delay } : undefined}
    >
      {children}
    </m.div>
  );
}
