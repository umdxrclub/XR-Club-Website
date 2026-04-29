import * as THREE from 'three';

export interface RevealOptions {
  totalGroups: number;
  initialRevealed: number;
  autoRotateSpeed?: number;
}

const LINE_COLOR = 0xf5efd5;

function lineMat(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color: LINE_COLOR,
    transparent: true,
    opacity: 0,
  });
}

function edgesFrom(geo: THREE.BufferGeometry, thresholdDeg = 12): THREE.BufferGeometry {
  const e = new THREE.EdgesGeometry(geo, thresholdDeg);
  geo.dispose();
  return e;
}

function ring(cx: number, cy: number, cz: number, rx: number, rz: number, segs = 32, axis: 'y' | 'z' = 'y'): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < segs; i++) {
    const a1 = (i / segs) * Math.PI * 2;
    const a2 = ((i + 1) / segs) * Math.PI * 2;
    if (axis === 'y') {
      pts.push(new THREE.Vector3(cx + Math.cos(a1) * rx, cy, cz + Math.sin(a1) * rz));
      pts.push(new THREE.Vector3(cx + Math.cos(a2) * rx, cy, cz + Math.sin(a2) * rz));
    } else {
      pts.push(new THREE.Vector3(cx + Math.cos(a1) * rx, cy + Math.sin(a1) * rz, cz));
      pts.push(new THREE.Vector3(cx + Math.cos(a2) * rx, cy + Math.sin(a2) * rz, cz));
    }
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

function shellArcAtZ(z: number, shellRX = 1.0, shellRZ = 1.15, shellRY = 0.45, segs = 18): THREE.BufferGeometry {
  // Half-arc across the top of an oblate ellipsoid at a fixed z.
  const k2 = 1 - (z / shellRZ) ** 2;
  if (k2 <= 0) return new THREE.BufferGeometry();
  const k = Math.sqrt(k2);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < segs; i++) {
    const t1 = i / segs;
    const t2 = (i + 1) / segs;
    const a1 = -Math.PI / 2 + t1 * Math.PI;
    const a2 = -Math.PI / 2 + t2 * Math.PI;
    pts.push(new THREE.Vector3(Math.sin(a1) * shellRX * k, Math.cos(a1) * shellRY * k, z));
    pts.push(new THREE.Vector3(Math.sin(a2) * shellRX * k, Math.cos(a2) * shellRY * k, z));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

function spineCurve(): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const segs = 24;
  const shellRZ = 1.15;
  const shellRY = 0.45;
  for (let i = 0; i < segs; i++) {
    const t1 = i / segs;
    const t2 = (i + 1) / segs;
    const z1 = -shellRZ + t1 * shellRZ * 2;
    const z2 = -shellRZ + t2 * shellRZ * 2;
    const y1 = shellRY * Math.sqrt(Math.max(0, 1 - (z1 / shellRZ) ** 2));
    const y2 = shellRY * Math.sqrt(Math.max(0, 1 - (z2 / shellRZ) ** 2));
    pts.push(new THREE.Vector3(0, y1, z1));
    pts.push(new THREE.Vector3(0, y2, z2));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

function buildLeg(x: number, z: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.13, 0.18, 0.42, 8, 1);
  g.translate(x, -0.32, z);
  return edgesFrom(g, 30);
}

function buildShellTop(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1.0, 0.45, 1.15);
  return edgesFrom(g, 14);
}

function buildPlastron(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(0.92, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  g.scale(1.0, 0.18, 1.1);
  g.translate(0, -0.05, 0);
  return edgesFrom(g, 14);
}

function buildTail(): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(0.12, 0.32, 8);
  g.rotateX(-Math.PI / 2);
  g.translate(0, -0.05, -1.32);
  return edgesFrom(g, 18);
}

function buildNeck(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.18, 0.22, 0.4, 10, 1);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0.0, 1.25);
  return edgesFrom(g, 22);
}

function buildHead(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(0.28, 12, 8);
  g.scale(0.95, 0.95, 1.1);
  g.translate(0, 0.05, 1.55);
  return edgesFrom(g, 16);
}

function buildSnout(): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(0.13, 0.18, 8);
  g.rotateX(Math.PI / 2);
  g.translate(0, -0.02, 1.82);
  return edgesFrom(g, 18);
}

function buildEye(side: -1 | 1): THREE.BufferGeometry {
  return ring(side * 0.13, 0.15, 1.68, 0.05, 0.05, 14, 'z');
}

interface PartDef {
  name: string;
  geom: () => THREE.BufferGeometry;
}

