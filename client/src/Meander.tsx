// A Greek key ("meander") line that draws itself in.
import { motion } from "motion/react";

type Props = { units?: number; className?: string; delay?: number; duration?: number };

// Builds one continuous line: baseline -> hook up and in -> back out -> next hook.
// (Going back over the same line keeps it one path, so it draws smoothly left to right.)
function meanderPath(units: number) {
  let d = "M0 19";
  for (let i = 0; i < units; i++) {
    const x = i * 20;
    d += ` H${x + 3} V3 H${x + 17} V15 H${x + 8} V8 H${x + 13}`; // in
    d += ` H${x + 8} V15 H${x + 17} V3 H${x + 3} V19 H${x + 20}`; // back out
  }
  return d;
}

export default function Meander({ units = 12, className, delay = 0, duration = 1.6 }: Props) {
  return (
    <svg className={className} viewBox={`-1 0 ${units * 20 + 2} 21`} fill="none" aria-hidden>
      <motion.path
        d={meanderPath(units)}
        stroke="currentColor"
        strokeWidth={1.5}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ delay, duration, ease: "easeInOut" }}
      />
    </svg>
  );
}
