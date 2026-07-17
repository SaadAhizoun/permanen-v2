import { cn } from "@/lib/utils";

/** Restrained shimmer: a single soft sweep, not a pulse — disabled under prefers-reduced-motion. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("relative overflow-hidden rounded-md bg-muted", className)} {...props}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer motion-reduce:hidden bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
    </div>
  );
}

export { Skeleton };
