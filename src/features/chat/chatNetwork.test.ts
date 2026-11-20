import { describe, expect, it } from 'vitest';
import { createNetwork, nodePositions, ROW_POSITIONS, seededRandom } from './chatNetwork';

const WIDTH = 1440;
const HEIGHT = 800;

describe('chat background network', () => {
  it('is the same network every time (seeded, nothing random per frame)', () => {
    expect(createNetwork(WIDTH, HEIGHT)).toEqual(createNetwork(WIDTH, HEIGHT));
    const a = seededRandom(3);
    const b = seededRandom(3);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('covers the width and links only nodes that exist', () => {
    const network = createNetwork(WIDTH, HEIGHT);
    const positions = nodePositions(network, 0, new Float32Array(network.nodes.length * 2));
    const xs = network.nodes.map((_, i) => positions[i * 2]!);
    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.max(...xs)).toBeGreaterThan(WIDTH);
    for (const [a, b] of network.edges) {
      expect(network.nodes[a]).toBeDefined();
      expect(network.nodes[b]).toBeDefined();
      expect(a).not.toBe(b);
    }
    // One strand per inner row of the band.
    expect(network.strands).toHaveLength(ROW_POSITIONS.filter((v) => Math.abs(v) <= 1).length);
  });

  it('rises from lower left to upper right, and the swell keeps nodes near their place', () => {
    const network = createNetwork(WIDTH, HEIGHT);
    const centre = network.strands[Math.floor(network.strands.length / 2)]!;
    for (const time of [0, 3.7, 11]) {
      const positions = nodePositions(network, time, new Float32Array(network.nodes.length * 2));
      const first = positions[centre[1]! * 2 + 1]!;
      const last = positions[centre[centre.length - 2]! * 2 + 1]!;
      expect(first).toBeGreaterThan(last + HEIGHT * 0.15);
    }
    // Organised motion: between two moments no node moves more than a fraction of the spacing sideways.
    const before = nodePositions(network, 1, new Float32Array(network.nodes.length * 2));
    const after = nodePositions(network, 1.5, new Float32Array(network.nodes.length * 2));
    for (let i = 0; i < network.nodes.length; i++) {
      expect(Math.abs(after[i * 2]! - before[i * 2]!)).toBeLessThan(network.spacing * 0.2);
    }
  });
});
