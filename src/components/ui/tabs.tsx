import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";

import { cn } from "@/lib/utils";

const TabsActiveValueContext = React.createContext<string | undefined>(undefined);
const TabsIndicatorIdContext = React.createContext<string>("tabs-active-indicator");

const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ value, defaultValue, onValueChange, ...props }, ref) => {
  const [activeValue, setActiveValue] = React.useState<string | undefined>(value ?? defaultValue);
  const indicatorId = React.useId();

  React.useEffect(() => {
    if (value !== undefined) setActiveValue(value);
  }, [value]);

  return (
    <TabsIndicatorIdContext.Provider value={indicatorId}>
      <TabsActiveValueContext.Provider value={activeValue}>
        <TabsPrimitive.Root
          ref={ref}
          value={value}
          defaultValue={defaultValue}
          onValueChange={(next) => {
            setActiveValue(next);
            onValueChange?.(next);
          }}
          {...props}
        />
      </TabsActiveValueContext.Provider>
    </TabsIndicatorIdContext.Provider>
  );
});
Tabs.displayName = TabsPrimitive.Root.displayName;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, value, children, ...props }, ref) => {
  const activeValue = React.useContext(TabsActiveValueContext);
  const indicatorId = React.useContext(TabsIndicatorIdContext);
  const shouldReduceMotion = useReducedMotion();
  const isActive = activeValue === value;

  return (
    <TabsPrimitive.Trigger
      ref={ref}
      value={value}
      className={cn(
        "relative inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-colors data-[state=active]:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {isActive && (
        <m.span
          layoutId={indicatorId}
          className="absolute inset-0 z-0 rounded-md bg-gradient-primary shadow-sm"
          transition={shouldReduceMotion ? { duration: 0.01 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
      <span className="relative z-10">{children}</span>
    </TabsPrimitive.Trigger>
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
