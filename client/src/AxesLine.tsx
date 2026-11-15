// The line under page titles: Odysseus's arrow flying through twelve axe heads
// (the contest of the bow that Penelope set). The shaft draws in while the arrowhead flies along it.
import { motion } from "motion/react";

type Props = { className?: string; delay?: number; duration?: number };

const RINGS = Array.from({ length: 12 }, (_, i) => 40 + i * 16); // x of each axe-head ring

export default function AxesLine({ className, delay = 0, duration = 1.2 }: Props) {
  const fly = { delay, duration, ease: [0.45, 0, 0.2, 1] as const };
  return (
    <svg className={className} viewBox="0 0 240 16" fill="none" stroke="currentColor" aria-hidden>
      {/* the twelve axe heads */}
      {RINGS.map((x, i) => (
        <motion.circle
          key={x}
          cx={x}
          cy={8}
          r={3.2}
          strokeWidth={1.2}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 0.55, scale: 1 }}
          transition={{ delay: delay * 0.5 + i * 0.03, duration: 0.4 }}
          style={{ transformOrigin: `${x}px 8px` }}
        />
      ))}
      {/* fletching at the back of the arrow */}
      <motion.path
        d="M8 8 5 5M8 8l-3 3M12 8 9 5M12 8l-3 3"
        strokeWidth={1.2}
        strokeLinecap="round"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay, duration: 0.3 }}
      />
      {/* the shaft */}
      <motion.path
        d="M4 8H232"
        strokeWidth={1.4}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={fly}
      />
      {/* the arrowhead, flying along with the tip of the shaft */}
      <motion.path
        d="M226 4.5 234 8l-8 3.5"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ x: -226, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={fly}
      />
    </svg>
  );
}
