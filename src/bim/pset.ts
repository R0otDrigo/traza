// Agrupa en un IfcPropertySet "NexoBIM" las propiedades NexoBIM_* que Revit exporta repartidas en sus Psets
// internos ("Identity Data", "Other"...). El exportador IFC de Revit 2027 ignora ExportUserDefinedPsets,
// así que se hace aquí, sobre el texto STEP: no cambia ningún valor, solo agrega un Pset y su relación por objeto.
import { randomBytes } from 'node:crypto';

const B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
const guid = () => [...randomBytes(22)].map((b, i) => B64[i ? b & 63 : b & 3]).join('');
const refs = (s: string) => s.match(/#\d+/g) ?? [];

export function psetNexoBIM(ifc: string): { texto: string; objetos: number } {
  if (/IFCPROPERTYSET\('[^']*',#\d+,'NexoBIM'/.test(ifc)) return { texto: ifc, objetos: 0 }; // ya agrupado
  const nombre = new Map<string, string>(); // #prop → nombre NexoBIM_*
  for (const [, id, n] of ifc.matchAll(/^(#\d+)=IFCPROPERTYSINGLEVALUE\('(NexoBIM_\w+)'/gm)) nombre.set(id, n);
  const deSet = new Map<string, string[]>(); // #pset → props NexoBIM_*
  for (const [, id, lista] of ifc.matchAll(/^(#\d+)=IFCPROPERTYSET\('[^']*',#\d+,'[^']*',[^,]*,\(([^)]*)\)\);/gm)) {
    const p = refs(lista).filter(r => nombre.has(r));
    if (p.length) deSet.set(id, p);
  }
  const porObjeto = new Map<string, Map<string, string>>(); // #objeto → nombre → #prop (sin repetir nombre)
  let duenio = '$';
  for (const [, d, objs, ps] of ifc.matchAll(/^#\d+=IFCRELDEFINESBYPROPERTIES\('[^']*',(#\d+|\$),[^,]*,[^,]*,\(([^)]*)\),(#\d+)\);/gm)) {
    const props = deSet.get(ps);
    if (!props) continue;
    duenio = d;
    for (const o of refs(objs)) {
      const m = porObjeto.get(o) ?? porObjeto.set(o, new Map()).get(o)!;
      for (const p of props) if (!m.has(nombre.get(p)!)) m.set(nombre.get(p)!, p);
    }
  }
  if (!porObjeto.size) return { texto: ifc, objetos: 0 };
  let n = Math.max(...[...ifc.matchAll(/^#(\d+)=/gm)].map(x => +x[1]));
  const nuevas: string[] = [];
  for (const [o, m] of porObjeto) {
    const ps = `#${++n}`;
    nuevas.push(`${ps}=IFCPROPERTYSET('${guid()}',${duenio},'NexoBIM','Verificaci\X\F3n E.070 \X\B7 NexoBIM (prototipo acad\X\E9mico)',(${[...m.values()].join(',')}));`);
    nuevas.push(`#${++n}=IFCRELDEFINESBYPROPERTIES('${guid()}',${duenio},$,$,(${o}),${ps});`);
  }
  const fin = ifc.lastIndexOf('ENDSEC;');
  return { texto: ifc.slice(0, fin) + nuevas.join('\n') + '\n' + ifc.slice(fin), objetos: porObjeto.size };
}
