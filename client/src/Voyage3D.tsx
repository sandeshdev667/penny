// The Voyage, in 3D: each month is an island on a moonlit sea. Gold coins stacked on its beach show
// what was spent there (one stack per category; more coins = more spent). Pick a month and the ship
// sails to that island while the camera follows from behind (third-person). Drag to look around.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { usd } from "./format";
import { useLang } from "./lang";

type MonthCategory = { month: string; category: string; total: number };
type Island = {
  month: string;
  label: string; // "Aug 2026"
  total: number; // positive spending only
  cats: { category: string; name: string; total: number; coins: number }[];
  pos: THREE.Vector3; // island centre
  dock: THREE.Vector3; // where the ship stops (south of the island)
  radius: number;
};

const R = 8; // island radius
const DOCK_GAP = 7; // how far off the beach the ship stops
const NORTH = Math.atan2(1, 0); // ship heading that faces an island from its dock (towards -z)

// ---------- helpers ----------

// The last (up to) 12 months ending with the current one, starting at the first month that has spending
function monthKeys(rows: MonthCategory[], thisMonth: string) {
  const [y, m] = thisMonth.split("-").map(Number);
  const keys: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const has = new Set(rows.filter((r) => r.total > 0).map((r) => r.month));
  const first = keys.findIndex((k) => has.has(k));
  const start = first === -1 ? keys.length - 3 : Math.min(first, keys.length - 3);
  return keys.slice(Math.max(0, start));
}

// Value of one coin: the smallest "nice" amount that keeps the biggest month under ~100 coins
function coinValue(maxTotal: number) {
  const steps = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  return steps.find((s) => maxTotal / s <= 100) ?? 10000;
}

// heading (rotation about y) for moving in direction (dx, dz); the ship model points along +x
const yawFor = (dx: number, dz: number) => Math.atan2(-dz, dx);

// shortest turn from angle a to angle b
function turn(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// the order of docks the ship visits on the way from island `from` to island `to`
function range(from: number, to: number) {
  const out: number[] = [];
  if (to >= from) for (let i = from; i <= to; i++) out.push(i);
  else for (let i = from; i >= to; i--) out.push(i);
  return out;
}

// ---------- the sea: a moving, moonlit surface (custom shader) ----------

const SEA_VERTEX = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying vec3 vNormal2;
  varying float vH;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    float a = w.x * 0.15 + uTime * 1.1;
    float b = w.z * 0.22 + uTime * 0.8;
    float c = (w.x + w.z) * 0.37 + uTime * 1.7;
    float h = sin(a) * 0.35 + sin(b) * 0.25 + sin(c) * 0.12;
    // slope of the waves -> a smooth normal (so the moonlight shimmers instead of looking faceted)
    float dx = cos(a) * 0.35 * 0.15 + cos(c) * 0.12 * 0.37;
    float dz = cos(b) * 0.25 * 0.22 + cos(c) * 0.12 * 0.37;
    vNormal2 = normalize(vec3(-dx, 1.0, -dz));
    w.y += h;
    vH = h;
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const SEA_FRAGMENT = /* glsl */ `
  uniform vec3 uDeep;
  uniform vec3 uCrest;
  uniform vec3 uFog;
  uniform vec3 uMoonDir;
  varying vec3 vWorld;
  varying vec3 vNormal2;
  varying float vH;
  void main() {
    vec3 n = normalize(vNormal2);
    vec3 viewDir = normalize(cameraPosition - vWorld);
    vec3 col = mix(uDeep, uCrest, smoothstep(-0.5, 0.6, vH) * 0.7);
    // moonlight glinting on the waves
    vec3 refl = reflect(-viewDir, n);
    float glint = pow(max(dot(refl, normalize(uMoonDir)), 0.0), 140.0);
    col += vec3(1.0, 0.9, 0.7) * glint * 0.8;
    float fres = pow(1.0 - max(dot(viewDir, n), 0.0), 3.0);
    col = mix(col, uFog * 1.5, fres * 0.3);
    // fade into the night towards the horizon
    float d = length(cameraPosition.xz - vWorld.xz);
    col = mix(col, uFog, smoothstep(70.0, 260.0, d));
    gl_FragColor = vec4(col, 1.0);
  }
`;

const MOON_DIR = new THREE.Vector3(-0.45, 0.32, -1).normalize();

function Sea({ centerX }: { centerX: number }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SEA_VERTEX,
        fragmentShader: SEA_FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uDeep: { value: new THREE.Color("#12305a") },
          uCrest: { value: new THREE.Color("#3f72a8") },
          uFog: { value: new THREE.Color("#132544") },
          uMoonDir: { value: MOON_DIR.clone() },
        },
      }),
    [],
  );
  const matRef = useRef(material); // a ref, so the time can be advanced every frame
  useFrame((_, dt) => {
    matRef.current.uniforms.uTime.value += dt;
  });
  return (
    <mesh rotation-x={-Math.PI / 2} position={[centerX, 0, 0]} material={material}>
      <planeGeometry args={[900, 600, 220, 150]} />
    </mesh>
  );
}

