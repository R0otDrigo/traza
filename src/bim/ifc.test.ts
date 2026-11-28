import { test, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { verificarIfc } from './ifc.ts';

test('cuenta muros y los que tienen el Pset NexoBIM', async () => {
  const r = await verificarIfc(fileURLToPath(new URL('../../fixtures/minimo.ifc', import.meta.url)));
  expect(r).toMatchObject({ muros: 2, conPset: 1, verificado: false });
});

test('agrupa las NexoBIM_* de Revit en un Pset "NexoBIM" por objeto, sin tocar valores', async () => {
  const { psetNexoBIM } = await import('./pset.ts');
  const ifc = `DATA;
#6=IFCOWNERHISTORY($,$,$,.NOCHANGE.,$,$,$,1);
#10=IFCWALL('a',#6,'M1',$,$,$,$,$,$);
#11=IFCWALL('b',#6,'M2',$,$,$,$,$,$);
#20=IFCPROPERTYSINGLEVALUE('NexoBIM_Estado',$,IFCTEXT('cuenta'),$);
#21=IFCPROPERTYSINGLEVALUE('Mark',$,IFCTEXT('M1'),$);
#22=IFCPROPERTYSINGLEVALUE('NexoBIM_Ratio',$,IFCREAL(0.5),$);
#30=IFCPROPERTYSET('x',#6,'Identity Data',$,(#20,#21));
#31=IFCPROPERTYSET('y',#6,'Other',$,(#22));
#40=IFCRELDEFINESBYPROPERTIES('r1',#6,$,$,(#10,#11),#30);
#41=IFCRELDEFINESBYPROPERTIES('r2',#6,$,$,(#10),#31);
ENDSEC;
END-ISO-10303-21;`;
  const r = psetNexoBIM(ifc);
  expect(r.objetos).toBe(2);
  expect(r.texto).toMatch(/#42=IFCPROPERTYSET\('[^']{22}',#6,'NexoBIM','[^']*',\(#20,#22\)\);\n#43=IFCRELDEFINESBYPROPERTIES\('[^']{22}',#6,\$,\$,\(#10\),#42\);/);
  expect(r.texto).toMatch(/#44=IFCPROPERTYSET\([^\n]*\(#20\)\);/);
  expect(psetNexoBIM(r.texto).objetos).toBe(0); // idempotente
});
