// Shared animation settings (Framer Motion / "motion" package).
import type { Variants } from "motion/react";

// A smooth "ease out" curve used everywhere, so all motion feels the same
export const EASE = [0.22, 1, 0.36, 1] as const;

// Put on a parent: its children animate in one after another
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

// Put on each child: fades in while rising a little
export const rise: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};