// ---------- sky: stars and the moon ----------

function Sky() {
  const stars = useMemo(() => {
    const pts: number[] = [];
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 700; i++) {
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(rand() * 0.92); // upper half of the sky
      const r = 380;
      pts.push(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi) + 10, r * Math.sin(phi) * Math.sin(theta));
    }
    return new Float32Array(pts);
  }, []);
  const moonPos = MOON_DIR.clone().multiplyScalar(300);
  return (
    <>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[stars, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#f4ead2" size={1.4} sizeAttenuation={false} fog={false} />
      </points>
      <mesh position={moonPos}>
        <sphereGeometry args={[14, 32, 32]} />
        <meshBasicMaterial color="#f6e7bd" fog={false} />
      </mesh>
      <mesh position={moonPos}>
        <sphereGeometry args={[30, 32, 32]} />
        <meshBasicMaterial color="#f6e7bd" transparent opacity={0.08} fog={false} depthWrite={false} />
      </mesh>
    </>
  );
}

// ---------- the ship (built from simple shapes) ----------

function useSailTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const g = c.getContext("2d")!;
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? "#a8452a" : "#efe0b8";
      g.fillRect(i * 8, 0, 8, 64);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
}

function useWakeTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 32;
    const g = c.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, 128, 0);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(1, "rgba(255,255,255,0.9)");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(128, 12);
    g.lineTo(128, 20);
    g.lineTo(0, 32);
    g.fill();
    return new THREE.CanvasTexture(c);
  }, []);
}

