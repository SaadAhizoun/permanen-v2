import { type ReactNode } from "react";
import * as m from "motion/react-m";
import { headerTitleVariants, headerActionVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";

type PageHeaderAccent = "primary" | "accent" | "priority" | "info" | "success" | "warning" | "danger";

const accentIconStyles: Record<PageHeaderAccent, string> = {
  primary: "bg-primary/10 text-primary",
  accent: "bg-accent/10 text-accent",
  priority: "bg-priority/10 text-priority",
  info: "bg-info/10 text-info",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-destructive/10 text-destructive",
};

const accentBarStyles: Record<PageHeaderAccent, string> = {
  primary: "bg-gradient-to-r from-primary to-primary/20",
  accent: "bg-gradient-to-r from-accent to-accent/20",
  priority: "bg-gradient-to-r from-priority to-priority/20",
  info: "bg-gradient-to-r from-info to-info/20",
  success: "bg-gradient-to-r from-success to-success/20",
  warning: "bg-gradient-to-r from-warning to-warning/20",
  danger: "bg-gradient-to-r from-destructive to-destructive/20",
};

interface PageHeaderProps {
  /** Small contextual label shown above the title, e.g. the module/section name. */
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** Semantic color role for the icon plate and accent line. Defaults to "accent". */
  accent?: PageHeaderAccent;
}

export function PageHeader({ eyebrow, title, description, icon, actions, className, accent = "accent" }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "surface-elevated flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5",
        className,
      )}
    >
      <m.div
        variants={headerTitleVariants}
        initial="initial"
        animate="animate"
        className="flex items-start gap-3 min-w-0"
      >
        {icon && (
          <div
            aria-hidden="true"
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg [&_svg]:h-5 [&_svg]:w-5",
              accentIconStyles[accent],
            )}
          >
            {icon}
          </div>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              {eyebrow}
            </p>
          )}
          <h1 className="break-words text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
          <div className={cn("mt-1.5 h-1 w-12 rounded-full", accentBarStyles[accent])} />
          {description && (
            <p className="mt-1.5 text-sm text-muted-foreground max-w-2xl">{description}</p>
          )}
        </div>
      </m.div>
      {actions && (
        <m.div
          variants={headerActionVariants}
          initial="initial"
          animate="animate"
          className="flex flex-wrap items-center gap-2 shrink-0"
        >
          {actions}
        </m.div>
      )}
    </div>
  );
}
