let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const C = (window as Window & typeof globalThis).AudioContext ||
              (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

const A4 = 440;
const SEMITONE = Math.pow(2, 1 / 12);

function tone(freq: number, dur: number, peak: number, attack = 0.008, type: OscillatorType = 'sine'): void {
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peak, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(now);
  osc.stop(now + dur + 0.05);
}

export function playScanChime(stepIndex: number): void {
  const root = A4 * Math.pow(SEMITONE, stepIndex - 4);
  tone(root, 0.85, 0.18);
  setTimeout(() => tone(root * 2, 0.55, 0.06), 35);
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.([8, 16, 8]);
}

export function playFinishChord(): void {
  const c = getCtx();
  if (!c) return;
  const root = A4;
  tone(root, 1.6, 0.16);
  tone(root * Math.pow(SEMITONE, 4), 1.6, 0.12);
  tone(root * Math.pow(SEMITONE, 7), 1.6, 0.1);
  tone(root * 2, 1.8, 0.08);
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.([20, 30, 20, 30, 60]);
}

export function playWrongTone(): void {
  tone(160, 0.35, 0.16);
  setTimeout(() => tone(120, 0.3, 0.12), 40);
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.([60]);
}

export function playSoftTap(): void {
  tone(660, 0.18, 0.1);
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(15);
}

export function primeAudio(): void {
  getCtx();
}
