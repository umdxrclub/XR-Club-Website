import * as THREE from 'three';

export interface RevealOptions {
  totalGroups: number;
  initialRevealed: number;
  autoRotateSpeed?: number;
}

export class RevealScene {
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private root = new THREE.Group();
  private groups: THREE.Group[] = [];
  private materials: THREE.LineBasicMaterial[] = [];
  private revealed: number;
  private targetRevealed: number;
  private targetOpacity: number[];
  private liveOpacity: number[];
  private rotX = -0.4;
  private rotY = 0.6;
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
    this.autoRotateSpeed = opts.autoRotateSpeed ?? 0.15;
    this.revealed = opts.initialRevealed;
    this.targetRevealed = opts.initialRevealed;
    this.targetOpacity = new Array(opts.totalGroups).fill(0);
    this.liveOpacity = new Array(opts.totalGroups).fill(0);
    for (let i = 0; i < opts.initialRevealed; i++) {
      this.targetOpacity[i] = 0.85;
      this.liveOpacity[i] = 0.85;
    }

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    this.camera.position.set(0, 0, 4.5);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));

    this.scene.add(this.root);
    this.buildIcosphere(opts.totalGroups);
    this.bindPointer();
    this.bindResize();
    this.handleResize();

    this.lastTime = performance.now();
    this.tick = this.tick.bind(this);
    this.rafId = requestAnimationFrame(this.tick);
  }

  private buildIcosphere(totalGroups: number): void {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const pos = geo.attributes.position;
    const triCount = pos.count / 3;
    const trisPerGroup = Math.ceil(triCount / totalGroups);

    for (let g = 0; g < totalGroups; g++) {
      const points: THREE.Vector3[] = [];
      const start = g * trisPerGroup;
      const end = Math.min(start + trisPerGroup, triCount);
      for (let t = start; t < end; t++) {
        const a = new THREE.Vector3().fromBufferAttribute(pos, t * 3);
        const b = new THREE.Vector3().fromBufferAttribute(pos, t * 3 + 1);
        const c = new THREE.Vector3().fromBufferAttribute(pos, t * 3 + 2);
        points.push(a, b, b, c, c, a);
      }
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({
        color: 0xf5efd5,
        transparent: true,
        opacity: this.liveOpacity[g],
      });
      const lines = new THREE.LineSegments(lineGeo, mat);
      const group = new THREE.Group();
      group.add(lines);
      this.root.add(group);
      this.groups.push(group);
      this.materials.push(mat);
    }
    geo.dispose();
  }

  setRevealed(count: number): void {
    this.targetRevealed = count;
    for (let i = 0; i < this.targetOpacity.length; i++) {
      this.targetOpacity[i] = i < count ? 0.85 : 0;
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
    this.groups.forEach((g) => {
      g.children.forEach((child) => {
        const lines = child as THREE.LineSegments;
        lines.geometry.dispose();
      });
    });
    this.renderer.dispose();
  }
}
