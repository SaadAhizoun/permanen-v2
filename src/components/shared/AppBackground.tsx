import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { cn } from "@/lib/utils";

interface AppBackgroundProps {
  /** "shell" for the authenticated app chrome, "auth" adds a faint grid texture for the login screen. */
  variant?: "shell" | "auth";
  className?: string;
}

/**
 * Fixed, decorative ambient background: a soft layered gradient plus a
 * few very low-opacity blurred color shapes with slow drift. Never affects
 * layout (fixed + pointer-events-none) and the drift stops entirely under
 * prefers-reduced-motion, leaving just the static gradient.
 */
export function AppBackground({ variant = "shell", className }: AppBackgroundProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none fixed inset-0 -z-10 overflow-hidden", className)}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-accent/[0.04]" />
      {variant === "auth" && (
        <div className="absolute inset-0 bg-grid-texture opacity-[0.35] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      )}

      <m.div
        className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-primary/[0.07] blur-3xl"
        animate={shouldReduceMotion ? undefined : { x: [0, 30, 0], y: [0, 20, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <m.div
        className="absolute top-1/3 -right-32 h-[28rem] w-[28rem] rounded-full bg-accent/[0.06] blur-3xl"
        animate={shouldReduceMotion ? undefined : { x: [0, -24, 0], y: [0, -16, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <m.div
        className="absolute -bottom-24 left-1/3 h-80 w-80 rounded-full bg-priority/[0.06] blur-3xl"
        animate={shouldReduceMotion ? undefined : { x: [0, 20, 0], y: [0, -24, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
