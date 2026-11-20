import { useEffect, useRef } from 'react';
import { createNetwork, nodePositions, type Network } from './chatNetwork';

/** Matches the opacity transition in global.css (.chat-background--dimmed). */
const DIM_FADE_MS = 800;
/** Light pulses travelling along the strands, evenly spaced in time. */
const PULSES = 6;
/** Mesh lines are batched into this many brightness levels (one stroke per level per frame). */
const ALPHA_LEVELS = 6;

interface Palette {
  bg: string;
  line: string;
  strand: string;
  node: string;
  glow: string;
  /** Additive blending ('lighter'). Off in both themes: it costs several times more to draw for little
   *  visible difference on a dark background (measured without a GPU: 21 frames per second additive, 45 without). */
  additive: boolean;
  strength: number;
}

const DARK: Palette = { bg: '#091321', line: '56, 189, 248', strand: '96, 165, 250', node: '207, 238, 255', glow: '56, 189, 248', additive: false, strength: 1 };
const LIGHT: Palette = { bg: '#f5f8fc', line: '37, 99, 235', strand: '59, 130, 246', node: '29, 78, 216', glow: '59, 130, 246', additive: false, strength: 0.7 };

/** A soft round glow, drawn once per colour and reused for every node and pulse. */
function glowSprite(color: string): HTMLCanvasElement {
  const size = 64;
  const sprite = document.createElement('canvas');
  sprite.width = size;
  sprite.height = size;
  const context = sprite.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, `rgba(${color}, 0.9)`);
    gradient.addColorStop(0.25, `rgba(${color}, 0.35)`);
    gradient.addColorStop(1, `rgba(${color}, 0)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  return sprite;
}

/**
 * The animated network behind the chat: glowing nodes joined by fine lines, flowing from lower left to
 * upper right (geometry in chatNetwork.ts). Organised motion: one slow swell travels through the lattice,
 * nodes shimmer in a travelling sequence and light pulses run along the strands at even intervals.
 *
 * ``dimmed`` (a conversation is on screen) fades it to a faint trace so questions and replies read clearly,
 * then pauses the animation: no motion behind the text, no CPU spent.
 */
export function ChatBackground({ dimmed = false }: { dimmed?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** When the animation should stop (the fade has finished); 0 while the network is shown in full. */
  const pauseAtRef = useRef(0);
  /** Restarts a stopped animation loop (provided by the drawing effect). */
  const resumeRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    pauseAtRef.current = dimmed ? performance.now() + DIM_FADE_MS : 0;
    if (!dimmed) resumeRef.current();
  }, [dimmed]);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const ctxEl = canvasEl.getContext('2d');
    if (!ctxEl) return;
    const canvas = canvasEl;
    const ctx = ctxEl;

    let animationId = 0;
    let running = false;
    let width = 0;
    let height = 0;
    /** Seconds of animation shown so far (advances with the real clock, so 60 Hz and 120 Hz look the same). */
    let time = 0;
    let lastFrame = 0;
    let network: Network = createNetwork(0, 0);
    let positions = new Float32Array(0);
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduceMotion = motionPreference.matches;
    const sprites = new Map<string, HTMLCanvasElement>();
    const sprite = (color: string) => {
      let found = sprites.get(color);
      if (!found) sprites.set(color, (found = glowSprite(color)));
      return found;
    };

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      network = createNetwork(width, height);
      positions = new Float32Array(network.nodes.length * 2);
      if (reduceMotion || !running) render();
    }

    const x = (i: number) => positions[i * 2] ?? 0;
    const y = (i: number) => positions[i * 2 + 1] ?? 0;

    /** A smooth line through the given nodes (quadratic curves through the midpoints). */
    function strandPath(strand: number[], offset: number): Path2D {
      const path = new Path2D();
      if (strand.length < 2) return path;
      path.moveTo(x(strand[0]!), y(strand[0]!) + offset);
      for (let k = 1; k < strand.length - 1; k++) {
        const a = strand[k]!;
        const b = strand[k + 1]!;
        path.quadraticCurveTo(x(a), y(a) + offset, (x(a) + x(b)) / 2, (y(a) + y(b)) / 2 + offset);
      }
      const last = strand[strand.length - 1]!;
      path.lineTo(x(last), y(last) + offset);
      return path;
    }

    function render() {
      const palette = document.documentElement.classList.contains('dark') ? DARK : LIGHT;
      const strength = palette.strength;
      nodePositions(network, time, positions);
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = palette.additive ? 'lighter' : 'source-over';
      ctx.lineCap = 'round';

      // Strands: the flowing lines of the band, each with two faint fibres beside it.
      const fibre = height * 0.012;
      for (const strand of network.strands) {
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = `rgba(${palette.strand}, ${0.42 * strength})`;
        ctx.stroke(strandPath(strand, 0));
        ctx.lineWidth = 0.6;
        ctx.strokeStyle = `rgba(${palette.strand}, ${0.16 * strength})`;
        ctx.stroke(strandPath(strand, fibre));
        ctx.stroke(strandPath(strand, -fibre));
      }

      // Mesh: shorter links are brighter; links of outer nodes are fainter. Batched by brightness.
      const levels = Array.from({ length: ALPHA_LEVELS }, () => new Path2D());
      const reach = network.spacing * 2.6;
      for (const [a, b] of network.edges) {
        const length = Math.hypot(x(b) - x(a), y(b) - y(a));
        const outer = network.nodes[a]!.outer || network.nodes[b]!.outer;
        const brightness = Math.max(0, 1 - length / reach) * (outer ? 0.55 : 1);
        if (brightness <= 0.02) continue;
        const level = Math.min(ALPHA_LEVELS - 1, Math.floor(brightness * ALPHA_LEVELS));
        levels[level]!.moveTo(x(a), y(a));
        levels[level]!.lineTo(x(b), y(b));
      }
      ctx.lineWidth = 0.8;
      levels.forEach((path, level) => {
        ctx.strokeStyle = `rgba(${palette.line}, ${((level + 1) / ALPHA_LEVELS) * 0.45 * strength})`;
        ctx.stroke(path);
      });

      // Circuit traces: still, faint, with a small pad at the end.
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = `rgba(${palette.line}, ${0.14 * strength})`;
      ctx.fillStyle = `rgba(${palette.line}, ${0.3 * strength})`;
      for (const trace of network.traces) {
        ctx.beginPath();
        trace.points.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.stroke();
        const [ex, ey] = trace.points[trace.points.length - 1]!;
        ctx.fillRect(ex - 1, ey - 1, 2, 2);
      }

      // Nodes: a glow and a bright core; the shimmer travels along the band in sequence.
      const glow = sprite(palette.glow);
      ctx.fillStyle = `rgb(${palette.node})`;
      for (const [i, node] of network.nodes.entries()) {
        const shimmer = 0.55 + 0.45 * Math.sin(time * 1.3 - node.column * 0.8 + node.row * 1.7);
        const radius = node.outer ? 7 : 10;
        ctx.globalAlpha = shimmer * (node.outer ? 0.45 : 0.85) * strength;
        ctx.drawImage(glow, x(i) - radius, y(i) - radius, radius * 2, radius * 2);
        ctx.globalAlpha = (node.outer ? 0.55 : 0.95) * strength;
        ctx.fillRect(x(i) - 1.1, y(i) - 1.1, 2.2, 2.2);
      }

      // Pulses: evenly spaced lights running left → right along the strands, each with a short tail.
      const strands = network.strands;
      if (strands.length && !reduceMotion) {
        for (let k = 0; k < PULSES; k++) {
          const strand = strands[(k * 3) % strands.length]!;
          if (strand.length < 2) continue;
          const progress = (time * 0.06 + k / PULSES) % 1;
          for (let tail = 0; tail < 4; tail++) {
            const along = progress * (strand.length - 1) - tail * 0.18;
            if (along < 0) continue;
            const left = Math.floor(along);
            const right = Math.min(left + 1, strand.length - 1);
            const f = along - left;
            const px = x(strand[left]!) * (1 - f) + x(strand[right]!) * f;
            const py = y(strand[left]!) * (1 - f) + y(strand[right]!) * f;
            const radius = 16 - tail * 3;
            ctx.globalAlpha = (0.9 - tail * 0.22) * strength;
            ctx.drawImage(glow, px - radius, py - radius, radius * 2, radius * 2);
          }
        }
      }
      ctx.globalAlpha = 1;

      // Soft fade at the top and bottom edges.
      ctx.globalCompositeOperation = 'source-over';
      const fade = ctx.createLinearGradient(0, 0, 0, height);
      fade.addColorStop(0, `${palette.bg}d0`);
      fade.addColorStop(0.16, `${palette.bg}00`);
      fade.addColorStop(0.84, `${palette.bg}00`);
      fade.addColorStop(1, `${palette.bg}c0`);
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, width, height);
    }

    function frame(now: number) {
      // At most 50 ms per frame: after a background tab or a pause the network continues, it does not jump.
      time += lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 0;
      lastFrame = now;
      render();
      // Dimmed behind a conversation: stop once the fade is over, on its faint last frame.
      const pauseAt = pauseAtRef.current;
      if (pauseAt && performance.now() >= pauseAt) {
        running = false;
        lastFrame = 0;
        return;
      }
      animationId = requestAnimationFrame(frame);
    }

    function start() {
      if (running || reduceMotion) return;
      running = true;
      lastFrame = 0;
      animationId = requestAnimationFrame(frame);
    }

    resumeRef.current = start;

    function handleMotionPreferenceChange(event: MediaQueryListEvent) {
      reduceMotion = event.matches;
      cancelAnimationFrame(animationId);
      running = false;
      if (reduceMotion) render();
      else start();
    }

    resize();
    render();
    // Opened on an existing conversation, the loop runs through the fade and then stops by itself.
    start();

    window.addEventListener('resize', resize);
    motionPreference.addEventListener('change', handleMotionPreferenceChange);
    // A theme change redraws a still frame (reduced motion, or paused behind a conversation) in the new colours.
    const observer = new MutationObserver(() => {
      if (reduceMotion || !running) render();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      resumeRef.current = () => undefined;
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
      motionPreference.removeEventListener('change', handleMotionPreferenceChange);
      observer.disconnect();
    };
  }, []);

  return (
    <div className={`chat-background${dimmed ? ' chat-background--dimmed' : ''}`} data-testid="chat-background" data-dimmed={dimmed || undefined}>
      <canvas ref={canvasRef} />
    </div>
  );
}
