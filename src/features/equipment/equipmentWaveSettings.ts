import { waveFrequency, waveSpeed } from '../home/waveSettings';

export const equipmentWaveBase = '#ebe8e0';
export const equipmentWaveSpeed = waveSpeed * .10;
export const equipmentWaveFrequency = waveFrequency * .25;
export const equipmentWaveLayers = [
  { color: '#f4f2ed', boundary: -.36, phase: -.60 },
  { color: '#e9e6de', boundary: .30, phase: 1.15 },
  { color: '#f2efe9', boundary: .52, phase: 1.35 },
] as const;

// Match the shader's first frame for the SVG / reduced-motion fallback.
export function equipmentWavePath(boundary: number, phase: number) {
  const nx = .16, ny = .9871170143;
  const point = (s: number) => {
    const angle = s * 1.55 + phase * .4;
    const q = boundary + .16 * Math.sin(angle)
      + .018 * Math.sin(s * equipmentWaveFrequency + phase * .5);
    const derivative = .16 * 1.55 * Math.cos(angle)
      + .018 * equipmentWaveFrequency * Math.cos(s * equipmentWaveFrequency + phase * .5);
    return {
      x: 800 + (nx * q - ny * s) * 1000,
      y: 500 + (ny * q + nx * s) * 1000,
      dx: (nx * derivative - ny) * 1000,
      dy: (ny * derivative + nx) * 1000,
    };
  };
  const n = (value: number) => value.toFixed(2);
  let previous = point(-2.5), path = `M${n(previous.x)} ${n(previous.y)}`;
  const step = .05;
  for (let i = 1; i <= 100; i++) {
    const next = point(-2.5 + i * step);
    path += `C${n(previous.x + previous.dx * step / 3)} ${n(previous.y + previous.dy * step / 3)} `
      + `${n(next.x - next.dx * step / 3)} ${n(next.y - next.dy * step / 3)} ${n(next.x)} ${n(next.y)}`;
    previous = next;
  }
  return path + 'L-6000 6000L6000 6000Z';
}
