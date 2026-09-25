// The supplied Black and White preset for Wallpaper Engine's Angled Waves.
// Keep all seven grayscale values; the orange underlayer is an extra accent.
export const waveSpeed = 0.6;
export const waveFrequency = 20 / (4200 / 2160);
export const waveAccent = { layer: 3, minWidth: 0.014, maxWidth: 0.032 } as const;
// Color stops for the moving accent.
export const waveAccentSpectrum = ['#ff6b6b', '#ffa500', '#ffd93d', '#6bff6b', '#6bcdff', '#b46bff', '#ff6b6b'] as const;
export const waveLayers = [
  { color: '#121212', boundary: -0.76, phase: 0 },
  { color: '#191919', boundary: -0.5, phase: 0.48 },
  { color: '#333333', boundary: -0.245, phase: 0.96 },
  { color: '#F47A3C', boundary: 0.035, phase: 1.44 },
  { color: '#555555', boundary: 0.035, phase: 1.44 },
  { color: '#979797', boundary: 0.3, phase: 1.92 },
  { color: '#A9A9A9', boundary: 0.565, phase: 2.4 },
  { color: '#C9C9C9', boundary: 0.83, phase: 2.88 },
] as const;

// Match the shader's first frame in the server-rendered SVG. This also provides
// the still version for reduced motion, disabled JavaScript, and unavailable 3D.
export function wavePath(boundary: number, phase: number, isAccent = false) {
  const point = (s: number) => {
    const angle = s * waveFrequency + phase;
    const bend = Math.sin(angle);
    let q = boundary + 0.055 * bend
      + 0.014 * Math.sin(s * 4.2 + phase * 0.7);
    const derivative = 0.055 * waveFrequency * Math.cos(s * waveFrequency + phase)
      + 0.014 * 4.2 * Math.cos(s * 4.2 + phase * 0.7);
    let along = s, alongDerivative = 1, qDerivative = derivative;
    if (isAccent) {
      // Offset perpendicular to the curve: a constant diagonal displacement
      // would still make the visible strip narrower on steep sections.
      const normalLength = Math.sqrt(1 + derivative * derivative);
      const secondDerivative = -0.055 * waveFrequency ** 2 * bend
        - 0.014 * 4.2 ** 2 * Math.sin(s * 4.2 + phase * 0.7);
      // Restore the reveal at the bends, with a moderate minimum width and
      // a smooth taper instead of the original sharp, nearly closed seams.
      const range = waveAccent.maxWidth - waveAccent.minWidth;
      const width = waveAccent.minWidth + range * bend ** 2;
      const widthDerivative = 2 * range * waveFrequency * bend * Math.cos(angle);
      along += width * derivative / normalLength;
      q -= width / normalLength;
      const tangentScale = 1 + width * secondDerivative / normalLength ** 3;
      alongDerivative = tangentScale + widthDerivative * derivative / normalLength;
      qDerivative = derivative * tangentScale - widthDerivative / normalLength;
    }
    const unit = Math.SQRT1_2 * 900;
    return { x: 800 + (q + along) * unit, y: 450 + (q - along) * unit,
      dx: (qDerivative + alongDerivative) * unit, dy: (qDerivative - alongDerivative) * unit };
  };
  const n = (value: number) => value.toFixed(2);
  let previous = point(-2);
  let path = `M${n(previous.x)} ${n(previous.y)}`;
  const step = 0.05;
  for (let i = 1; i <= 80; i++) {
    const next = point(-2 + i * step);
    path += `C${n(previous.x + previous.dx * step / 3)} ${n(previous.y + previous.dy * step / 3)} `
      + `${n(next.x - next.dx * step / 3)} ${n(next.y - next.dy * step / 3)} ${n(next.x)} ${n(next.y)}`;
    previous = next;
  }
  return path + 'L4200 450L800 3850Z';
}
