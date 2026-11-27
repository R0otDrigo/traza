// Genera fixtures/ems_ejemplo.pdf (EMS FICTICIO) desde ems_ejemplo.html con el Edge instalado.
// La sección .escaneada se fotografía y se reemplaza por una imagen (página "escaneada" para probar el OCR).
// Uso: node fixtures/generar-ems.ts
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';

const html = fileURLToPath(new URL('./ems_ejemplo.html', import.meta.url));
const navegador = await chromium.launch({ channel: 'msedge' });
const page = await navegador.newPage();
await page.goto(pathToFileURL(html).href);
const png = await page.locator('.escaneada').screenshot({ scale: 'device' });
await page.evaluate(b64 => {
  const el = document.querySelector('.escaneada') as HTMLElement;
  const img = document.createElement('img');
  img.src = `data:image/png;base64,${b64}`;
  img.style.cssText = `width:${el.offsetWidth}px;filter:grayscale(1) contrast(.9);transform:rotate(.4deg)`;
  el.replaceWith(img);
}, png.toString('base64'));
await page.pdf({ path: fileURLToPath(new URL('./ems_ejemplo.pdf', import.meta.url)), format: 'A4', printBackground: true, preferCSSPageSize: true });
await navegador.close();
console.log('fixtures/ems_ejemplo.pdf generado');