const PARTS: PartDef[] = [
  { name: 'shell rim',          geom: () => ring(0, 0, 0, 1.0, 1.15, 36, 'y') },
  { name: 'carapace',           geom: () => buildShellTop() },
  { name: 'plastron rim',       geom: () => ring(0, -0.1, 0, 0.92, 1.05, 32, 'y') },
  { name: 'plastron',           geom: () => buildPlastron() },
  { name: 'spine',              geom: () => spineCurve() },
  { name: 'front scute',        geom: () => shellArcAtZ(0.65) },
  { name: 'middle scute',       geom: () => shellArcAtZ(0.0) },
  { name: 'rear scute',         geom: () => shellArcAtZ(-0.65) },
  { name: 'front-left leg',     geom: () => buildLeg(-0.72,  0.7) },
  { name: 'front-right leg',    geom: () => buildLeg( 0.72,  0.7) },
  { name: 'rear-left leg',      geom: () => buildLeg(-0.72, -0.7) },
  { name: 'rear-right leg',     geom: () => buildLeg( 0.72, -0.7) },
  { name: 'tail',               geom: () => buildTail() },
  { name: 'neck',               geom: () => buildNeck() },
  { name: 'head',               geom: () => buildHead() },
  { name: 'snout',              geom: () => buildSnout() },
  { name: 'left eye',           geom: () => buildEye(-1) },
  { name: 'right eye',          geom: () => buildEye( 1) },
];

export class RevealScene {
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private root = new THREE.Group();
  private parts: THREE.LineSegments[] = [];
  private materials: THREE.LineBasicMaterial[] = [];
  private targetOpacity: number[];
  private liveOpacity: number[];
  private rotX = -0.35;
  private rotY = -0.55;
  private velX = 0;
  private velY = 0;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private isDragging = false;
  private autoRotateSpeed: number;
  private lastTime = 0;
  private rafId = 0;
  private resizeObserver: ResizeObserver | null = null;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, opts: RevealOptions) {
    this.canvas = canvas;
    this.autoRotateSpeed = opts.autoRotateSpeed ?? 0.18;

    const total = PARTS.length;
    this.targetOpacity = new Array(total).fill(0);
    this.liveOpacity = new Array(total).fill(0);
    const initial = Math.min(opts.initialRevealed, total);
    for (let i = 0; i < initial; i++) {
      this.targetOpacity[i] = 0.85;
      this.liveOpacity[i] = 0.85;
    }

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    this.camera.position.set(0, 0.4, 5.4);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));

    this.scene.add(this.root);
    this.buildModel();
    this.bindPointer();
    this.bindResize();
    this.handleResize();

    this.lastTime = performance.now();
    this.tick = this.tick.bind(this);
    this.rafId = requestAnimationFrame(this.tick);
  }

  private buildModel(): void {
    for (let i = 0; i < PARTS.length; i++) {
      const geo = PARTS[i].geom();
      const mat = lineMat();
      mat.opacity = this.liveOpacity[i];
      const seg = new THREE.LineSegments(geo, mat);
      this.root.add(seg);
      this.parts.push(seg);
      this.materials.push(mat);
    }
  }

  setRevealed(count: number): void {
    const clamped = Math.max(0, Math.min(count, this.materials.length));
    for (let i = 0; i < this.targetOpacity.length; i++) {
      this.targetOpacity[i] = i < clamped ? 0.85 : 0;
    }
  }

  private bindPointer(): void {
    const onDown = (e: PointerEvent) => {
      this.isDragging = true;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.velY = dx * 0.005;
      this.velX = dy * 0.005;
      this.rotY += this.velY;
      this.rotX += this.velX;
    };
    const onUp = (e: PointerEvent) => {
      this.isDragging = false;
      try { this.canvas.releasePointerCapture(e.pointerId); } catch {}
    };
    this.canvas.addEventListener('pointerdown', onDown);
    this.canvas.addEventListener('pointermove', onMove);
    this.canvas.addEventListener('pointerup', onUp);
    this.canvas.addEventListener('pointercancel', onUp);
    this.canvas.addEventListener('pointerleave', onUp);
  }

  private bindResize(): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.canvas);
  }

  private handleResize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private tick(now: number): void {
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    if (!this.isDragging) {
      this.velX *= 0.92;
      this.velY *= 0.92;
      this.rotY += this.autoRotateSpeed * dt + this.velY;
      this.rotX += this.velX;
    }
    this.rotX = Math.max(-1.2, Math.min(1.2, this.rotX));
    this.root.rotation.x = this.rotX;
    this.root.rotation.y = this.rotY;

    for (let i = 0; i < this.materials.length; i++) {
      const target = this.targetOpacity[i];
      const live = this.liveOpacity[i];
      const next = live + (target - live) * Math.min(1, dt * 3);
      this.liveOpacity[i] = next;
      this.materials[i].opacity = next;
    }

    this.renderer.render(this.scene, this.camera);
    this.rafId = requestAnimationFrame(this.tick);
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.resizeObserver?.disconnect();
    this.materials.forEach((m) => m.dispose());
    this.parts.forEach((p) => p.geometry.dispose());
    this.renderer.dispose();
  }
}
