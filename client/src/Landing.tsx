// The landing page: a night sea, a ship, a storm, and the "Start scanning" button.
// Clicking "Start scanning" sends the ship sailing off to the left, then the next page slides in.
import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import AxesLine from "./AxesLine";
import GoldSack from "./GoldSack";
import VoyageChart from "./VoyageChart";
import { ArrowIcon } from "./icons";
import { EASE } from "./anim";
import shipImg from "./assets/ship-left.png";
import bowImg from "./assets/bow-gold.png";
import hopliteImg from "./assets/warrior-hoplite.svg";
import archerImg from "./assets/warrior-archer.svg";
import "./landing.css";

// ---------- The sea ----------
// Each wave is an SVG twice as wide as the screen. Sliding it left by half,
// over and over, makes an endless wave (the wavelengths divide 1440 evenly).
const W = 2880;
const H = 300;
function wavePath(base: number, amp: number, wl: number) {
  let d = `M0 ${base}`;
  for (let x = 0; x < W; x += wl) {
    d += ` Q${x + wl / 4} ${base - amp} ${x + wl / 2} ${base} Q${x + (3 * wl) / 4} ${base + amp} ${x + wl} ${base}`;
  }
  return `${d} L${W} ${H} L0 ${H} Z`;
}

// back to front: lighter (moonlit) far away, near-black up close
const BACK_WAVES = [
  { d: wavePath(70, 10, 288), fill: "#15284a", crest: 0.22, duration: 52 },
  { d: wavePath(112, 16, 480), fill: "#0e1c34", crest: 0.15, duration: 36 },
];
const FRONT_WAVES = [
  { d: wavePath(150, 22, 720), fill: "#091426", crest: 0.12, duration: 24 },
  { d: wavePath(205, 26, 360), fill: "#04090f", crest: 0.07, duration: 16 },
];

function Wave({ d, fill, crest, duration }: (typeof BACK_WAVES)[number]) {
  return (
    <div className="wave">
      <motion.svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration, ease: "linear", repeat: Infinity }}
      >
        <path d={d} fill={fill} stroke={`rgba(233, 213, 170, ${crest})`} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </motion.svg>
    </div>
  );
}

// ---------- The sky ----------
// Random stars, made once when the page loads
const STARS = Array.from({ length: 90 }, () => ({
  left: `${Math.random() * 100}%`,
  top: `${Math.random() * 58}%`,
  size: Math.random() < 0.85 ? 1 : 2,
  delay: `${(Math.random() * 6).toFixed(2)}s`,
  duration: `${(2 + Math.random() * 4).toFixed(2)}s`,
}));

// Little sparkles of moonlight on the water (wider the closer they are)
const GLINTS = [
  { top: "20%", left: "-6px", width: 10, delay: "0s" },
  { top: "27%", left: "10px", width: 14, delay: "1.3s" },
  { top: "34%", left: "-18px", width: 18, delay: "0.6s" },
  { top: "42%", left: "6px", width: 22, delay: "2.1s" },
  { top: "50%", left: "-24px", width: 26, delay: "1s" },
  { top: "58%", left: "14px", width: 30, delay: "2.6s" },
];

// The lightning bolt and the flash share one timing, so they strike together
const STRIKE = {
  duration: 1.4,
  times: [0, 0.5, 0.54, 0.62, 0.68, 1],
  repeat: Infinity,
  repeatDelay: 7,
  delay: 3.6,
  ease: "linear" as const,
};

// Curtains open like the start of a film
const CURTAIN = { delay: 0.2, duration: 1.6, ease: [0.76, 0, 0.24, 1] as const };

// How long the ship sails before the next page slides in (milliseconds)
const SAIL_TIME = 1150;

// ---------- The crew ----------
const CREW = [
  { num: "I", name: "Subam", title: "Helmsman", art: hopliteImg },
  { num: "II", name: "Sandesh", title: "Navigator", art: archerImg },
];

