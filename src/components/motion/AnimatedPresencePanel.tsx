import { type ReactNode } from "react";
import { AnimatePresence, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";

interface AnimatedPresencePanelProps {
  show: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Height + opacity expand/collapse for togglable panels (filter drawers,
 * expandable table rows, collapsible form sections). Prevents layout jumps
 * by animating `height: auto` via Motion's automatic layout measurement.
 */
export function AnimatedPresencePanel({ show, children, className }: AnimatedPresencePanelProps) {
  const shouldReduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {show && (
        <m.div
          className={className}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={
            shouldReduce
              ? { duration: 0.12 }
              : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }
          }
          style={{ overflow: "hidden" }}
        >
          {children}
        </m.div>
      )}
    </AnimatePresence>
  );
}
