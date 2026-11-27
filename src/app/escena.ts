import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { Proyecto, Resultado, Tramo } from '../e070/types.ts';
import type { Calicata } from '../contracts/index.ts';
import { colorSucs } from './suelo.ts';

/** Suelo bajo el edificio: calicatas del EMS, perfil y S del motor. */
export interface SueloEscena { calicatas: Calicata[]; perfil: string | null; S: number | null }

const C = { cuenta: 0x22c55e, no_cuenta: 0xef4444, tabique: 0x94a3b8, opcion: 0x38bdf8, desconocido: 0xf59e0b };

export class Escena {
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private renderer = new THREE.WebGLRenderer({ antialias: true });
  private labels = new CSS2DRenderer();
  private controls: OrbitControls;
  private grupo = new THREE.Group();
  private piso = new THREE.Group(); // terreno + grilla; baja al fondo de las calicatas para mostrar el bloque de suelo
  private ray = new THREE.Raycaster();
  private resaltados = new Set<string>();
  private seleccion: string | null = null;
  private down = [0, 0];
  private encuadrado = false;
  onClick: (muroId: string | null) => void = () => {};

  constructor(private host: HTMLElement) {
    const { clientWidth: w, clientHeight: h } = host;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(this.renderer.domElement);
    this.labels.setSize(w, h);
    Object.assign(this.labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    host.appendChild(this.labels.domElement);
    this.scene.background = new THREE.Color(0x0a1020);
    this.camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 500);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.scene.add(new THREE.HemisphereLight(0xdbeafe, 0x111827, 1.3));
    const sol = new THREE.DirectionalLight(0xffffff, 2.4);
    sol.position.set(30, 40, -20);
    sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    Object.assign(sol.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30 });
    this.scene.add(sol);
    const suelo = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 1 }));
    suelo.rotation.x = -Math.PI / 2;
    suelo.receiveShadow = true;
    this.piso.add(suelo, new THREE.GridHelper(300, 300, 0x1e293b, 0x172036));
    this.scene.add(this.piso, this.grupo);
    new ResizeObserver(() => this.resize()).observe(host);
    this.renderer.domElement.addEventListener('pointerdown', e => (this.down = [e.clientX, e.clientY]));
    this.renderer.domElement.addEventListener('pointerup', e => this.click(e));
    this.renderer.setAnimationLoop(t => this.frame(t));
  }

  dibujar(p: Proyecto, r: Resultado, resaltar: Set<string>, seleccion: string | null, suelo?: SueloEscena) {
    this.resaltados = resaltar;
    this.seleccion = seleccion;
    for (const o of [...this.grupo.children]) { this.grupo.remove(o); o.traverse((x: any) => { x.geometry?.dispose(); x.material?.dispose?.(); }); }
    const elev = new Map(p.niveles.map(n => [n.nombre, n.elevacion]));
    const rol = new Map(p.muros.map(m => [m.id, m]));
    const estadoNivel = new Map<string, boolean>();
    for (const c of r.chequeos) estadoNivel.set(c.nivel, (estadoNivel.get(c.nivel) ?? true) && c.cumple);

    for (const t of r.tramos) {
      const m = rol.get(t.muroId)!;
      const z0 = elev.get(t.nivel) ?? 0;
      const color = resaltar.has(t.muroId) ? C.opcion : m.rol === 'tabique' ? C.tabique : m.rol === 'desconocido' ? C.desconocido : t.cuenta ? C.cuenta : C.no_cuenta;
      const L = t.L, alto = m.h;
      const g = new THREE.BoxGeometry(L, alto, t.t);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, transparent: m.rol === 'tabique', opacity: m.rol === 'tabique' ? 0.45 : 1, emissive: t.muroId === seleccion ? 0x334155 : 0 });
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.set((t.x1 + t.x2) / 2, z0 + alto / 2, (t.y1 + t.y2) / 2);
      mesh.rotation.y = -Math.atan2(t.y2 - t.y1, t.x2 - t.x1);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData = { muroId: t.muroId, opcion: resaltar.has(t.muroId) };
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: 0x020617, transparent: true, opacity: 0.4 })));
      this.grupo.add(mesh);
    }
    // Losas por nivel coloreadas por cumplimiento + etiqueta
    const xs = r.tramos.flatMap(t => [t.x1, t.x2]), ys = r.tramos.flatMap(t => [t.y1, t.y2]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    for (const n of p.niveles) {
      const ok = estadoNivel.get(n.nombre) ?? true;
      const losa = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.06, y1 - y0), new THREE.MeshStandardMaterial({ color: ok ? C.cuenta : C.no_cuenta, transparent: true, opacity: 0.12, depthWrite: false }));
      losa.position.set((x0 + x1) / 2, n.elevacion + 0.03, (y0 + y1) / 2);
      this.grupo.add(losa);
      const d = document.createElement('div');
      d.className = `etq-nivel ${ok ? 'ok' : 'mal'}`;
      d.textContent = `${n.nombre} ${ok ? '✓' : '✗'}`;
      const o = new CSS2DObject(d);
      o.position.set(x0 - 1.2, n.elevacion + 1.3, y0);
      this.grupo.add(o);
    }
    this.piso.position.y = suelo?.calicatas.length ? -Math.max(...suelo.calicatas.map(c => c.profundidad_m)) - 0.03 : 0;
    if (suelo?.calicatas.length) this.estratos(suelo, x0, x1, y0, y1);
    if (!this.encuadrado && r.tramos.length) {
      const H = Math.max(...p.niveles.map(n => n.elevacion)) + 3;
      const c = new THREE.Vector3((x0 + x1) / 2, H / 2, (y0 + y1) / 2);
      this.controls.target.copy(c);
      const R = Math.max(x1 - x0, y1 - y0, H);
      this.camera.position.set(c.x - R * 1.6, H + R * 1.0, c.z - R * 1.5);
      this.encuadrado = true;
    }
  }

  /** Una franja por calicata bajo la planta; cada estrato es un bloque del color de su SUCS (profundidad real). */
  private estratos(s: SueloEscena, x0: number, x1: number, y0: number, y1: number) {
    const w = (x1 - x0) / s.calicatas.length;
    const etiqueta = (texto: string, clase: string, x: number, y: number, z: number) => {
      const d = document.createElement('div');
      d.className = clase;
      d.textContent = texto;
      const o = new CSS2DObject(d);
      o.position.set(x, y, z);
      this.grupo.add(o);
    };
    s.calicatas.forEach((c, i) => {
      const cx = x0 + w * (i + 0.5);
      for (const e of c.estratos) {
        const h = Math.max(0.05, e.hasta_m - e.desde_m);
        const g = new THREE.BoxGeometry(w - 0.3, h, y1 - y0);
        const b = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: colorSucs(e.SUCS), roughness: 0.95 }));
        b.position.set(cx, -e.desde_m - h / 2 - 0.02, (y0 + y1) / 2);
        b.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: 0x020617, transparent: true, opacity: 0.5 })));
        this.grupo.add(b);
      }
      etiqueta(c.id, 'etq-calicata', cx, -c.profundidad_m - 0.5, y0);
    });
    etiqueta(`Perfil ${s.perfil ?? '—'} · S = ${s.S ?? '—'}`, 'etq-suelo', x1 + 1, -1.5, y0);
  }

  private click(e: PointerEvent) {
    if (Math.hypot(e.clientX - this.down[0], e.clientY - this.down[1]) > 4) return;
    const b = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1), this.camera);
    const hit = this.ray.intersectObjects(this.grupo.children.filter(o => o.userData.muroId), false)[0];
    this.onClick(hit ? hit.object.userData.muroId : null);
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (!w || !h) return; // pestaña oculta
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
  }

  private frame(t: number) {
    const k = 0.5 + 0.5 * Math.sin(t / 260);
    for (const o of this.grupo.children) if (o.userData.opcion) ((o as THREE.Mesh).material as THREE.MeshStandardMaterial).emissive.setRGB(0.05 * k, 0.25 * k, 0.4 * k);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }
}

export type { Tramo };
