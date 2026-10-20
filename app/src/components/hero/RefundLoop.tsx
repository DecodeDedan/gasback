import { useEffect, useRef } from 'react';

/**
 * The refund loop: one Gasback payment drawn as three money flows on a canvas.
 * Amber payment buyer → merchant, an amber gas thread buyer → Arc that burns at the network node,
 * and a green refund merchant → buyer underneath. Labels are HTML over the canvas so they stay crisp and readable.
 */

type Point = readonly [number, number];
type FlowName = 'pay' | 'gas' | 'refund';

interface Flow {
  from: Point;
  ctrl: Point;
  to: Point;
  color: string;
  width: number;
  perSecond: number;
  speed: number;
}

interface Particle {
  flow: FlowName;
  t: number;
  speed: number;
  size: number;
}

/** Node positions in unit space (x, y in 0..1 of the canvas box). */
const BUYER: Point = [0.12, 0.56];
const MERCHANT: Point = [0.88, 0.56];
const NETWORK: Point = [0.5, 0.1];

const FLOWS: Record<FlowName, Flow> = {
  pay: { from: BUYER, ctrl: [0.5, 0.3], to: MERCHANT, color: '245 181 61', width: 3, perSecond: 70, speed: 0.34 },
  gas: { from: BUYER, ctrl: [0.22, 0.12], to: NETWORK, color: '255 195 91', width: 2, perSecond: 22, speed: 0.42 },
  refund: { from: MERCHANT, ctrl: [0.5, 1.02], to: BUYER, color: '95 211 127', width: 2.6, perSecond: 26, speed: 0.3 },
};
const FLOW_NAMES = Object.keys(FLOWS) as FlowName[];

const PULSE_EVERY_S = 3.6;
const PULSE_PARTICLES = 14;
const MAX_PARTICLES = 900;
const MAX_DPR = 2;
const TRAIL = 0.035;
const STILL_PER_FLOW = 26;

function bezier(flow: Flow, t: number): Point {
  const u = 1 - t;
  return [
    u * u * flow.from[0] + 2 * u * t * flow.ctrl[0] + t * t * flow.to[0],
    u * u * flow.from[1] + 2 * u * t * flow.ctrl[1] + t * t * flow.to[1],
  ];
}

function spawn(flow: FlowName, isBurst: boolean, t = 0): Particle {
  const base = FLOWS[flow].speed;
  return {
    flow,
    t,
    speed: isBurst ? base * 1.9 : base * (0.7 + Math.random() * 0.6),
    size: isBurst ? 4 : 1.4 + Math.random() * 2,
  };
}

function drawScene(ctx: CanvasRenderingContext2D, w: number, h: number, particles: readonly Particle[], burn: number): void {
  ctx.clearRect(0, 0, w, h);
  const px = (p: Point): Point => [p[0] * w, p[1] * h];

  // Faint rails so a still frame (reduced motion) still explains the loop.
  for (const flow of Object.values(FLOWS)) {
    const [fx, fy] = px(flow.from);
    const [cx, cy] = px(flow.ctrl);
    const [tx, ty] = px(flow.to);
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.quadraticCurveTo(cx, cy, tx, ty);
    ctx.strokeStyle = `rgb(${flow.color} / 0.16)`;
    ctx.lineWidth = flow.width;
    ctx.stroke();
  }

  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const p of particles) {
    if (p.t <= 0) continue;
    const flow = FLOWS[p.flow];
    const [x0, y0] = px(bezier(flow, Math.max(0, p.t - TRAIL)));
    const [x1, y1] = px(bezier(flow, p.t));
    const fade = p.flow === 'gas' ? 1 - p.t * 0.6 : 1;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    // Two passes: a wide faint halo, then the bright core, so the streams glow without shadowBlur.
    ctx.strokeStyle = `rgb(${flow.color} / ${0.12 * fade})`;
    ctx.lineWidth = p.size * 4;
    ctx.stroke();
    ctx.strokeStyle = `rgb(${flow.color} / ${0.8 * fade})`;
    ctx.lineWidth = p.size;
    ctx.stroke();
  }

  // The network node flares as gas burns, then cools.
  const [nx, ny] = px(NETWORK);
  const glow = ctx.createRadialGradient(nx, ny, 0, nx, ny, 34 + burn * 30);
  glow.addColorStop(0, `rgb(255 195 91 / ${0.35 + burn * 0.5})`);
  glow.addColorStop(1, 'rgb(255 195 91 / 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(nx - 70, ny - 70, 140, 140);
  ctx.globalCompositeOperation = 'source-over';

  for (const [node, color] of [
    [BUYER, '238 235 229'],
    [MERCHANT, '238 235 229'],
    [NETWORK, '245 181 61'],
  ] as const) {
    const [x, y] = px(node);
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${color})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 15, 0, Math.PI * 2);
    ctx.strokeStyle = `rgb(${color} / 0.35)`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/** Particles spread along every flow, for the reduced-motion still frame. */