function Ship({ shipRef, speedRef }: { shipRef: React.RefObject<THREE.Group | null>; speedRef: React.RefObject<number> }) {
  const sailTex = useSailTexture();
  const wakeTex = useWakeTexture();
  const bodyRef = useRef<THREE.Group>(null);
  const oarsRef = useRef<THREE.Group[]>([]);
  const wakeRef = useRef<THREE.Mesh>(null);

  // hull: a side profile (curved keel, raised stern, ram at the bow) pushed out into 3D
  const hull = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-3.2, 1.0);
    s.quadraticCurveTo(-2.6, -0.4, -1.2, -0.45);
    s.lineTo(2.2, -0.45);
    s.lineTo(3.9, -0.05); // the bronze ram
    s.lineTo(3.0, 0.15);
    s.quadraticCurveTo(3.2, 0.7, 3.0, 0.75);
    s.lineTo(-2.6, 0.75);
    s.lineTo(-3.2, 1.0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 1.5, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.25, bevelSegments: 2, curveSegments: 10 });
    geo.translate(0, 0, -0.75);
    return geo;
  }, []);

  // the sail billows forward
  const sail = useMemo(() => {
    const geo = new THREE.PlaneGeometry(3.0, 2.4, 12, 8);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      p.setZ(i, Math.cos((x / 3.0) * Math.PI) * 0.45 * (0.6 + 0.4 * Math.cos((y / 2.4) * Math.PI)));
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const speed = speedRef.current ?? 0;
    if (bodyRef.current) {
      bodyRef.current.position.y = 0.55 + Math.sin(t * 1.3) * 0.12;
      bodyRef.current.rotation.x = Math.sin(t * 1.1) * 0.05;
      bodyRef.current.rotation.z = Math.sin(t * 0.9 + 1) * 0.035 + Math.min(speed, 20) * 0.002;
    }
    // oars sweep while sailing
    oarsRef.current.forEach((oar, i) => {
      if (!oar) return;
      const side = i % 2 ? -1 : 1;
      oar.rotation.y = side * (0.35 + (speed > 0.5 ? Math.sin(t * 4 + i * 0.3) * 0.35 : 0));
    });
    if (wakeRef.current) {
      const m = wakeRef.current.material as THREE.MeshBasicMaterial;
      m.opacity = Math.min(0.22, speed * 0.02);
      wakeRef.current.scale.x = 0.6 + Math.min(1.4, speed * 0.08);
    }
  });

  return (
    <group ref={shipRef}>
      {/* foam trailing behind */}
      <mesh ref={wakeRef} rotation-x={-Math.PI / 2} position={[-6.5, 0.12, 0]}>
        <planeGeometry args={[7, 2.4]} />
        <meshBasicMaterial map={wakeTex} transparent opacity={0} depthWrite={false} />
      </mesh>
      <group ref={bodyRef}>
        <mesh geometry={hull} castShadow>
          <meshStandardMaterial color="#4d3018" roughness={0.8} />
        </mesh>
        {/* gold band along the side */}
        <mesh position={[0.2, 0.55, 0]}>
          <boxGeometry args={[5.6, 0.12, 2.06]} />
          <meshStandardMaterial color="#d9a94a" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* the painted eye on the bow */}
        {[1, -1].map((side) => (
          <mesh key={side} position={[2.85, 0.35, side * 0.97]} rotation-y={side === 1 ? 0 : Math.PI}>
            <circleGeometry args={[0.18, 16]} />
            <meshBasicMaterial color="#f3e6bd" />
          </mesh>
        ))}
        {/* curled stern ornament */}
        <mesh position={[-3.25, 1.35, 0]} rotation-z={0.6}>
          <torusGeometry args={[0.42, 0.09, 8, 20, Math.PI * 1.4]} />
          <meshStandardMaterial color="#d9a94a" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* mast, yard and sail */}
        <mesh position={[0.2, 2.6, 0]}>
          <cylinderGeometry args={[0.08, 0.1, 4.4, 8]} />
          <meshStandardMaterial color="#3a2412" />
        </mesh>
        <mesh position={[0.2, 4.15, 0]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.06, 0.06, 3.4, 8]} />
          <meshStandardMaterial color="#3a2412" />
        </mesh>
        <mesh geometry={sail} position={[0.32, 2.85, 0]} rotation-y={Math.PI / 2}>
          <meshStandardMaterial map={sailTex} side={THREE.DoubleSide} roughness={0.9} emissive="#3a2a10" emissiveIntensity={0.25} />
        </mesh>
        {/* pennant */}
        <mesh position={[0.6, 5.0, 0]}>
          <planeGeometry args={[0.8, 0.3]} />
          <meshBasicMaterial color="#d9a94a" side={THREE.DoubleSide} />
        </mesh>
        {/* oars, five per side */}
        {Array.from({ length: 10 }, (_, i) => {
          const side = i % 2 ? -1 : 1;
          const x = -1.6 + Math.floor(i / 2) * 0.85;
          return (
            <group key={i} position={[x, 0.3, side * 0.95]} ref={(g) => { if (g) oarsRef.current[i] = g; }}>
              <mesh position={[0, -0.25, side * 1.1]} rotation-x={side * 1.1}>
                <cylinderGeometry args={[0.035, 0.035, 2.6, 5]} />
                <meshStandardMaterial color="#c9a46a" />
              </mesh>
            </group>
          );
        })}
        {/* stern lantern */}
        <mesh position={[-2.9, 1.25, 0]}>
          <sphereGeometry args={[0.16, 12, 12]} />
          <meshBasicMaterial color="#ffd28a" />
        </mesh>
        <pointLight position={[-2.9, 1.6, 0]} color="#ffb860" intensity={6} distance={12} />
      </group>
    </group>
  );
}

// ---------- an island with its gold ----------

const coinGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.15, 20);
const coinMat = new THREE.MeshStandardMaterial({ color: "#f0bf4a", metalness: 0.55, roughness: 0.3, emissive: "#8a5c12", emissiveIntensity: 0.55 });

