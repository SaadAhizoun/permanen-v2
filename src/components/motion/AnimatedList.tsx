import { type ReactNode } from "react";
import { AnimatePresence, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { rowVariants, staggerItemReduced } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface AnimatedListProps<T> {
  items: T[];
  getKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  itemClassName?: string;
  as?: "div" | "li" | "tr";
  /** Enable shared-layout position animation — use when item order can change (rankings). */
  layout?: boolean;
  /** Cap the number of items that receive the entrance stagger; the rest appear instantly. Protects perf on large tables. */
  maxAnimated?: number;
}

/**
 * Animates list/table-row insertion, removal and (optionally) reordering.
 * Only the first `maxAnimated` rows get the staggered entrance — the rest
 * mount immediately so huge tables never animate hundreds of rows at once.
 */
export function AnimatedList<T>({
  items,
  getKey,
  renderItem,
  itemClassName,
  as = "div",
  layout = false,
  maxAnimated = 30,
}: AnimatedListProps<T>) {
  const shouldReduce = useReducedMotion();
  const variants = shouldReduce ? staggerItemReduced : rowVariants;
  const Tag = as === "tr" ? m.tr : as === "li" ? m.li : m.div;

  return (
    <AnimatePresence initial={false} mode="popLayout">
      {items.map((item, index) => {
        const animated = index < maxAnimated;
        return (
          <Tag
            key={getKey(item, index)}
            layout={layout && !shouldReduce ? "position" : undefined}
            className={cn(itemClassName)}
            variants={animated ? variants : undefined}
            initial={animated ? "initial" : false}
            animate="animate"
            exit={animated ? "exit" : undefined}
            transition={{ duration: 0.2 }}
          >
            {renderItem(item, index)}
          </Tag>
        );
      })}
    </AnimatePresence>
  );
}
