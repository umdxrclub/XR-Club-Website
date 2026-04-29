import jsQR from 'jsqr';

export interface ScannerHandlers {
  onDetect: (text: string) => void;
  onError: (err: Error) => void;
}

export class DemoDayScanner {
  private videoEl: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private stream: MediaStream | null = null;
  private rafId = 0;
  private stopped = false;
  private handlers: ScannerHandlers;
  private fired = false;

  constructor(videoEl: HTMLVideoElement, handlers: ScannerHandlers) {
    this.videoEl = videoEl;
    this.handlers = handlers;
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D context unavailable.');
    this.ctx = ctx;
  }

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.handlers.onError(new Error('Camera not available in this browser.'));
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      this.videoEl.srcObject = this.stream;
      this.videoEl.setAttribute('playsinline', 'true');
      this.videoEl.muted = true;
      await this.videoEl.play();
      this.tick();
    } catch (e) {
      this.handlers.onError(e as Error);
    }
  }

  private tick = (): void => {
    if (this.stopped) return;
    if (this.videoEl.readyState >= 2 && !this.fired) {
      const w = this.videoEl.videoWidth;
      const h = this.videoEl.videoHeight;
      if (w > 0 && h > 0) {
        const scale = Math.min(1, 640 / Math.max(w, h));
        const cw = Math.max(1, Math.floor(w * scale));
        const ch = Math.max(1, Math.floor(h * scale));
        if (this.canvas.width !== cw || this.canvas.height !== ch) {
          this.canvas.width = cw;
          this.canvas.height = ch;
        }
        this.ctx.drawImage(this.videoEl, 0, 0, cw, ch);
        const imageData = this.ctx.getImageData(0, 0, cw, ch);
        const result = jsQR(imageData.data, cw, ch, { inversionAttempts: 'attemptBoth' });
        if (result && result.data) {
          this.fired = true;
          this.handlers.onDetect(result.data);
          return;
        }
      }
    }
    this.rafId = requestAnimationFrame(this.tick);
  };

  stop(): void {
    this.stopped = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.videoEl.srcObject = null;
  }
}

export function extractTokenFromQR(text: string): string | null {
  if (!text) return null;
  try {
    const url = new URL(text);
    const s = url.searchParams.get('s');
    if (s) return s;
  } catch {
    /* not a URL */
  }
  // Allow bare tokens too, in case someone encodes just the token.
  const trimmed = text.trim();
  if (/^[a-zA-Z0-9-]{4,32}$/.test(trimmed)) return trimmed;
  return null;
}
