import { type ReactNode } from "react";
import * as m from "motion/react-m";
import type { Variants } from "motion/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { staggerItem } from "@/lib/motion";
import { cn } from "@/lib/utils";

const kpiCardVariants: Variants = {
  ...staggerItem,
  hover: { y: -3, transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] } },
};

export type StatCardAccent = "primary" | "accent" | "priority" | "info" | "success" | "warning" | "danger" | "neutral";

const accentStyles: Record<StatCardAccent, { plate: string; icon: string; card: string }> = {
  primary: { plate: "bg-primary/10", icon: "text-primary", card: "hover:border-primary/25" },
  accent: { plate: "bg-accent/10", icon: "text-accent", card: "hover:border-accent/25" },
  priority: { plate: "bg-priority/10", icon: "text-priority", card: "hover:border-priority/25" },
  info: { plate: "bg-info/10", icon: "text-info", card: "hover:border-info/25" },
  success: { plate: "bg-success/10", icon: "text-success", card: "hover:border-success/25" },
  warning: { plate: "bg-warning/10", icon: "text-warning", card: "hover:border-warning/25" },
  danger: { plate: "bg-destructive/10", icon: "text-destructive", card: "hover:border-destructive/25" },
  neutral: { plate: "bg-muted", icon: "text-muted-foreground", card: "" },
};

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  secondary?: ReactNode;
  /** Only pass real, already-computed trend data. Never fabricate a percentage. */
  trend?: { value: string; tone: "success" | "warning" | "danger" };
  loading?: boolean;
  valueClassName?: string;
  className?: string;
  /** Semantic color role for the icon plate and hover border glow. Defaults to "accent". */
  accent?: StatCardAccent;
}

const trendTone = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

export function StatCard({
  label,
  value,
  icon,
  secondary,
  trend,
  loading,
  valueClassName,
  className,
  accent = "accent",
}: StatCardProps) {
  const styles = accentStyles[accent];

  if (loading) {
    return (
      <Card className={cn("kpi-card", className)}>
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-24" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-16" />
          <Skeleton className="mt-2 h-4 w-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <m.div variants={kpiCardVariants} whileHover="hover" className="h-full">
      <Card className={cn("kpi-card h-full transition-shadow hover:shadow-md", styles.card, className)}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
          {icon && (
            <m.span
              aria-hidden="true"
              variants={{ hover: { scale: 1.1, rotate: 3 } }}
              transition={{ duration: 0.18 }}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg [&_svg]:h-4 [&_svg]:w-4",
                styles.plate,
                styles.icon,
              )}
            >
              {icon}
            </m.span>
          )}
        </CardHeader>
        <CardContent>
          <div className={cn("text-2xl font-bold tracking-tight", valueClassName)}>{value}</div>
          {(secondary || trend) && (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              {trend && <span className={cn("font-medium", trendTone[trend.tone])}>{trend.value}</span>}
              {secondary}
            </div>
          )}
        </CardContent>
      </Card>
    </m.div>
  );
}
