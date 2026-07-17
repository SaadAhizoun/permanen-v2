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
}: StatCardProps) {
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
      <Card className={cn("kpi-card h-full transition-shadow hover:shadow-md", className)}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
          {icon && (
            <m.span
              aria-hidden="true"
              variants={{ hover: { scale: 1.15, rotate: 3 } }}
              transition={{ duration: 0.18 }}
              className="text-accent [&_svg]:h-4 [&_svg]:w-4"
            >
              {icon}
            </m.span>
          )}
        </CardHeader>
        <CardContent>
          <div className={cn("text-2xl font-bold", valueClassName)}>{value}</div>
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