// small offsets for the columns inside one stack of coins (a tight hexagonal heap)
const COLUMN_SPOTS = [
  [0, 0], [1.25, 0], [-0.62, 1.08], [-0.62, -1.08], [0.62, 1.08], [0.62, -1.08], [-1.25, 0],
  [1.87, 1.08], [1.87, -1.08], [-1.87, 1.08], [-1.87, -1.08], [0, 2.16], [0, -2.16],
];
const PER_COLUMN = 9;
const COIN_STEP = 0.15; // height of one coin in a stack

// One category's gold: `count` coins stacked in columns
function CoinHeap({ count, position, label, show, lift = 0 }: { count: number; position: [number, number, number]; label: string; show: boolean; lift?: number }) {
  const [hover, setHover] = useState(false);
  const coins = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const col = Math.floor(i / PER_COLUMN) % COLUMN_SPOTS.length;
        const level = (i % PER_COLUMN) + Math.floor(i / (PER_COLUMN * COLUMN_SPOTS.length)) * PER_COLUMN;
        const [cx, cz] = COLUMN_SPOTS[col];
        const jitter = ((i * 37) % 7) / 40;
        return {
          pos: [cx + jitter, 0.08 + level * COIN_STEP, cz - jitter] as [number, number, number],
          rot: [jitter * 0.6, i * 0.7, -jitter * 0.5] as [number, number, number],
        };
      }),
    [count],
  );
  const height = Math.min(count, PER_COLUMN) * COIN_STEP;
  return (
    <group
      position={position}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
      }}
      onPointerOut={() => setHover(false)}
    >
      {coins.map((c, i) => (
        <mesh key={i} geometry={coinGeo} material={coinMat} position={c.pos} rotation={c.rot} />
      ))}
      {(show || hover) && (
        <Html position={[0, height + 0.9 + lift, 0]} center distanceFactor={22} zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <div className={`coin-tag ${hover ? "is-hover" : ""}`}>{label}</div>
        </Html>
      )}
    </group>
  );
}

