/**
 * Geometry of the chat background: a glowing network that flows diagonally, lower left to upper right.
 *
 * Organised motion: the structure is a fixed lattice (columns along the band, rows across it), and every
 * per-node irregularity comes from a seeded random generator, so nothing is random from frame to frame.
 * The only motion is one slow swell travelling left → right through the columns (and a slow sway of the
 * band's spine), so the whole network breathes like a single wave instead of jittering.
 */

/** Row positions across the band (-1 … 1 is the band; beyond it, sparse outer nodes like the reference). */
export const ROW_POSITIONS = [-2.1, -1.45, -1, -0.66, -0.33, 0, 0.33, 0.66, 1, 1.45, 2.1] as const;
const OUTER_PRESENCE = 0.42;

export interface NetworkNode {
  column: number;
  row: number;
  /** Position across the band (ROW_POSITIONS). */
  v: number;
  /** Fixed, seeded irregularity (fractions of the spacing / row gap). */
  jx: number;
  jy: number;
  /** Outer nodes (beyond the band) are drawn fainter. */
  outer: boolean;
}

export interface Network {
  width: number;
  height: number;
  spacing: number;
  columns: number;
  nodes: NetworkNode[];
  /** Pairs of node indexes. */
  edges: [number, number][];
  /** Node indexes of each strand (the inner rows), left to right. */
  strands: number[][];
  /** Static circuit traces: polylines in canvas pixels. */
  traces: { points: [number, number][] }[];
}

/** Small, fast, seeded PRNG (mulberry32): the same seed always gives the same network. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The band's centre line: low on the left, high on the right, swaying slowly with time (seconds). */
export function spineY(x: number, width: number, height: number, time: number): number {
  const u = width > 0 ? x / width : 0;
  return height * (0.64 - 0.3 * u) + height * 0.05 * Math.sin(u * Math.PI * 1.6 + 0.4 + time * 0.15);
}

/** Half the band's thickness at x (it widens and narrows along the band, like the reference). */
export function bandHalf(x: number, width: number, height: number): number {
  const u = width > 0 ? x / width : 0;
  return height * (0.13 + 0.045 * Math.sin(u * Math.PI * 2.2 + 1.1));
}

export function createNetwork(width: number, height: number, seed = 7): Network {
  const random = seededRandom(seed);
  const spacing = Math.min(Math.max(width / 22, 48), 90);
  // One spare column on each side so the band never ends inside the screen.
  const columns = Math.ceil(width / spacing) + 3;
  const nodes: NetworkNode[] = [];
  const index = new Map<string, number>();
  for (let column = 0; column < columns; column++) {
    ROW_POSITIONS.forEach((v, row) => {
      const outer = Math.abs(v) > 1;
      const jx = (random() - 0.5) * 0.7;
      const jy = (random() - 0.5) * 0.7;
      if (outer && random() > OUTER_PRESENCE) return;
      index.set(`${column}:${row}`, nodes.length);
      nodes.push({ column, row, v, jx, jy, outer });
    });
  }
  const at = (column: number, row: number) => index.get(`${column}:${row}`);
  const edges: [number, number][] = [];
  const link = (a: number | undefined, b: number | undefined) => {
    if (a !== undefined && b !== undefined) edges.push([a, b]);
  };
  for (const [i, node] of nodes.entries()) {
    const { column, row } = node;
    link(i, at(column + 1, row));
    if (random() > 0.3) link(i, at(column + 1, row + 1));
    if (random() > 0.55) link(i, at(column + 1, row - 1));
    if (random() > 0.62) link(i, at(column, row + 1));
    // A few long links make the large, sparse triangles of the outer network.
    if (node.outer && random() > 0.5) link(i, at(column + 2, row + (node.v < 0 ? 1 : -1)));
  }
  const strands: number[][] = [];
  ROW_POSITIONS.forEach((v, row) => {
    if (Math.abs(v) > 1) return;
    const strand: number[] = [];
    for (let column = 0; column < columns; column++) {
      const i = at(column, row);
      if (i !== undefined) strand.push(i);
    }
    strands.push(strand);
  });
  // Circuit traces: short right-angled runs beside the middle of the band; they do not move.
  const traces: Network['traces'] = [];
  for (let k = 0; k < 12; k++) {
    const x = width * (0.34 + random() * 0.46);
    const side = random() > 0.5 ? 1 : -1;
    const y = spineY(x, width, height, 0) + side * bandHalf(x, width, height) * (1.15 + random() * 0.5);
    const run = (40 + random() * 110) * (random() > 0.5 ? 1 : -1);
    const step = (16 + random() * 44) * -side;
    const tail = (24 + random() * 90) * Math.sign(run);
    traces.push({
      points: [
        [x, y],
        [x + run, y],
        [x + run, y + step],
        [x + run + tail, y + step],
      ],
    });
  }
  return { width, height, spacing, columns, nodes, edges, strands, traces };
}

/** Every node's position at ``time`` (seconds), written into ``out`` as x0, y0, x1, y1, … */
export function nodePositions(network: Network, time: number, out: Float32Array): Float32Array {
  const { width, height, spacing } = network;
  const rowGap = (height * 0.13) / 3;
  for (const [i, node] of network.nodes.entries()) {
    // The swell: one wave travelling left → right through the columns (no per-frame randomness).
    const phase = time * 0.9 - node.column * 0.42 + node.row * 0.35;
    const x = (node.column - 1 + node.jx) * spacing + Math.cos(phase) * spacing * 0.06;
    const y = spineY(x, width, height, time) + node.v * bandHalf(x, width, height) + node.jy * rowGap + Math.sin(phase) * rowGap * 0.45;
    out[i * 2] = x;
    out[i * 2 + 1] = y;
  }
  return out;
}
