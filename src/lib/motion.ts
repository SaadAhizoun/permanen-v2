/**
 * Centralized motion variants and timing tokens for the application's motion system.
 * Built on the `motion` package (https://motion.dev). Keep every reusable animation
 * shape here so pages/components compose variants instead of hand-rolling transitions.
 */
import type { Transition, Variants } from "motion/react";

export const premiumEase = [0.22, 1, 0.36, 1] as const;

export const durations = {
  instant: 0.12,
  micro: 0.15,
  fast: 0.18,
  base: 0.24,
  moderate: 0.32,
  slow: 0.5,
  number: 0.65,
};

export const baseTransition: Transition = {
  duration: durations.base,
  ease: premiumEase,
};

// ---------------------------------------------------------------------------
// Page transitions
// ---------------------------------------------------------------------------
export const pageVariants: Variants = {
  initial: {
    opacity: 0,
    y: 14,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.26, ease: premiumEase },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.16, ease: premiumEase },
  },
};

export const pageVariantsReduced: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.18, ease: "easeOut" } },
  exit: { opacity: 0, transition: { duration: 0.12, ease: "easeIn" } },
};

// ---------------------------------------------------------------------------
// Stagger primitives
// ---------------------------------------------------------------------------
export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.055,
      delayChildren: 0.04,
    },
  },
};

export const staggerContainerReduced: Variants = {
  initial: {},
  animate: {
    transition: { staggerChildren: 0, delayChildren: 0 },
  },
};

export const staggerItem: Variants = {
  initial: {
    opacity: 0,
    y: 14,
    scale: 0.985,
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.22, ease: premiumEase },
  },
};

export const staggerItemReduced: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.15 } },
};

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------
export const cardHover = {
  y: -2,
  transition: { duration: durations.micro, ease: premiumEase },
};

export const cardTap = {
  scale: 0.985,
  transition: { duration: durations.instant },
};

// ---------------------------------------------------------------------------
// Sections / headers
// ---------------------------------------------------------------------------
export const sectionVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.26, ease: premiumEase } },
};

export const headerTitleVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.24, ease: premiumEase } },
};

export const headerActionVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, ease: premiumEase, delay: 0.08 },
  },
};

// ---------------------------------------------------------------------------
// Rows / list items
// ---------------------------------------------------------------------------
export const rowVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: premiumEase } },
  exit: { opacity: 0, transition: { duration: 0.14 } },
};

// ---------------------------------------------------------------------------
// Dialog / sheet content
// ---------------------------------------------------------------------------
export const dialogContentVariants: Variants = {
  initial: { opacity: 0, scale: 0.97 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.22, ease: premiumEase } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.14, ease: premiumEase } },
};

// ---------------------------------------------------------------------------
// Empty state / decorative
// ---------------------------------------------------------------------------
export const emptyStateIcon: Variants = {
  initial: { opacity: 0, scale: 0.9, y: -6 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.3, ease: premiumEase } },
};

export const floatY = {
  y: [0, -4, 0],
  transition: { duration: 3.2, repeat: Infinity, ease: "easeInOut" as const },
};

// ---------------------------------------------------------------------------
// Error shake (used once on invalid form submit)
// ---------------------------------------------------------------------------
export const shakeAnimation = {
  x: [0, -4, 4, -3, 3, 0],
  transition: { duration: 0.36, ease: premiumEase },
};

// ---------------------------------------------------------------------------
// Button feedback
// ---------------------------------------------------------------------------
export const buttonHover = { y: -1 };
export const buttonTap = { scale: 0.97 };
export const buttonFeedbackTransition: Transition = { duration: 0.15, ease: premiumEase };