function stillParticles(): Particle[] {
  return FLOW_NAMES.flatMap((flow) =>
    Array.from({ length: STILL_PER_FLOW }, (_, i) => ({ flow, t: (i + 0.5) / STILL_PER_FLOW, speed: 0, size: 1.4 })),
  );
}

interface RefundLoopProps {
  /** Gas cost of one checkout at the live base fee, already formatted ("$0.001240"), or null while loading. */
  gasLabel: string | null;
  amountLabel: string;
  onPulse?: () => void;
}

export function RefundLoop({ gasLabel, amountLabel, onPulse }: RefundLoopProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onPulseRef = useRef(onPulse);

  useEffect(() => {
    onPulseRef.current = onPulse;
  }, [onPulse]);

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!box || !canvas || !ctx) return;

    const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0;
    let height = 0;
    // ponytail: particles are mutated in place inside the frame loop; copying ~900 objects per frame buys nothing.
    let particles: Particle[] = stillParticles().map((p) => spawn(p.flow, false, p.t));
    const carry: Record<FlowName, number> = { pay: 0, gas: 0, refund: 0 };
    let sincePulse = PULSE_EVERY_S - 0.8;
    let burn = 0;
    let frame = 0;
    let last = 0;
    let isVisible = true;

    function resize() {
      const rect = box!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      width = rect.width;
      height = rect.height;
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawScene(ctx!, width, height, isReduced ? stillParticles() : particles, isReduced ? 0.4 : burn);
    }

    function step(now: number) {
      const dt = Math.min((now - (last || now)) / 1000, 0.05);
      last = now;

      for (const name of FLOW_NAMES) {
        carry[name] += FLOWS[name].perSecond * dt;
        while (carry[name] >= 1 && particles.length < MAX_PARTICLES) {
          particles.push(spawn(name, false));
          carry[name] -= 1;
        }
      }

      sincePulse += dt;
      if (sincePulse >= PULSE_EVERY_S) {
        sincePulse = 0;
        for (const name of FLOW_NAMES) {
          for (let i = 0; i < PULSE_PARTICLES; i += 1) particles.push(spawn(name, true, -i * 0.012));
        }
        onPulseRef.current?.();
      }

      let burned = 0;
      particles = particles.filter((p) => {
        p.t += p.speed * dt;
        if (p.t < 1) return true;
        if (p.flow === 'gas') burned += 1;
        return false;
      });
      burn = Math.min(1, burn * Math.exp(-3 * dt) + burned * 0.08);

      drawScene(ctx!, width, height, particles, burn);
      frame = isVisible && !document.hidden ? requestAnimationFrame(step) : 0;
    }

    function start() {
      if (isReduced || frame) return;
      last = 0;
      frame = requestAnimationFrame(step);
    }

    function stop() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    }

    const resizer = new ResizeObserver(resize);
    resizer.observe(box);
    resize();

    // Pause off screen and in background tabs; the loop only costs frames while someone can see it.
    const visibility = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
      if (isVisible) start();
      else stop();
    });
    visibility.observe(box);
    const handleVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', handleVisibility);
    start();

    return () => {
      stop();
      resizer.disconnect();
      visibility.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const gas = gasLabel ?? '…';
  const label = 'absolute font-mono text-[11px] leading-tight tracking-wide uppercase whitespace-nowrap';

  return (
    <figure
      className="relative w-full m-0"
      aria-label={`The refund loop: the buyer pays ${amountLabel}, gas of ${gas} burns on Arc, and the merchant refunds ${gas} in the same transaction.`}
    >
      <div ref={boxRef} className="relative w-full aspect-[16/11]">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-hidden="true" />

        <div className={`${label} text-gas text-center`} style={{ left: '50%', top: '10%', transform: 'translate(-50%, -150%)' }}>
          Arc network
          <span className="block text-muted normal-case">gas burned {gas}</span>
        </div>
        <div className={`${label} text-ink`} style={{ left: 0, top: '56%', transform: 'translateY(-220%)' }}>
          Buyer
          <span className="block text-muted normal-case">pays {amountLabel}</span>
        </div>
        <div className={`${label} text-ink text-right`} style={{ right: 0, top: '56%', transform: 'translateY(-220%)' }}>
          Merchant
          <span className="block text-muted normal-case">gets {amountLabel}</span>
        </div>
        <div className={`${label} text-gas text-center`} style={{ left: '50%', top: '33%', transform: 'translate(-50%, -170%)' }}>
          payment {amountLabel}
        </div>
        <div className={`${label} text-refund text-center`} style={{ left: '50%', top: '80%', transform: 'translate(-50%, 0)' }}>
          refund +{gas} · same tx
        </div>
      </div>
    </figure>
  );
}