export default function Landing({ onStart }: { onStart: () => void }) {
  // Parallax: as you scroll past the hero, the title lifts away faster than the sea
  const heroRef = useRef<HTMLElement>(null);
  const crewRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const copyY = useTransform(scrollYProgress, [0, 1], [0, -160]);
  const copyFade = useTransform(scrollYProgress, [0, 0.55], [1, 0]);
  const seaY = useTransform(scrollYProgress, [0, 1], [0, 90]);
  const moonY = useTransform(scrollYProgress, [0, 1], [0, 70]);

  // ---------- "Start scanning": sail away, then go to the next page ----------
  const [sailing, setSailing] = useState(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []); // tidy up if the page closes early

  function sailAway() {
    if (sailing) return;
    // From the bottom of the page: glide back up to the ship first
    const scrolled = window.scrollY > 40;
    if (scrolled) window.scrollTo({ top: 0, behavior: "smooth" });
    const wait = scrolled ? 700 : 0;
    timers.current.push(window.setTimeout(() => setSailing(true), wait));
    timers.current.push(window.setTimeout(onStart, wait + SAIL_TIME));
  }

  return (
    <motion.div
      className="landing"
      exit={{ x: "-100%" }} // slides away to the left, like the ship
      transition={{ duration: 0.55, ease: [0.65, 0, 0.35, 1] }}
    >
      <div className="grain" aria-hidden />
      <VoyageChart />

      {/* ================= HERO ================= */}
      <section className="hero" ref={heroRef}>
        <div className="sky" aria-hidden>
          {STARS.map((s, i) => (
            <span
              key={i}
              className="star"
              style={{
                left: s.left,
                top: s.top,
                width: s.size,
                height: s.size,
                animationDelay: s.delay,
                animationDuration: s.duration,
              }}
            />
          ))}
          <motion.div className="moon-wrap" style={{ y: moonY }}>
            <motion.div
              className="moon"
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 3, ease: EASE }}
            />
          </motion.div>
          <div className="cloud cloud-a" />
          <div className="cloud cloud-b" />
          <svg className="bolt" viewBox="0 0 60 200" fill="none">
            <motion.path
              d="M40 0 L24 68 L36 70 L15 138 L28 140 L8 200"
              stroke="#f4ead2"
              strokeWidth={2}
              strokeLinejoin="bevel"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: [0, 0, 1, 1, 1, 1], opacity: [0, 0, 1, 0.3, 0.9, 0] }}
              transition={STRIKE}
            />
          </svg>
        </div>

        {/* Title and button (scroll moves the outer layer, sailing fades the inner one) */}
        <motion.div className="hero-copy" style={{ y: copyY, opacity: copyFade }}>
          <motion.div
            className="hero-copy-inner"
            animate={sailing ? { opacity: 0, y: -24 } : { opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <motion.p
              className="eyebrow-l"
              initial={{ opacity: 0, letterSpacing: "0.7em" }}
              animate={{ opacity: 1, letterSpacing: "0.32em" }}
              transition={{ delay: 1.0, duration: 1.8, ease: EASE }}
            >
              A ledger for the long way home
            </motion.p>

            <h1 className="title" aria-label="Penny">
              {"PENNY".split("").map((ch, i) => (
                <motion.span
                  key={i}
                  aria-hidden
                  initial={{ opacity: 0, y: 60, filter: "blur(16px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ delay: 1.25 + i * 0.12, duration: 1.2, ease: EASE }}
                >
                  {ch}
                </motion.span>
              ))}
            </h1>

            <AxesLine className="hero-axes" delay={2.0} duration={1.4} />

            <motion.p
              className="tagline"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 2.4, duration: 1, ease: EASE }}
            >
              Every penny finds its way home.
            </motion.p>

            <motion.button
              className="cta"
              onClick={sailAway}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 2.7, duration: 0.9, ease: EASE }}
              whileTap={{ scale: 0.97 }}
            >
              <span>Start scanning</span>
              <ArrowIcon />
            </motion.button>
          </motion.div>
        </motion.div>

        {/* The sea, with the ship between the back and front waves */}
        <motion.div className="sea" style={{ y: seaY }} aria-hidden>
          {BACK_WAVES.map((w, i) => (
            <Wave key={i} {...w} />
          ))}
          {/* moonlight on the water: a soft glow plus a few sparkles */}
          <div className="moon-glow">
            {GLINTS.map((g, i) => (
              <span key={i} className="glint" style={{ top: g.top, left: g.left, width: g.width, animationDelay: g.delay }} />
            ))}
          </div>

          {/* The ship: sails in from the right, rests near the middle, sails off left on "Start scanning" */}
          <motion.div
            className="ship"
            initial={{ x: "60vw", opacity: 0 }}
            animate={sailing ? { x: "-115vw", opacity: 1 } : { x: 0, opacity: 1 }}
            transition={
              sailing
                ? { duration: 1.5, ease: [0.5, 0, 0.75, 0.3] } // speeds up as it leaves
                : { delay: 0.6, duration: 4.5, ease: EASE }
            }
          >
            {/* white water trailing behind the ship while it sails off */}
            <motion.div
              className="wake"
              initial={{ opacity: 0, scaleX: 0.2 }}
              animate={sailing ? { opacity: 1, scaleX: 1 } : { opacity: 0, scaleX: 0.2 }}
              transition={{ duration: 0.6, ease: EASE }}
            >
              <i />
              <i />
              <i />
            </motion.div>
            <motion.div
              animate={sailing ? { x: 0 } : { x: ["-2vw", "2vw"] }}
              transition={sailing ? { duration: 0.3 } : { duration: 20, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
            >
              <motion.img
                src={shipImg}
                alt=""
                animate={{ y: [0, -7, 0], rotate: [2, -1.5, 2] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              />
            </motion.div>
          </motion.div>
          {FRONT_WAVES.map((w, i) => (
            <Wave key={i} {...w} />
          ))}
        </motion.div>

        <motion.div className="flash" animate={{ opacity: [0, 0, 0.5, 0, 0.22, 0] }} transition={STRIKE} aria-hidden />
        <div className="vignette" aria-hidden />

        {/* Two black curtains cover the screen, then slide away */}
        <motion.div className="curtain curtain-top" initial={{ scaleY: 1 }} animate={{ scaleY: 0 }} transition={CURTAIN} />
        <motion.div className="curtain curtain-bottom" initial={{ scaleY: 1 }} animate={{ scaleY: 0 }} transition={CURTAIN} />

        <motion.button
          className="scroll-hint"
          onClick={() => crewRef.current?.scrollIntoView({ behavior: "smooth" })}
          initial={{ opacity: 0 }}
          animate={{ opacity: sailing ? 0 : 1 }}
          transition={{ delay: sailing ? 0 : 3.4, duration: sailing ? 0.3 : 1 }}
        >
          Meet the crew
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </motion.button>
      </section>

      {/* ================= THE CREW ================= */}
      <section className="crew" ref={crewRef}>
        <motion.div
          className="crew-head"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 1, ease: EASE }}
        >
          <span className="eyebrow-l">The crew</span>
          <h2>Two sailors, one night, one ship.</h2>
        </motion.div>

        <div className="crew-grid">
          {CREW.map((c, i) => (
            <motion.article
              key={c.name}
              className={`crew-card ${i % 2 === 1 ? "crew-card-flip" : ""}`}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ delay: i * 0.15, duration: 0.9, ease: EASE }}
            >
              {/* the big faint numeral behind the name */}
              <span className="crew-numeral" aria-hidden>
                {c.num}
              </span>
              <motion.img
                src={c.art}
                alt=""
                className="crew-art"
                initial={{ opacity: 0, scale: 0.92 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.25 + i * 0.15, duration: 0.9, ease: EASE }}
              />
              <div className="crew-text">
                <span className="crew-num">{c.num}</span>
                <h3>{c.name}</h3>
                <motion.span
                  className="crew-rule"
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.4 + i * 0.15, duration: 0.9, ease: EASE }}
                />
                <span className="crew-title">{c.title}</span>
              </div>
            </motion.article>
          ))}
        </div>
        <p className="crew-foot">HackUTA · MMXXVI</p>
      </section>

      {/* ================= FINALE ================= */}
      <section className="finale">
        <div className="finale-inner">
          {/* left: the sack of gold the quote talks about */}
          <motion.div
            className="finale-art"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 1, ease: EASE }}
          >
            <GoldSack className="gold-sack" />
          </motion.div>

          {/* right: the bow, the quote and the button */}
          <div className="finale-copy">
            {/* the wrapper watches for "in view" (the bow itself starts fully clipped, so it can't) */}
            <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }}>
              <motion.img
                src={bowImg}
                alt=""
                className="finale-bow"
                variants={{
                  hidden: { clipPath: "inset(0 100% 0 0)", opacity: 0 },
                  show: { clipPath: "inset(0 0% 0 0)", opacity: 1, transition: { duration: 1.6, ease: EASE } },
                }}
              />
            </motion.div>
            <motion.blockquote
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 1.1, ease: EASE }}
            >
              “Look inside your sack to see how much gold you have secured.”
            </motion.blockquote>
            <motion.button className="cta finale-cta" onClick={sailAway} whileTap={{ scale: 0.97 }}>
              <span>Start scanning</span>
              <ArrowIcon />
            </motion.button>
          </div>
        </div>
      </section>
    </motion.div>
  );
}