function IslandModel({ island, index, selected, arrived, onPick }: { island: Island; index: number; selected: boolean; arrived: boolean; onPick: (i: number) => void }) {
  const ringRef = useRef<THREE.Mesh>(null);
  const hillH = 4.2 + (index % 3) * 0.9;
  useFrame(({ clock }) => {
    if (ringRef.current) {
      const s = 1 + Math.sin(clock.elapsedTime * 2) * 0.03;
      ringRef.current.scale.set(s, s, s);
    }
  });

  // place each category's heap on the beach: the biggest at the front (facing the camera),
  // then fanning out left and right; past six heaps, a second row a little further back
  const heaps = useMemo(() => {
    return island.cats.map((c, k) => {
      const row = k < 6 ? 0 : 1;
      const j = row === 0 ? k : k - 6; // position within its row
      const slot = j === 0 ? 0 : j % 2 ? (j + 1) / 2 : -j / 2; // 0, +1, -1, +2, -2, ...
      const theta = 0.35 + slot * (row === 0 ? 0.42 : 0.36);
      const r = row === 0 ? R * 0.8 : R * 0.6;
      return { ...c, rank: k, pos: [Math.sin(theta) * r, 0.72, Math.cos(theta) * r] as [number, number, number] };
    });
  }, [island.cats]);

  return (
    <group position={island.pos} onClick={(e) => { e.stopPropagation(); onPick(index); }}>
      {/* sandy beach */}
      <mesh position={[0, 0.1, 0]} receiveShadow>
        <cylinderGeometry args={[R, R + 0.9, 1.25, 30]} />
        <meshStandardMaterial color="#e2c58c" roughness={1} flatShading />
      </mesh>
      {/* the hill */}
      <mesh position={[0, 0.7 + hillH / 2, -1.2]} rotation-y={index}>
        <coneGeometry args={[R * 0.58, hillH, 9]} />
        <meshStandardMaterial color="#6f9150" roughness={1} flatShading />
      </mesh>
      <mesh position={[2.4, 0.7 + 1.1, -3]} rotation-y={index * 2}>
        <coneGeometry args={[2.4, 2.2, 7]} />
        <meshStandardMaterial color="#5f7e42" roughness={1} flatShading />
      </mesh>
      {/* a few rocks and cypress trees */}
      {[[-5, -2.5], [4.6, -4.2], [-2.8, -5.4]].map(([x, z], i) => (
        <group key={i} position={[x, 0.7, z]}>
          <mesh position={[0, 1.2, 0]}>
            <coneGeometry args={[0.55, 2.6, 6]} />
            <meshStandardMaterial color="#2f4a2a" flatShading />
          </mesh>
        </group>
      ))}
      <mesh position={[-4.8, 0.95, 1.8]}>
        <dodecahedronGeometry args={[0.7]} />
        <meshStandardMaterial color="#6b6a66" flatShading />
      </mesh>
      {/* a small temple on the hilltop */}
      <group position={[0, 0.7 + hillH - 0.4, -1.2]} scale={0.55}>
        <mesh position={[0, 0.15, 0]}>
          <boxGeometry args={[2.4, 0.3, 1.6]} />
          <meshStandardMaterial color="#efe3c4" />
        </mesh>
        {[-0.9, -0.3, 0.3, 0.9].map((x) => (
          <mesh key={x} position={[x, 0.95, 0.55]}>
            <cylinderGeometry args={[0.12, 0.12, 1.3, 8]} />
            <meshStandardMaterial color="#efe3c4" />
          </mesh>
        ))}
        <mesh position={[0, 1.85, 0]} rotation-y={Math.PI / 4}>
          <coneGeometry args={[1.6, 0.6, 4]} />
          <meshStandardMaterial color="#d9a94a" metalness={0.5} roughness={0.5} />
        </mesh>
      </group>

      {/* the gold: one heap per category */}
      {heaps.map((h) => (
        <CoinHeap key={h.category} count={h.coins} position={h.pos} label={`${h.name} · ${usd(h.total)}`} show={selected && arrived && h.rank < 4} lift={h.rank % 2 ? 1.1 : 0} />
      ))}

      {/* glowing ring on the water around the chosen island */}
      {selected && (
        <mesh ref={ringRef} rotation-x={-Math.PI / 2} position={[0, 0.35, 0]}>
          <ringGeometry args={[R + 1.6, R + 2.1, 64]} />
          <meshBasicMaterial color="#f6d590" transparent opacity={0.55} side={THREE.DoubleSide} />
        </mesh>
      )}
      {selected && <pointLight position={[0, 5, 6]} color="#ffd08a" intensity={18} distance={22} />}

      {/* month name floating above */}
      <Html position={[0, 0.7 + hillH + 2.2, -1.2]} center distanceFactor={30} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
        <div className={`isle-tag ${selected ? "is-on" : ""}`}>{island.label}</div>
      </Html>
    </group>
  );
}

// ---------- the sailing + the third-person camera ----------

