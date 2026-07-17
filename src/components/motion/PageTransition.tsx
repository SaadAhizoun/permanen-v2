import { type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { pageVariants, pageVariantsReduced } from "@/lib/motion";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
  /** Pass `location.pathname` when this wraps route content inside an AnimatePresence. */
  transitionKey?: string;
}

/**
 * Fade + rise entrance used for every route. When rendered inside an
 * `<AnimatePresence>` (see AppLayout's Outlet), the `exit` variant also plays.
 * When rendered standalone (e.g. Auth, Profile), only the entrance runs.
 */
export function PageTransition({ children, className, transitionKey }: PageTransitionProps) {
  const shouldReduce = useReducedMotion();
  return (
    <m.div
      key={transitionKey}
      className={className}
      variants={shouldReduce ? pageVariantsReduced : pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {children}
    </m.div>
  );
}
