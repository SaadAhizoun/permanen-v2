import { type ReactNode, type MouseEventHandler } from "react";
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { staggerItem, staggerItemReduced } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface AnimatedCardProps {
  children: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLDivElement>;
  /** Set when the card is used standalone (not inside a StaggerContainer) and should animate in on its own. */
  animateOnMount?: boolean;
}

/**
 * KPI / content card: staggered fade-rise entrance, gentle hover elevation,
 * and press feedback when clickable. Drop inside a `StaggerContainer` for
 * the entrance to cascade with siblings.
 */
export function AnimatedCard({ children, className, onClick, animateOnMount = false }: AnimatedCardProps) {
  const shouldReduce = useReducedMotion();
  const variants = shouldReduce ? staggerItemReduced : staggerItem;
  const clickable = Boolean(onClick);

  return (
    <m.div
      className={cn(clickable && "cursor-pointer", className)}
      variants={variants}
      {...(animateOnMount ? { initial: "initial", animate: "animate" } : {})}
      whileHover={shouldReduce ? undefined : { y: -3, transition: { duration: 0.18 } }}
      whileTap={clickable && !shouldReduce ? { scale: 0.985 } : undefined}
      onClick={onClick}
    >
      {children}
    </m.div>
  );
}