function Voyage({
  islands,
  target,
  onArrive,
  yawRef,
}: {
  islands: Island[];
  target: number;
  onArrive: (arrived: boolean) => void;
  yawRef: React.RefObject<number>;
}) {
  const shipRef = useRef<THREE.Group>(null);
  const speedRef = useRef(0);
  const { camera } = useThree();

  // where the ship is in its route: the last dock it reached, and the docks still ahead
  const state = useRef({
    reached: Math.max(0, target - 1),
    queue: [target] as number[],
    heading: 0,
    arrived: false,
    lookAt: new THREE.Vector3(),
    started: false,
  });

  // start one island before the current one, so it sails in on load
  useLayoutEffect(() => {
    const s = state.current;
    if (s.started || !shipRef.current) return;
    const start = islands[Math.max(0, target - 1)];
    shipRef.current.position.copy(start.dock);
    s.heading = target > 0 ? 0 : NORTH;
    shipRef.current.rotation.y = s.heading;
    camera.position.set(start.dock.x - 16, 8, start.dock.z + 4);
    s.lookAt.copy(start.dock);
    s.started = true;
  }, [islands, target, camera]);

  // a new destination: plan the way through the docks in between
  useEffect(() => {
    const s = state.current;
    const next = s.queue[0];
    const headingThatWay =
      next !== undefined &&
      next !== s.reached &&
      Math.sign(next - s.reached) === Math.sign(target - s.reached) &&
      Math.abs(target - s.reached) >= Math.abs(next - s.reached);
    // keep going if the new island is further along the same way; otherwise turn back via the last dock reached
    s.queue = headingThatWay ? range(next, target) : range(s.reached, target);
    s.arrived = false;
    onArrive(false);
  }, [target, onArrive]);

  const tmp = useMemo(() => ({ dir: new THREE.Vector3(), camGoal: new THREE.Vector3(), look: new THREE.Vector3() }), []);

  useFrame((_, rawDt) => {
    const ship = shipRef.current;
    if (!ship) return;
    const dt = Math.min(rawDt, 0.05);
    const s = state.current;
    const wp = s.queue[0];
    const goal = islands[wp]?.dock;
    let speed = 0;

    if (goal) {
      tmp.dir.subVectors(goal, ship.position).setY(0);
      const dist = tmp.dir.length();
      const isLast = s.queue.length === 1;
      if (dist < (isLast ? 0.15 : 2.2)) {
        s.reached = wp;
        if (isLast) {
          if (!s.arrived) {
            s.arrived = true;
            onArrive(true);
          }
        } else {
          s.queue.shift();
        }
      } else {
        const max = s.queue.length > 2 ? 24 : 13;
        speed = Math.min(max, (isLast ? dist * 1.4 : max) + 0.5);
        tmp.dir.normalize();
        ship.position.addScaledVector(tmp.dir, Math.min(dist, speed * dt));
        s.heading = turn(s.heading, yawFor(tmp.dir.x, tmp.dir.z), 1 - Math.exp(-dt * 4));
      }
    }
    // once docked, turn to face the island
    if (s.arrived) s.heading = turn(s.heading, NORTH, 1 - Math.exp(-dt * 2.5));
    ship.rotation.y = s.heading;
    speedRef.current += (speed - speedRef.current) * Math.min(1, dt * 3);

    // camera: while sailing, third-person behind the ship; once docked, a raised three-quarter view
    // of the island (with the ship in the corner). Dragging adds to the angle either way.
    const docked = s.arrived && islands[s.reached];
    if (docked) {
      const isle = islands[s.reached].pos;
      const ang = 0.5 + (yawRef.current ?? 0);
      tmp.camGoal.set(isle.x + Math.sin(ang) * 18, 10, isle.z + Math.cos(ang) * 18);
    } else {
      const yaw = s.heading + Math.PI + (yawRef.current ?? 0);
      tmp.camGoal.set(ship.position.x + Math.cos(yaw) * 17, 7.5, ship.position.z - Math.sin(yaw) * 17);
    }
    camera.position.lerp(tmp.camGoal, 1 - Math.exp(-dt * 2.2));
    // look a little ahead of the ship (or at the island once docked)
    if (docked) tmp.look.copy(islands[s.reached].pos).add(new THREE.Vector3(0, 1.2, 4));
    else tmp.look.set(ship.position.x + Math.cos(s.heading) * 8, 1.6, ship.position.z - Math.sin(s.heading) * 8);
    s.lookAt.lerp(tmp.look, 1 - Math.exp(-dt * 3));
    camera.lookAt(s.lookAt);
  });

  return <Ship shipRef={shipRef} speedRef={speedRef} />;
}

