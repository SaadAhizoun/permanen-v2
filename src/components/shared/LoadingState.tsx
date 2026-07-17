import * as m from "motion/react-m";
import { Skeleton } from "@/components/ui/skeleton";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface LoadingStateProps {
  variant?: "cards" | "table" | "list";
  rows?: number;
  className?: string;
}

/** Skeleton placeholders shaped like the content they precede — never fake data. */
export function LoadingState({ variant = "list", rows = 4, className }: LoadingStateProps) {
  if (variant === "cards") {
    return (
      <m.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className={cn("grid gap-4 md:grid-cols-2 lg:grid-cols-4", className)}
      >
        {Array.from({ length: rows }).map((_, i) => (
          <m.div key={i} variants={staggerItem} className="kpi-card space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-4 w-32" />
          </m.div>
        ))}
      </m.div>
    );
  }

  if (variant === "table") {
    return (
      <m.div variants={staggerContainer} initial="initial" animate="animate" className={cn("space-y-2", className)}>
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: rows }).map((_, i) => (
          <m.div key={i} variants={staggerItem}>
            <Skeleton className="h-12 w-full" />
          </m.div>
        ))}
      </m.div>
    );
  }

  return (
    <m.div variants={staggerContainer} initial="initial" animate="animate" className={cn("space-y-3", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <m.div key={i} variants={staggerItem}>
          <Skeleton className="h-16 w-full" />
        </m.div>
      ))}
    </m.div>
  );
}
