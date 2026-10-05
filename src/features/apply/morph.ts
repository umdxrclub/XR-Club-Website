// The geometry of the funding page's step morph. As `f` runs 0 → 1 one wavy edge sweeps up the screen: the step
// being left keeps what is above it, the step arriving shows what is below it, and a thin band of background
// separates the two so lines of text never collide. Both edges share one wave, so the band stays even.

/** Half the band between the two edges, as a share of the screen height. */
export const BAND = .035;
/** The wave's amplitude at mid-sweep, as a share of the screen height. */
export const SWELL = .07;

/** Where the two edges sit (CSS px from the top) and how tall the wave is, at fraction `f` of a sweep over `height` px. */
export function morphEdges(f: number, height: number) {
  const gap = height * BAND;
  // Interpolating the ends keeps them exact: the leaving edge starts at the bottom and the arriving edge ends at the top.
  const leave = (1 - f) * height + f * -2 * gap, arrive = (1 - f) * (height + 2 * gap);
  return { leave, arrive, amplitude: height * SWELL * Math.sin(Math.PI * f) };
}

/** A clip-path for the part of a width × height box above (or below) a wavy edge. */
export function edgeClip(edge: number, amplitude: number, phase: number, width: number, height: number, above: boolean) {
  const wave = (x: number) => edge + amplitude * (Math.sin(x * Math.PI * 2.2 + phase) + .55 * Math.sin(x * Math.PI * 4.7 - phase * 1.3));
  let path = above ? `M0 -40H${width}V${wave(1).toFixed(1)}` : `M0 ${height + 40}H${width}V${wave(1).toFixed(1)}`;
  const points = 24;
  for (let i = points - 1; i >= 0; i--) { const x = i / points; path += `L${(x * width).toFixed(1)} ${wave(x).toFixed(1)}`; }
  return `path('${path}Z')`;
}
