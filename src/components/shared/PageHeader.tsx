import { type ReactNode } from "react";
import * as m from "motion/react-m";
import { headerTitleVariants, headerActionVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, icon, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 pb-2 sm:flex-row sm:items-start sm:justify-between",
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
          <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground max-w-2xl">{description}</p>
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
