import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { Edificio, Elemento, Estado, ResultadoTrazable } from '../types';
import { areaTributaria } from '../engine/engine';

export const COLOR: Record<Estado | 'neutro', number> = {
  cumple: 0x22c55e, revisar: 0xf59e0b, no_cumple: 0xef4444, neutro: 0x9fb3c8,
};
const TIPO_COLOR = { columna: 0x7aa2f7, viga: 0xa8b4c8, losa: 0xdfe6ee } as const;

export class Visor {
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private labels = new CSS2DRenderer();
  private controls: OrbitControls;
  private meshes = new Map<string, THREE.Mesh>();
  private niveles: THREE.Group[] = [];
  private trib = new THREE.Group();
  private raycaster = new THREE.Raycaster();
  private seleccion?: THREE.Mesh;
  private t0 = performance.now();
  onSelect: (id: string | null) => void = () => {};

  constructor(private host: HTMLElement, private ed: Edificio) {
    const w = host.clientWidth, h = host.clientHeight;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(this.renderer.domElement);
    this.labels.setSize(w, h);
    Object.assign(this.labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    host.appendChild(this.labels.domElement);

    this.scene.background = new THREE.Color(0x0b1220);
    this.scene.fog = new THREE.Fog(0x0b1220, 60, 140);
    const X = ed.ejesX.at(-1)!.pos, Y = ed.ejesY.at(-1)!.pos;
    const H = ed.niveles.at(-1)!.z + ed.niveles.at(-1)!.altura;
    const centro = new THREE.Vector3(X / 2, H / 2, Y / 2);

    this.camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 500);
    this.camera.position.set(X * 1.6 + 8, H * 1.4 + 6, Y * 1.9 + 10);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(centro);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;

    this.scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x1a2333, 1.2));
    const sol = new THREE.DirectionalLight(0xffffff, 2.2);
    sol.position.set(X + 15, H + 20, -10);
    sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    Object.assign(sol.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30 });
    sol.target.position.copy(centro);
    this.scene.add(sol, sol.target);

    const suelo = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x111a2b, roughness: 1 }));
    suelo.rotation.x = -Math.PI / 2;
    suelo.position.y = -0.01;
    suelo.receiveShadow = true;
    const grid = new THREE.GridHelper(200, 200, 0x1e2b44, 0x16213a);
    this.scene.add(suelo, grid, this.trib);

    this.ejes(X, Y);
    this.construir();
    addEventListener('resize', () => this.resize());
    this.renderer.domElement.addEventListener('pointerdown', e => this.down = [e.clientX, e.clientY]);
    this.renderer.domElement.addEventListener('pointerup', e => this.click(e));
    this.renderer.setAnimationLoop(() => this.frame());
  }
  private down: [number, number] = [0, 0];

  private ejes(X: number, Y: number) {
    const mat = new THREE.LineDashedMaterial({ color: 0x4b6a9b, dashSize: 0.5, gapSize: 0.3 });
    const linea = (a: THREE.Vector3, b: THREE.Vector3) => {
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), mat);
      l.computeLineDistances();
      this.scene.add(l);
    };
    const etiqueta = (txt: string, p: THREE.Vector3) => {
      const d = document.createElement('div');
      d.className = 'eje';
      d.textContent = txt;
      const o = new CSS2DObject(d);
      o.position.copy(p);
      this.scene.add(o);
    };
    for (const e of this.ed.ejesX) { linea(new THREE.Vector3(e.pos, 0.02, -3), new THREE.Vector3(e.pos, 0.02, Y + 3)); etiqueta(e.id, new THREE.Vector3(e.pos, 0, -4)); }
    for (const e of this.ed.ejesY) { linea(new THREE.Vector3(-3, 0.02, e.pos), new THREE.Vector3(X + 3, 0.02, e.pos)); etiqueta(e.id, new THREE.Vector3(-4, 0, e.pos)); }
  }

  private construir() {
    const { ed } = this;
    const px = (i: number) => ed.ejesX[i].pos, py = (j: number) => ed.ejesY[j].pos;
    for (const nv of ed.niveles) {
      const g = new THREE.Group();
      g.userData.z = nv.z;
      this.niveles.push(g);
      this.scene.add(g);
      const top = nv.z + nv.altura;
      for (const el of ed.elementos.filter(e => e.nivel === nv.id)) {
        const { b, h } = el.seccion;
        let geo: THREE.BoxGeometry, pos: THREE.Vector3;
        if (el.tipo === 'columna') {
          geo = new THREE.BoxGeometry(b, nv.altura, h);
          pos = new THREE.Vector3(px(el.i), nv.z + nv.altura / 2, py(el.j));
        } else if (el.tipo === 'viga') {
          const enX = el.j === el.j2;
          const L = enX ? px(el.i2!) - px(el.i) : py(el.j2!) - py(el.j);
          geo = enX ? new THREE.BoxGeometry(L, h, b) : new THREE.BoxGeometry(b, h, L);
          pos = new THREE.Vector3((px(el.i) + px(el.i2!)) / 2, top - h / 2, (py(el.j) + py(el.j2!)) / 2);
        } else {
          const Lx = px(el.i2!) - px(el.i), Ly = py(el.j2!) - py(el.j);
          geo = new THREE.BoxGeometry(Lx - 0.25, h, Ly - 0.25);
          pos = new THREE.Vector3(px(el.i) + Lx / 2, top - h / 2 - 0.001, py(el.j) + Ly / 2);
        }
        const mat = new THREE.MeshStandardMaterial({
          color: TIPO_COLOR[el.tipo], roughness: 0.65, metalness: 0.05,
          transparent: el.tipo === 'losa', opacity: el.tipo === 'losa' ? 0.55 : 1,
        });
        const m = new THREE.Mesh(geo, mat);
        m.position.copy(pos);
        m.castShadow = el.tipo !== 'losa';
        m.receiveShadow = true;
        m.userData.el = el;
        m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x0b1220, transparent: true, opacity: 0.35 })));
        this.meshes.set(el.id, m);
        g.add(m);
      }
    }
    this.armar();
  }

  /** Animación de armado piso por piso. */
  armar() { this.t0 = performance.now(); }

  pintar(res: Map<string, ResultadoTrazable> | null) {
    for (const [id, m] of this.meshes) {
      const el = m.userData.el as Elemento;
      const r = res?.get(id);
      (m.material as THREE.MeshStandardMaterial).color.setHex(r ? COLOR[r.estado] : TIPO_COLOR[el.tipo]);
    }
  }

  seleccionar(id: string | null, enfocar = false) {
    if (this.seleccion) (this.seleccion.material as THREE.MeshStandardMaterial).emissive.setHex(0);
    this.seleccion = id ? this.meshes.get(id) : undefined;
    this.trib.clear();
    if (!this.seleccion) return;
    (this.seleccion.material as THREE.MeshStandardMaterial).emissive.setHex(0x334466);
    const el = this.seleccion.userData.el as Elemento;
    if (el.tipo === 'columna') {
      const nv = this.ed.niveles.find(n => n.id === el.nivel)!;
      const { rect } = areaTributaria(this.ed, el.i, el.j);
      const w = rect.x1 - rect.x0, d = rect.y1 - rect.y0;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
      p.rotation.x = -Math.PI / 2;
      p.position.set(rect.x0 + w / 2, nv.z + nv.altura + 0.05, rect.y0 + d / 2);
      const borde = new THREE.LineSegments(new THREE.EdgesGeometry(p.geometry), new THREE.LineBasicMaterial({ color: 0x7dd3fc }));
      p.add(borde);
      this.trib.add(p);
    }
    if (enfocar) this.controls.target.copy(this.seleccion.getWorldPosition(new THREE.Vector3()));
  }

  private click(e: PointerEvent) {
    if (Math.hypot(e.clientX - this.down[0], e.clientY - this.down[1]) > 4) return; // fue arrastre
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects([...this.meshes.values()], false)[0];
    const id = hit ? (hit.object.userData.el as Elemento).id : null;
    this.seleccionar(id);
    this.onSelect(id);
  }

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
  }

  private frame() {
    const t = (performance.now() - this.t0) / 1000;
    this.niveles.forEach((g, k) => {
      const p = THREE.MathUtils.clamp((t - k * 0.45) / 0.6, 0, 1);
      const e = 1 - Math.pow(1 - p, 3);
      g.visible = p > 0;
      g.position.y = (1 - e) * 6;
    });
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }
}
