import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";
import { durations, premiumEase } from "@/lib/motion";

interface AnimatedNumberProps {
  /** Pass `null`/`undefined` when the value isn't available yet — no animation, no fake number. */
  value: number | null | undefined;
  format?: (value: number) => string;
  duration?: number;
  className?: string;
  placeholder?: string;
}

/**
 * Animates the *display* of a numeric KPI from its previous value to the new
 * one. Never invents data: renders `placeholder` when the value is absent,
 * and snaps instantly (no interpolation) when reduced motion is requested.
 */
export function AnimatedNumber({
  value,
  format,
  duration = durations.number,
  className,
  placeholder = "—",
}: AnimatedNumberProps) {
  const shouldReduce = useReducedMotion();
  const [display, setDisplay] = useState(value ?? 0);
  const prevValue = useRef(value ?? 0);
  const hasMounted = useRef(false);

  useEffect(() => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return;
    }

    if (shouldReduce || !hasMounted.current) {
      setDisplay(value);
      prevValue.current = value;
      hasMounted.current = true;
      return;
    }

    const from = prevValue.current;
    if (from === value) return;

    const controls = animate(from, value, {
      duration,
      ease: premiumEase,
      onUpdate: (latest) => setDisplay(latest),
      onComplete: () => {
        prevValue.current = value;
      },
    });

    return () => controls.stop();
  }, [value, shouldReduce, duration]);

  if (value === null || value === undefined || Number.isNaN(value)) {
    return <span className={className}>{placeholder}</span>;
  }

  const formatted = format ? format(display) : Math.round(display).toLocaleString("fr-FR");
  return <span className={className}>{formatted}</span>;
}