// ---------- the card ----------

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function Voyage3D({ monthCats, thisMonth }: { monthCats: MonthCategory[]; thisMonth: string }) {
  const { t, cat, ancient } = useLang();
  const [canDraw] = useState(webglAvailable);

  // Build the islands from the data
  const { islands, unit } = useMemo(() => {
    const keys = monthKeys(monthCats, thisMonth);
    const perMonth = keys.map((k) => {
      const cats = monthCats.filter((r) => r.month === k && r.total > 0).sort((a, b) => b.total - a.total);
      return { month: k, cats, total: cats.reduce((s, c) => s + c.total, 0) };
    });
    const unit = coinValue(Math.max(1, ...perMonth.map((m) => m.total)));
    const islands: Island[] = perMonth.map((m, i) => {
      const pos = new THREE.Vector3(i * 32, 0, Math.sin(i * 0.9) * 10);
      return {
        month: m.month,
        label: new Date(m.month + "-01T00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" }),
        total: m.total,
        cats: m.cats.map((c) => ({ category: c.category, name: cat(c.category), total: c.total, coins: Math.max(1, Math.round(c.total / unit)) })),
        pos,
        dock: new THREE.Vector3(pos.x, 0, pos.z + R + DOCK_GAP),
        radius: R,
      };
    });
    return { islands, unit };
  }, [monthCats, thisMonth, cat]);

  const [selected, setSelected] = useState<number | null>(null);
  const target = selected ?? islands.length - 1;
  const [arrived, setArrived] = useState(false);
  const yawRef = useRef(0);
  const drag = useRef<{ x: number; yaw: number } | null>(null);

  function go(i: number) {
    if (i < 0 || i >= islands.length) return;
    yawRef.current = 0;
    setSelected(i);
  }

  const island = islands[target];
  if (!islands.length) return null;

  return (
    <section className="card voyage3d">
      <div className="card-head">
        <h2>{t("voyTitle")}</h2>
        <span className="card-note">{t("voyNote")}</span>
      </div>

      <div
        className="voyage3d-stage"
        tabIndex={0}
        aria-label={t("voyHint")}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") { e.preventDefault(); go(target - 1); }
          if (e.key === "ArrowRight") { e.preventDefault(); go(target + 1); }
        }}
        onPointerDown={(e) => { drag.current = { x: e.clientX, yaw: yawRef.current }; }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          yawRef.current = Math.max(-1.6, Math.min(1.6, drag.current.yaw - (e.clientX - drag.current.x) * 0.006));
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerLeave={() => { drag.current = null; }}
      >
        {canDraw ? (
          <Canvas camera={{ fov: 50, near: 0.5, far: 1200 }} dpr={[1, 1.75]} gl={{ antialias: true }}>
            <color attach="background" args={["#0c1a33"]} />
            <fog attach="fog" args={["#132544", 80, 280]} />
            <hemisphereLight args={["#7d9ccf", "#1a2238", 2.2]} />
            <directionalLight position={MOON_DIR.clone().multiplyScalar(100)} color="#dfe7ff" intensity={3.2} />
            <directionalLight position={[60, 40, 80]} color="#ffd9a0" intensity={1.1} />
            <ambientLight intensity={0.55} />
            <Sky />
            <Sea centerX={islands[islands.length - 1].pos.x / 2} />
            {islands.map((isl, i) => (
              <IslandModel key={isl.month} island={isl} index={i} selected={i === target} arrived={arrived} onPick={go} />
            ))}
            <Voyage islands={islands} target={target} onArrive={setArrived} yawRef={yawRef} />
          </Canvas>
        ) : (
          <p className="voyage3d-nogl">{t("noWebgl")}</p>
        )}

        {/* what you're looking at */}
        <div className="voyage3d-hud">
          <span className="hud-month">
            {ancient && island.month === thisMonth ? "Ithaca · " : ""}
            {new Date(island.month + "-01T00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </span>
          <span className="hud-total">
            {arrived
              ? island.total > 0
                ? t("moonTotal", { a: usd(island.total) }) + (island.month === thisMonth ? t("soFar") : "")
                : t("nothingSpent")
              : t("sailingTo", { a: island.label })}
          </span>
          <span className="hud-legend">
            <i className="hud-coin" /> {t("coinLegend", { a: usd(unit) })}
          </span>
        </div>
        <p className="voyage3d-hint">{t("voyHint")}</p>
      </div>

      {/* pick a month: the ship sails there */}
      <div className="voyage3d-nav">
        <button className="icon-button nav-arrow" onClick={() => go(target - 1)} disabled={target <= 0} aria-label={t("prevMoon")}>
          ‹
        </button>
        <div className="moon-chips">
          {islands.map((isl, i) => (
            <button key={isl.month} className={`moon-chip ${i === target ? "is-on" : ""}`} onClick={() => go(i)}>
              <span>{isl.label.split(" ")[0]}</span>
              <small>{isl.total > 0 ? usd(isl.total) : "—"}</small>
            </button>
          ))}
        </div>
        <button className="icon-button nav-arrow" onClick={() => go(target + 1)} disabled={target >= islands.length - 1} aria-label={t("nextMoon")}>
          ›
        </button>
      </div>
    </section>
  );
}
