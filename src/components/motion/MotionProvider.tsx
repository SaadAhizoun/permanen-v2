import { type ReactNode } from "react";
import { MotionConfig, LazyMotion, domMax } from "motion/react";
import { premiumEase, durations } from "@/lib/motion";

interface MotionProviderProps {
  children: ReactNode;
}

/**
 * Global motion root. `reducedMotion="user"` makes every animation in the tree
 * respect the OS-level prefers-reduced-motion setting automatically, so
 * individual components don't need to re-implement that check for transform
 * animations (opacity-only fallbacks still run).
 *
 * Uses `domMax` (not `domAnimation`) because the shared `layoutId` indicators
 * (sidebar active nav, tab/segmented-control backgrounds) need the layout
 * projection feature set — `domAnimation` alone silently skips the tween and
 * the indicator would just snap to its new position instead of sliding.
 */
export function MotionProvider({ children }: MotionProviderProps) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{
        duration: durations.base,
        ease: premiumEase,
      }}
    >
      <LazyMotion features={domMax} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}
