// The landing page: a night sea, a ship, a storm, and the "Start scanning" button.
import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import Meander from "./Meander";
import { ArrowIcon } from "./icons";
import { EASE } from "./anim";
import shipIcon from "./assets/voyage.png";
import penelopeIcon from "./assets/girl.png";
import owlIcon from "./assets/owl.png";
import islandIcon from "./assets/mountain.png";
import logoMark from "./assets/logo-mark.png";
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

// The lightning bolt and the flash share one timing, so they strike together
const STRIKE = {
  duration: 1.4,
  times: [0, 0.5, 0.54, 0.62, 0.68, 1],
  repeat: Infinity,
  repeatDelay: 7,
  delay: 3.6,
  ease: "linear" as const,
};

// Curtain timing (0.16 = 8vh bar / 50vh curtain)
const CURTAIN = { delay: 0.2, duration: 1.6, ease: [0.76, 0, 0.24, 1] as const };

// ---------- The crew section ----------
const CREW = [
  {
    num: "I",
    icon: penelopeIcon,
    name: "Penelope",
    role: "Keeps the ledger",
    text: "Twenty years she held the house together and outwitted a hall full of suitors. Photograph a receipt and she reads it, sorts every line, and files it away.",
  },
  {
    num: "II",
    icon: islandIcon,
    name: "The voyage",
    role: "Charts the course",
    text: "Months of spending laid out like a coastline: where it went, when it went, and which harbours you keep sailing back to.",
  },
  {
    num: "III",
    icon: owlIcon,
    name: "Athena",
    role: "Gives counsel",
    text: "Grey-eyed and patient. Ask her plain questions about your money, like what you spent on dining in August, and she answers from your own data.",
    tag: "Arriving soon",
  },
];

export default function Landing({ onStart }: { onStart: () => void }) {
  // Parallax: as you scroll past the hero, the title lifts away faster than the sea
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const copyY = useTransform(scrollYProgress, [0, 1], [0, -160]);
  const copyFade = useTransform(scrollYProgress, [0, 0.55], [1, 0]);
  const seaY = useTransform(scrollYProgress, [0, 1], [0, 90]);
  const moonY = useTransform(scrollYProgress, [0, 1], [0, 70]);

  return (
    <motion.div
      className="landing"
      exit={{ opacity: 0, scale: 1.06, filter: "blur(10px)" }}
      transition={{ duration: 0.7, ease: EASE }}
    >
      <div className="grain" aria-hidden />

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

        {/* Title and button */}
        <motion.div className="hero-copy" style={{ y: copyY, opacity: copyFade }}>
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

          <Meander units={18} className="hero-meander" delay={2.0} duration={1.8} />

          <motion.p
            className="tagline"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 2.3, duration: 1, ease: EASE }}
          >
            Every penny finds its way home.
          </motion.p>
          <motion.p
            className="sub"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.6, duration: 1.2 }}
          >
            Penny, as in the coin. Penny, as in Penelope.
          </motion.p>

          <motion.button
            className="cta"
            onClick={onStart}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 2.8, duration: 0.9, ease: EASE }}
            whileTap={{ scale: 0.97 }}
          >
            <span>Start scanning</span>
            <ArrowIcon />
          </motion.button>
        </motion.div>

        {/* The sea, with the ship between the back and front waves */}
        <motion.div className="sea" style={{ y: seaY }} aria-hidden>
          {BACK_WAVES.map((w, i) => (
            <Wave key={i} {...w} />
          ))}
          <div className="moon-path" />
          <motion.div
            className="ship"
            initial={{ x: "-60vw", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.6, duration: 4, ease: EASE }}
          >
            <motion.div
              animate={{ x: ["-3vw", "3vw"] }}
              transition={{ duration: 18, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
            >
              <motion.img
                src={shipIcon}
                alt=""
                animate={{ y: [0, -9, 0], rotate: [-4, 3, -4] }}
                transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
              />
            </motion.div>
          </motion.div>
          {FRONT_WAVES.map((w, i) => (
            <Wave key={i} {...w} />
          ))}
        </motion.div>

        <motion.div className="flash" animate={{ opacity: [0, 0, 0.5, 0, 0.22, 0] }} transition={STRIKE} aria-hidden />
        <div className="vignette" aria-hidden />

        {/* Letterbox: two black curtains close the screen, then shrink to widescreen bars */}
        <motion.div className="curtain curtain-top" initial={{ scaleY: 1 }} animate={{ scaleY: 0.16 }} transition={CURTAIN} />
        <motion.div className="curtain curtain-bottom" initial={{ scaleY: 1 }} animate={{ scaleY: 0.16 }} transition={CURTAIN} />
        <div className="bar bar-top">
          <motion.div className="bar-inner" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8, duration: 1 }}>
            <span className="bar-brand">
              <img src={logoMark} alt="" />
              Penny
            </span>
            <span className="only-wide">Book I · The Ledger</span>
          </motion.div>
        </div>
        <div className="bar bar-bottom">
          <motion.div className="bar-inner" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8, duration: 1 }}>
            <span className="only-wide">HackUTA · MMXXVI</span>
            <span className="scroll-hint">
              Meet the crew
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </span>
          </motion.div>
        </div>
      </section>

      {/* ================= THE CREW ================= */}
      <section className="crew">
        <motion.div
          className="crew-head"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 1, ease: EASE }}
        >
          <span className="eyebrow-l">The crew</span>
          <h2>Odysseus got the poem. The two women in his story were the ones who kept things running.</h2>
        </motion.div>

        <div className="crew-grid">
          {CREW.map((c, i) => (
            <motion.article
              key={c.name}
              className="crew-card"
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{ delay: i * 0.14, duration: 0.9, ease: EASE }}
            >
              <span className="crew-num">{c.num}</span>
              {c.tag && <span className="crew-tag">{c.tag}</span>}
              <img src={c.icon} alt="" className="crew-icon" />
              <h3>{c.name}</h3>
              <span className="crew-role">{c.role}</span>
              <p>{c.text}</p>
            </motion.article>
          ))}
        </div>
      </section>

      {/* ================= FINALE ================= */}
      <section className="finale">
        <Meander units={10} className="finale-meander" duration={1.4} />
        <motion.blockquote
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          “Tell me, Muse, of the one who kept the receipts.”
        </motion.blockquote>
        <p className="finale-cite">Not quite Homer</p>
        <motion.button className="cta" onClick={onStart} whileTap={{ scale: 0.97 }}>
          <span>Start scanning</span>
          <ArrowIcon />
        </motion.button>
      </section>
    </motion.div>
  );
}
