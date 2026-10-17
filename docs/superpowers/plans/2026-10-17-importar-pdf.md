# Importar PDF: plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usa superpowers:subagent-driven-development (recomendada) o superpowers:executing-plans para ejecutar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** importar diapositivas en PDF en Cuaderno (en un cuaderno nuevo o al final de uno existente). Cada diapositiva queda como fondo de una página para escribir encima, y se conserva en el PDF exportado, en las copias de seguridad y sin conexión.

**Arquitectura:**
- pdf.js (vendorizado, cargado solo al importar) convierte cada página del PDF en un JPEG.
- El JPEG se guarda en IndexedDB como `img:<id>`, y la página guarda una referencia opcional `bg: {img, x, y, w, h}`.
- El dibujado del fondo pinta la imagen entre el papel y la tinta, usando una pequeña caché de imágenes decodificadas.
- El motor de captura de trazos no se toca.

**Tecnología:** JS plano en `index.html`, `pdfjs-dist@4.10.38` (build legacy), jsPDF 2.5.1 (ya presente) y el ejecutor de pruebas `node tests/run.mjs` (Edge sin interfaz).

**Spec:** `docs/superpowers/specs/2026-10-17-importar-pdf-design.md`. Léela antes de empezar.

## Restricciones globales

- Sin frameworks, sin build y sin `npm install` ni `package.json`. pdf.js se copia de la tarball oficial de npm, verificando su integridad (Tarea 1).
- Versión exacta: `pdfjs-dist@4.10.38`. Archivos: `vendor/pdfjs/pdf.min.mjs`, `vendor/pdfjs/pdf.worker.min.mjs` y `vendor/pdfjs/LICENSE`.
- La apertura de un PDF siempre lleva `isEvalSupported: false`.
- Solo se **añaden** datos:
  - `page.bg` es opcional, y las páginas sin él se guardan exactamente igual que hoy (sin la clave `bg`);
  - las imágenes van en `img:<id>`;
  - el formato de trazos no cambia;
  - las copias antiguas, sin `images`, se restauran igual.
- No se tocan `onDown`/`onMove`/`onUp`, `addPoint`, `finishAct`, `penPath`, `startGesture` ni el garabato. En el dibujado solo cambian `renderBg` y `renderPageCanvas` (una línea cada una), y se añade otra línea en `goPage`.
- Constantes exactas: `IMPORT_WIDTH = 2000`, `IMPORT_MAX_H = 2800`, `IMPORT_QUALITY = 0.85`, `IMPORT_MARGIN = 40`, `BG_CACHE_MAX = 8`.
- Colores del fondo: rectángulo `#FFFFFF` detrás de la imagen y borde `#D3D8DF`.
- **Textos de interfaz, exactos:**
  - tarjeta y menús: «Importar PDF», «Añadir PDF al final»;
  - progreso y resultado: «Importando diapositiva N de T…», «PDF importado: T páginas» (en singular, «PDF importado: 1 página»);
  - errores de apertura: «No se pudo abrir este PDF.», «No se pudo cargar el lector de PDF.»;
  - páginas sin convertir: «1 página no se pudo convertir.» o «N páginas no se pudieron convertir.»;
  - espacio y concurrencia: «Sin espacio: se importaron N de T páginas.», «Ya se está importando un PDF.».
- Título de un cuaderno importado: el nombre del archivo sin `.pdf` (sin distinguir mayúsculas), recortado y limitado a 80 caracteres. Si queda vacío, «PDF importado».
- El texto que viene del usuario (nombres de archivo y títulos) va siempre con `textContent`.
- Un commit por tarea, cada uno terminado en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Hay que añadir los archivos uno a uno (nunca `git add -A`, porque `.claude/` debe quedar sin seguimiento). **Nada de `git push`.**

**Correcciones a la spec (con decisión del controlador):**
- **Prueba 2, página vertical:** un A4 vertical con márgenes queda limitado por el ancho, así que da `w = 920` y `h ≈ 1301,8`. Solo una página más alta que A4 da `h = 1334`, centrada. Se prueban los dos casos.
- **«Sin espacio»:** `localBackend` guarda en memoria cuando falla IndexedDB, lo que ocultaría un error de cuota. Por eso `setImg` deja pasar los errores con `name === 'QuotaExceededError'`, y solo usa la memoria como respaldo para los demás.

## Foco de revisión

Cada punto tiene su prueba en la tarea indicada:

1. **Una página con `bg` cuya imagen ya no existe** en IndexedDB (copia incompleta o almacenamiento borrado). Se abre mostrando solo el papel, sin errores. → Tarea 3
2. **Restaurar una copia en la que una página apunta a una imagen que no está en `images`.** La restauración termina y esa página se ve sin fondo. → Tarea 5
3. **Archivo llamado solo `.pdf`**, o con un nombre en mayúsculas como `TEMA.PDF`. Título «PDF importado» o «TEMA». → Tarea 4
4. **Tocar «Importar» dos veces seguidas.** La segunda no hace nada y avisa «Ya se está importando un PDF.». → Tarea 4
5. **Exportar una copia cuando falta una imagen.** No falla, y `images` simplemente no lleva esa clave. → Tarea 5

---

## Mapa de archivos

| Archivo | Cambio |
|---|---|
| `vendor/pdfjs/pdf.min.mjs`, `pdf.worker.min.mjs`, `LICENSE` | Nuevos (Tarea 1) |
| `sw.js` | `PRECACHE` + los dos `.mjs` (Tarea 1); `VERSION` `v5` (Tarea 6) |
| `index.html` | `loadPdfjs` (T1); backend de imágenes, `bg` en las páginas, `bgRect`, borrado de imágenes (T2); caché, `ensureBg`, `drawBg` y dibujado (T3); importación, tarjeta, menú e input (T4); copias con imágenes (T5) |
| `tests/helpers.js` | `makeTestPdf`, `noiseJpeg`, `idbKeys` (T1) |
| `tests/pdf-lib.test.js` (T1), `tests/pdf-data.test.js` (T2), `tests/pdf-render.test.js` (T3), `tests/pdf-import.test.js` (T4), `tests/pdf-backup.test.js` (T5) | Nuevos |
| `README.md` | Una línea (T6) |

Pruebas: `node tests/run.mjs` (todas) o `node tests/run.mjs tests/<archivo>.test.js`.

---

### Tarea 1: pdf.js vendorizado y cargable

**Archivos:** crear `vendor/pdfjs/*` y `tests/pdf-lib.test.js`; modificar `sw.js`, `index.html` y `tests/helpers.js`.

**Interfaces:**
- Produce: `loadPdfjs() → Promise<pdfjsLib>`. La promesa se memoriza y se reinicia si falla.
- Produce, en las utilidades de prueba:
  - `makeTestPdf() → Blob`: un PDF de 3 páginas, en este orden:
    1. 160×90 mm apaisada, fondo rojo;
    2. 160×90 mm apaisada, fondo azul;
    3. A4 vertical (210×297 mm), fondo verde.
  - `noiseJpeg(w=320, h=180, rgb=[220,30,30]) → Promise<Blob>`: un JPEG de un color con ruido.
  - `idbKeys() → Promise<string[]>`: todas las claves de la base `cuaderno`.

- [ ] **Paso 1: descarga verificada de pdf.js**

Hazlo en una carpeta temporal fuera del repo (por ejemplo, el directorio temporal del sistema), nunca dentro:

```bash
T=$(mktemp -d) && cd "$T" && curl -sSfL -o pdfjs.tgz https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-4.10.38.tgz
EXPECTED=$(curl -s https://registry.npmjs.org/pdfjs-dist/4.10.38 | python -I -c "import sys,json;print(json.load(sys.stdin)['dist']['integrity'])")
ACTUAL="sha512-$(openssl dgst -sha512 -binary pdfjs.tgz | openssl base64 -A)"
[ "$EXPECTED" = "$ACTUAL" ] && echo "integridad OK" || echo "INTEGRIDAD NO COINCIDE"
tar -xzf pdfjs.tgz package/legacy/build/pdf.min.mjs package/legacy/build/pdf.worker.min.mjs package/LICENSE
mkdir -p /c/Users/34669/Documents/cuaderno/vendor/pdfjs
cp package/legacy/build/pdf.min.mjs package/legacy/build/pdf.worker.min.mjs package/LICENSE /c/Users/34669/Documents/cuaderno/vendor/pdfjs/
```

Si la integridad no coincide, **para** y repórtalo (BLOCKED). Comprueba la versión con `grep -o 'pdfjsVersion = "[^"]*"\|version:"4.10.38"\|"4.10.38"' vendor/pdfjs/pdf.min.mjs | head -3`, que debe mostrar `4.10.38`.

- [ ] **Paso 2: añade las utilidades de prueba al final de `tests/helpers.js`**

```js
// ---- PDF y JPEG de prueba ----
window.makeTestPdf = () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: [160, 90], orientation: 'landscape' });
  doc.setFillColor(220, 30, 30); doc.rect(0, 0, 160, 90, 'F');
  doc.addPage([160, 90], 'landscape'); doc.setFillColor(30, 60, 220); doc.rect(0, 0, 160, 90, 'F');
  doc.addPage('a4', 'portrait'); doc.setFillColor(30, 160, 60); doc.rect(0, 0, 210, 297, 'F');
  return doc.output('blob');
};
window.noiseJpeg = (w = 320, h = 180, rgb = [220, 30, 30]) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'), d = x.createImageData(w, h);
  for(let i = 0; i < d.data.length; i += 4){
    const n = (Math.random() - 0.5) * 30;
    d.data[i] = rgb[0] + n; d.data[i+1] = rgb[1] + n; d.data[i+2] = rgb[2] + n; d.data[i+3] = 255;
  }
  x.putImageData(d, 0, 0);
  return new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
};
window.idbKeys = () => new Promise((res, rej) => {
  const r = indexedDB.open('cuaderno');
  r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').getAllKeys(); q.onsuccess = () => { res(q.result.map(String)); r.result.close(); }; q.onerror = () => rej(q.error); };
  r.onerror = () => rej(r.error);
});
```

- [ ] **Paso 3: escribe la prueba que debe fallar, `tests/pdf-lib.test.js`**

```js
test('pdf.js se carga una sola vez y abre un PDF de prueba', async () => {
  const a = await loadPdfjs(), b = await loadPdfjs();
  assert(a === b, 'loadPdfjs debe devolver siempre el mismo módulo');
  assertEq(a.version, '4.10.38');
  const data = new Uint8Array(await makeTestPdf().arrayBuffer());
  const pdf = await a.getDocument({ data, isEvalSupported: false }).promise;
  assertEq(pdf.numPages, 3);
  const vp = (await pdf.getPage(3)).getViewport({ scale: 1 });
  assert(vp.height > vp.width, 'la página 3 es vertical');
  await pdf.destroy();
});

test('el service worker precachea pdf.js', async () => {
  const sw = await (await fetch('sw.js', { cache: 'no-store' })).text();
  assert(sw.includes("'vendor/pdfjs/pdf.min.mjs'"), 'falta pdf.min.mjs en PRECACHE');
  assert(sw.includes("'vendor/pdfjs/pdf.worker.min.mjs'"), 'falta pdf.worker.min.mjs en PRECACHE');
});
```

Ejecuta `node tests/run.mjs tests/pdf-lib.test.js`. Esperado: 2 FAIL (`loadPdfjs is not defined` y falta en PRECACHE).

- [ ] **Paso 4: implementa**

En `sw.js`, dentro de `PRECACHE`, después de `'vendor/jspdf.umd.min.js',`, añade:

```js
  'vendor/pdfjs/pdf.min.mjs',
  'vendor/pdfjs/pdf.worker.min.mjs',
```

En `index.html`, justo antes del comentario de sección `Copia de seguridad: perfil y páginas tal cual se guardan`, añade:

```js
/* =========================================================
   Importar PDF: lector (pdf.js, se carga solo al importar)
   ========================================================= */
let pdfjsP = null;
function loadPdfjs(){
  if(!pdfjsP) pdfjsP = import('./vendor/pdfjs/pdf.min.mjs').then(m => {
    m.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.mjs';
    return m;
  }).catch(e => { pdfjsP = null; throw e; });
  return pdfjsP;
}
```

- [ ] **Paso 5:** ejecuta `node tests/run.mjs tests/pdf-lib.test.js` (esperado: `2 ok`) y después `node tests/run.mjs` (esperado: `46 ok, 0 fallos`).

- [ ] **Paso 6: commit**

```bash
git add vendor/pdfjs/pdf.min.mjs vendor/pdfjs/pdf.worker.min.mjs vendor/pdfjs/LICENSE sw.js index.html tests/helpers.js tests/pdf-lib.test.js
git commit -m "PDF: pdf.js 4.10.38 vendorizado, precacheado y cargable" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 2: datos — imágenes, `page.bg`, posición y borrado

**Archivos:** modificar `index.html` (`localBackend`, `loadPage`, `savePageNow`, `deletePageAt` y la rama `delete` de `notebookActions`) y crear `tests/pdf-data.test.js`.

**Interfaces:**
- Consume: `uid()`, `writer.schedule`, `backend`, `pages`, `dirty`, `hist`, `IDB`, `PW`, `PH`.
- Produce:
  - Los métodos del backend:
    - `backend.getImg(id) → Promise<Blob|undefined>`;
    - `backend.setImg(id, blob)`, que **lanza** `QuotaExceededError`;
    - `backend.delImg(id)`.
  - Las constantes `IMPORT_WIDTH`, `IMPORT_MAX_H`, `IMPORT_QUALITY` e `IMPORT_MARGIN`.
  - `bgRect(srcW, srcH) → {x, y, w, h}`, en unidades de página.
  - `dropPageData(id)`, que borra la página, su imagen y su estado en memoria.
  - En memoria, `page.bg` (opcional) con la forma `{img, x, y, w, h}`.

- [ ] **Paso 1: escribe la prueba que debe fallar, `tests/pdf-data.test.js`**

```js
test('el backend guarda, lee y borra imágenes', async () => {
  const blob = await noiseJpeg();
  await backend.setImg('t1', blob);
  const got = await backend.getImg('t1');
  assert(got instanceof Blob, 'debe devolver un Blob');
  assertEq([got.type, got.size], [blob.type, blob.size]);
  await backend.delImg('t1');
  assertEq(await backend.getImg('t1'), undefined);
});

test('bgRect: apaisada arriba a todo el ancho, A4 limitada por ancho, alta limitada por alto', async () => {
  const a = bgRect(1600, 900);
  assertEq([a.x, a.y, a.w], [40, 40, 920]); assert(Math.abs(a.h - 517.5) < 0.01, 'alto apaisada ' + a.h);
  const p = bgRect(595.28, 841.89);
  assertEq([p.x, p.y, p.w], [40, 40, 920]); assert(Math.abs(p.h - 1301.1) < 1, 'alto A4 ' + p.h);
  const t = bgRect(500, 1000);
  assertEq([t.y, t.h, t.w], [40, 1334, 667]); assert(Math.abs(t.x - 166.5) < 0.01, 'centrada ' + t.x);
});

test('page.bg se guarda y se vuelve a leer; una página sin fondo no lleva la clave', async () => {
  const n = await openTestNotebook(); closeNotebook();
  const pg = pages.get(n.pages[0]);
  const plain = await (async () => { await waitWrites(); return IDB.get('page:' + pg.id); })();
  assert(!('bg' in plain), 'sin fondo no debe haber clave bg');
  pg.bg = { img: 'abc', x: 40, y: 40, w: 920, h: 517.5 };
  savePageNow(pg); await waitWrites();
  pages.clear();
  const back = await loadPage(pg.id, n.id);
  assertEq(back.bg, { img: 'abc', x: 40, y: 40, w: 920, h: 517.5 });
});

test('eliminar una página con fondo borra su imagen; eliminar el cuaderno borra todas', async () => {
  const n = await openTestNotebook(); addPage(); addPage();
  for(const [i, id] of nb.pages.entries()){
    await backend.setImg('img' + i, await noiseJpeg());
    const pg = pages.get(id); pg.bg = { img: 'img' + i, x: 40, y: 40, w: 920, h: 517.5 }; savePageNow(pg);
  }
  await waitWrites();
  const p = deletePageAt(0); await clickDialog('Eliminar página'); await p; await waitWrites();
  assertEq(await backend.getImg('img0'), undefined, 'imagen de la página borrada');
  assert(await backend.getImg('img1'), 'las demás siguen');
  closeNotebook();
  document.querySelector('[aria-label="Opciones de Prueba"]').click();
  await clickDialog('Eliminar cuaderno'); await clickDialog('Eliminar cuaderno'); await waitWrites();
  const keys = await idbKeys();
  assertEq(keys.filter(k => k.startsWith('img:')), [], 'no deben quedar imágenes');
});
```

Ejecuta `node tests/run.mjs tests/pdf-data.test.js`. Esperado: 4 FAIL.

- [ ] **Paso 2: implementa**

En `localBackend`, después de la línea `delPage: …`, añade:

```js
    getImg: id => safe(() => IDB.get('img:'+id), () => mem.get('img:'+id)),
    setImg: async (id, v) => {   // un error de cuota se propaga: no se puede fingir que se guardó
      try { await IDB.set('img:'+id, v); }
      catch(e){ if(e && e.name === 'QuotaExceededError') throw e; mem.set('img:'+id, v); }
    },
    delImg: id => safe(() => IDB.del('img:'+id), () => { mem.delete('img:'+id); }),
```

En `savePageNow`, sustituye:

```js
    const body = { nb: pg.nb, strokes: pg.strokes.map(encStroke), updated: Date.now() };
```

por:

```js
    const body = { nb: pg.nb, strokes: pg.strokes.map(encStroke), updated: Date.now() };
    if(pg.bg) body.bg = pg.bg;
```

En `loadPage`, sustituye:

```js
  const pg = { id, nb: nbId, strokes: doc && Array.isArray(doc.strokes) ? doc.strokes.map(decStroke).filter(Boolean) : [] };
```

por:

```js
  const pg = { id, nb: nbId, strokes: doc && Array.isArray(doc.strokes) ? doc.strokes.map(decStroke).filter(Boolean) : [] };
  if(doc && doc.bg && typeof doc.bg.img === 'string') pg.bg = doc.bg;
```

Inmediatamente después de la función `loadPage` (antes de `function openNotebook`), añade:

```js
// Borra una página guardada y, si tiene diapositiva de fondo, también su imagen
function dropPageData(id){
  const pg = pages.get(id);
  clearTimeout(dirty.get(id)); dirty.delete(id); pages.delete(id); hist.delete(id);
  writer.schedule('page:' + id, async () => {
    let doc = pg;
    if(!doc){ try { doc = await backend.getPage(id); } catch(_){} }
    if(doc && doc.bg) await backend.delImg(doc.bg.img);
    return backend.delPage(id);
  });
}
```

En `deletePageAt`, sustituye estas tres líneas:

```js
  clearTimeout(dirty.get(id)); dirty.delete(id);
  pages.delete(id); hist.delete(id);
  writer.schedule('page:' + id, () => backend.delPage(id));
```

por:

```js
  dropPageData(id);
```

En `notebookActions`, sustituye:

```js
    for(const id of n.pages){ clearTimeout(dirty.get(id)); dirty.delete(id); pages.delete(id); hist.delete(id); writer.schedule('page:' + id, () => backend.delPage(id)); }
```

por:

```js
    for(const id of n.pages) dropPageData(id);
```

En la sección «Importar PDF: lector» (Tarea 1), justo debajo de su comentario de cabecera y antes de `let pdfjsP`, añade:

```js
const IMPORT_WIDTH = 2000;    // px de ancho al convertir cada página
const IMPORT_MAX_H = 2800;    // px de alto como máximo
const IMPORT_QUALITY = 0.85;  // calidad JPEG
const IMPORT_MARGIN = 40;     // margen de la diapositiva en la página (unidades de página)
// Dónde va la diapositiva en la página: arriba, a todo el ancho; si es muy alta, cabe en vertical y centrada
function bgRect(srcW, srcH){
  let w = PW - 2*IMPORT_MARGIN, h = w * srcH / srcW;
  if(h > PH - 2*IMPORT_MARGIN){ h = PH - 2*IMPORT_MARGIN; w = h * srcW / srcH; }
  return { x: (PW - w)/2, y: IMPORT_MARGIN, w, h };
}
```

- [ ] **Paso 3:** ejecuta `node tests/run.mjs tests/pdf-data.test.js` (esperado: `4 ok`) y después `node tests/run.mjs` (esperado: `50 ok, 0 fallos`).

- [ ] **Paso 4: commit**

```bash
git add index.html tests/pdf-data.test.js
git commit -m "PDF: imágenes de fondo en IndexedDB, page.bg, posición y borrado" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 3: dibujar la diapositiva de fondo

**Archivos:** modificar `index.html` (sección nueva, `renderBg`, `renderPageCanvas`, `goPage`, `pagesOverview`, `exportPNG` y `exportPDF`) y crear `tests/pdf-render.test.js`.

**Interfaces:**
- Consume (Tarea 2): `backend.getImg`, `page.bg`, `bgRect`.
- Produce:
  - `bgCache` (`Map`) y la constante `BG_CACHE_MAX = 8`.
  - `ensureBg(pg) → Promise<void>`: nunca lanza.
  - `drawBg(ctx, pg, hair)`: sincrónica.

- [ ] **Paso 1: escribe la prueba que debe fallar, `tests/pdf-render.test.js`**

```js
function pixelAt(px, py){   // píxel de #cv-bg en coordenadas de página
  const c = document.querySelector('#cv-bg'), d = Math.min(window.devicePixelRatio || 1, 3);
  return [...c.getContext('2d').getImageData(Math.round((view.tx + px*view.s)*d), Math.round((view.ty + py*view.s)*d), 1, 1).data].slice(0, 3);
}
const reddish = p => p[0] > 150 && p[1] < 90 && p[2] < 90;
const whitish = p => p[0] > 235 && p[1] > 235 && p[2] > 235;
async function notebookWithBg(){   // cuaderno guardado con una página de fondo rojo, sin cargar en memoria
  const n = await openTestNotebook(); closeNotebook();
  await backend.setImg('red', await noiseJpeg(320, 180, [220, 30, 30]));
  const pg = pages.get(n.pages[0]); pg.bg = Object.assign({ img: 'red' }, bgRect(1600, 900));
  savePageNow(pg); await waitWrites(); pages.clear(); bgCache.clear();
  return n;
}

test('al abrir una página importada se pinta la diapositiva y el papel alrededor', async () => {
  const n = await notebookWithBg();
  openNotebook(n.id);
  for(let i = 0; i < 100 && !(page && bgCache.has('red')); i++) await sleep(20);
  await sleep(50); renderBg();
  assert(reddish(pixelAt(500, 310)), 'dentro de la diapositiva: ' + pixelAt(500, 310));
  assert(whitish(pixelAt(500, 1000)), 'fuera, papel: ' + pixelAt(500, 1000));
});

test('foco: si falta la imagen, la página se abre solo con el papel', async () => {
  const n = await openTestNotebook(); closeNotebook();
  const pg = pages.get(n.pages[0]); pg.bg = Object.assign({ img: 'no-existe' }, bgRect(1600, 900));
  savePageNow(pg); await waitWrites(); pages.clear();
  openNotebook(n.id);
  for(let i = 0; i < 100 && !page; i++) await sleep(20);
  await ensureBg(page); renderBg();
  assert(whitish(pixelAt(500, 310)), 'sin imagen se ve el papel: ' + pixelAt(500, 310));
});

test('la caché no pasa de BG_CACHE_MAX imágenes', async () => {
  for(let i = 0; i < BG_CACHE_MAX + 3; i++){
    await backend.setImg('c' + i, await noiseJpeg(32, 18));
    await ensureBg({ bg: { img: 'c' + i, x: 0, y: 0, w: 1, h: 1 } });
  }
  assertEq(bgCache.size, BG_CACHE_MAX);
  assert(!bgCache.has('c0') && bgCache.has('c' + (BG_CACHE_MAX + 2)), 'se descartan las más antiguas');
});

test('exportar la página como imagen incluye la diapositiva', async () => {
  const n = await notebookWithBg(); openNotebook(n.id);
  for(let i = 0; i < 100 && !page; i++) await sleep(20);
  let blob = null; window.saveFile = async (name, data) => { blob = data; };
  await exportPNG();
  const bmp = await createImageBitmap(blob), c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0);
  const k = bmp.width / PW, p = [...c.getContext('2d').getImageData(500*k, 300*k, 1, 1).data].slice(0, 3);
  assert(reddish(p), 'PNG exportado con diapositiva: ' + p);
});

test('el PDF exportado de páginas con diapositiva es más grande que sin ella', async () => {
  let size = 0; window.saveFile = async (name, data) => { size = data.size; };
  const plain = await openTestNotebook(); addPage(); await exportPDF(); const s0 = size; closeNotebook();
  const n = await openTestNotebook(); addPage();
  for(const [i, id] of nb.pages.entries()){
    await backend.setImg('e' + i, await noiseJpeg(640, 360));
    const pg = pages.get(id); pg.bg = Object.assign({ img: 'e' + i }, bgRect(1600, 900));
  }
  await exportPDF();
  assert(size > s0 * 1.5, 'con fondo ' + size + ' vs sin fondo ' + s0);
});
```

Ejecuta `node tests/run.mjs tests/pdf-render.test.js`. Esperado: FAIL (`bgCache is not defined`, etc.).

- [ ] **Paso 2: implementa**

Justo después de la función `renderPageCanvas` (antes del comentario de sección `Lienzo y vista`), añade:

```js
/* Diapositiva de fondo: imágenes decodificadas en una caché pequeña (las más recientes) */
const BG_CACHE_MAX = 8;
const bgCache = new Map();   // imgId -> ImageBitmap | HTMLImageElement
async function decodeImg(blob){
  if(window.createImageBitmap) return createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  try { const im = new Image(); im.src = url; await im.decode(); return im; }
  finally { URL.revokeObjectURL(url); }
}
async function ensureBg(pg){
  if(!pg || !pg.bg) return;
  const id = pg.bg.img;
  if(bgCache.has(id)){ const v = bgCache.get(id); bgCache.delete(id); bgCache.set(id, v); return; }
  let blob = null;
  try { blob = await backend.getImg(id); } catch(_){}
  if(!blob) return;
  let im = null;
  try { im = await decodeImg(blob); } catch(_){ return; }
  bgCache.set(id, im);
  while(bgCache.size > BG_CACHE_MAX){
    const [k, v] = bgCache.entries().next().value;
    bgCache.delete(k); if(v && v.close) v.close();
  }
}
function drawBg(ctx, pg, hair){
  if(!pg || !pg.bg) return;
  const im = bgCache.get(pg.bg.img); if(!im) return;
  const { x, y, w, h } = pg.bg;
  ctx.save();
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x, y, w, h);
  ctx.drawImage(im, x, y, w, h);
  ctx.lineWidth = hair; ctx.strokeStyle = '#D3D8DF'; ctx.strokeRect(x, y, w, h);
  ctx.restore();
}
```

En `renderPageCanvas`, sustituye:

```js
  drawPaper(x, n, Math.max(0.9, 1/k));
  drawStrokes(x, pg ? pg.strokes : []);
```

por:

```js
  drawPaper(x, n, Math.max(0.9, 1/k));
  drawBg(x, pg, Math.max(0.9, 1/k));
  drawStrokes(x, pg ? pg.strokes : []);
```

En `renderBg`, sustituye:

```js
  c.save(); pageTx(c); clipPage(c); drawPaper(c, nb, 1/view.s); c.restore();
```

por:

```js
  c.save(); pageTx(c); clipPage(c); drawPaper(c, nb, 1/view.s); drawBg(c, page, 1/view.s); c.restore();
```

En `goPage`, sustituye:

```js
  page = pg; fitView(); requestRender(); updUndo();
```

por:

```js
  page = pg; fitView(); requestRender(); updUndo();
  if(pg.bg && !bgCache.has(pg.bg.img)) ensureBg(pg).then(() => { if(page === pg) requestRender(); });
```

En `pagesOverview`, sustituye:

```js
        const pg = await loadPage(it.id, n.id);
        const nc = renderPageCanvas(pg, n, 240);
```

por:

```js
        const pg = await loadPage(it.id, n.id);
        await ensureBg(pg);
        const nc = renderPageCanvas(pg, n, 240);
```

En `exportPNG`, sustituye `  const c = renderPageCanvas(page, nb, 2000);` por:

```js
  await ensureBg(page);
  const c = renderPageCanvas(page, nb, 2000);
```

En `exportPDF`, sustituye:

```js
      const pg = await loadPage(n.pages[i], n.id);
      const c = renderPageCanvas(pg, n, 1654);
```

por:

```js
      const pg = await loadPage(n.pages[i], n.id);
      await ensureBg(pg);
      const c = renderPageCanvas(pg, n, 1654);
```

- [ ] **Paso 3:** ejecuta `node tests/run.mjs tests/pdf-render.test.js` (esperado: `5 ok`) y después `node tests/run.mjs` (esperado: `55 ok, 0 fallos`).

- [ ] **Paso 4: commit**

```bash
git add index.html tests/pdf-render.test.js
git commit -m "PDF: dibujar la diapositiva de fondo en la página, miniaturas y exportación" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 4: importar (cuaderno nuevo y añadir al final)

**Archivos:** modificar `index.html` (input oculto, `ICON`, `renderLibrary`, `editorMenu` y la sección de importación) y crear `tests/pdf-import.test.js`.

**Interfaces:**
- Consume:
  - de la Tarea 1: `loadPdfjs()`;
  - de la Tarea 2: `backend.setImg`, `bgRect` y las constantes `IMPORT_*`;
  - de la Tarea 3: `ensureBg`;
  - ya existentes: `COVERS`, `folderById`, `curFolder`, `profile`, `pages`, `savePageNow`, `saveProfile`, `toast`, `openNotebook`, `goPage`, `updPagebar`, `renderLibrary` y `newCard`.
- Produce:
  - `importPdf(file, target) → Promise<{nb, first, done} | null>`, donde `target` es `{ folderId }` (cuaderno nuevo) o `{ nb }` (añadir al final). No toca la interfaz salvo los avisos.
  - `importPdfFlow(file, target)`: llama a `importPdf` y después abre el cuaderno o salta a la primera página nueva.
  - `renderPdfPage(pdf, i) → {img, blob, x, y, w, h}`.
  - `pickPdf(target)`, `ICON.pdfIn` y el input `#pdf-file`.

- [ ] **Paso 1: escribe la prueba que debe fallar, `tests/pdf-import.test.js`**

```js
const pdfFile = (name = 'Tema 3.pdf') => new File([makeTestPdf()], name, { type: 'application/pdf' });

test('importar crea un cuaderno con el nombre del archivo, en la carpeta actual, y lo abre', async () => {
  const f = createFolder('Física'); curFolder = f.id; renderLibrary();
  await importPdfFlow(pdfFile(), { folderId: curFolder });
  assertEq(nb.title, 'Tema 3'); assertEq(nb.pages.length, 3); assertEq(folderOf(nb), f.id);
  for(let i = 0; i < 100 && !page; i++) await sleep(20);
  assertEq(pageIdx, 0);
  await waitWrites();
  for(const id of nb.pages){
    const doc = await IDB.get('page:' + id);
    assert(doc.bg && typeof doc.bg.img === 'string', 'página con bg');
    const blob = await backend.getImg(doc.bg.img);
    assert(blob && blob.type === 'image/jpeg', 'imagen JPEG guardada');
  }
  assertEq(document.querySelector('#toast').textContent, 'PDF importado: 3 páginas');
});

test('posición: diapositivas apaisadas arriba a todo el ancho, A4 limitado por el ancho', async () => {
  await importPdfFlow(pdfFile(), { folderId: null });
  const [a, , p] = nb.pages.map(id => pages.get(id).bg);
  assertEq([a.x, a.y, a.w], [40, 40, 920]); assert(Math.abs(a.h - 517.5) < 2, 'alto ' + a.h);
  assertEq([p.x, p.y, p.w], [40, 40, 920]); assert(Math.abs(p.h - 1301) < 3, 'alto A4 ' + p.h);
});

test('«Añadir PDF al final» añade las páginas al final y va a la primera nueva', async () => {
  await openTestNotebook(); addPage();
  assertEq(nb.pages.length, 2);
  await importPdfFlow(pdfFile(), { nb });
  assertEq(nb.pages.length, 5);
  assert(!pages.get(nb.pages[1]).bg && pages.get(nb.pages[2]).bg, 'las nuevas van al final');
  for(let i = 0; i < 100 && pageIdx !== 2; i++) await sleep(20);
  assertEq(pageIdx, 2);
});

test('dibujar, borrar y garabatear sobre la diapositiva no toca el fondo', async () => {
  await importPdfFlow(pdfFile(), { folderId: null });
  for(let i = 0; i < 100 && !page; i++) await sleep(20);
  const bg = JSON.stringify(page.bg);
  await drawWithPointer(densify([[200, 200], [600, 220]]));
  setTool('eraser', true); await drawWithPointer(densify([[200, 210], [600, 215]]));
  setTool('pen', true); await drawWithPointer(zigzag(150, 150, 300, 40, 4));
  assertEq(JSON.stringify(page.bg), bg);
  assert(await backend.getImg(page.bg.img), 'la imagen sigue guardada');
});

test('un PDF dañado no crea nada y avisa', async () => {
  const before = profile.notebooks.length;
  const junk = new Uint8Array(4096); crypto.getRandomValues(junk);
  const r = await importPdf(new File([junk], 'roto.pdf'), { folderId: null });
  assertEq(r, null);
  assertEq(profile.notebooks.length, before);
  assertEq(document.querySelector('#toast').textContent, 'No se pudo abrir este PDF.');
  await waitWrites();
  assertEq((await idbKeys()).filter(k => k.startsWith('img:')), []);
});

test('foco: nombre «.pdf» o en mayúsculas', async () => {
  await importPdf(pdfFile('.pdf'), { folderId: null });
  assertEq(profile.notebooks[0].title, 'PDF importado');
  await importPdf(pdfFile('TEMA.PDF'), { folderId: null });
  assertEq(profile.notebooks[0].title, 'TEMA');
});

test('foco: dos importaciones a la vez, la segunda avisa y no hace nada', async () => {
  const before = profile.notebooks.length;
  const first = importPdf(pdfFile(), { folderId: null });
  const second = await importPdf(pdfFile(), { folderId: null });
  assertEq(second, null);
  assertEq(document.querySelector('#toast').textContent, 'Ya se está importando un PDF.');
  await first;
  assertEq(profile.notebooks.length, before + 1);
});

test('la biblioteca muestra «Importar PDF» y el menú del editor «Añadir PDF al final»', async () => {
  renderLibrary();
  assert([...document.querySelectorAll('#grid .card')].some(c => c.textContent.includes('Importar PDF')), 'tarjeta en la biblioteca');
  await openTestNotebook(); editorMenu(); await sleep(50);
  assert(dialogButton('Añadir PDF al final'), 'opción en el menú del editor');
  await clickDialog('Listo');
});
```

Ejecuta `node tests/run.mjs tests/pdf-import.test.js`. Esperado: FAIL (`importPdfFlow is not defined`, etc.).

- [ ] **Paso 2: implementa la importación**

Al final de la sección «Importar PDF: lector» (después de `loadPdfjs`), añade:

```js
async function renderPdfPage(pdf, i){
  const p = await pdf.getPage(i);
  try {
    const vp1 = p.getViewport({ scale: 1 });
    let scale = IMPORT_WIDTH / vp1.width;
    if(vp1.height * scale > IMPORT_MAX_H) scale = IMPORT_MAX_H / vp1.height;
    const vp = p.getViewport({ scale });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    try {
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, c.width, c.height);
      await p.render({ canvasContext: ctx, viewport: vp }).promise;
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', IMPORT_QUALITY));
      if(!blob) throw new Error('toBlob');
      return Object.assign({ img: uid(), blob }, bgRect(vp1.width, vp1.height));
    } finally { c.width = c.height = 0; }   // Safari limita mucho la memoria de los canvas
  } finally { p.cleanup(); }
}
let importing = false;
// target: { folderId } para un cuaderno nuevo, o { nb } para añadir al final de uno existente
async function importPdf(file, target){
  if(importing){ toast('Ya se está importando un PDF.'); return null; }
  importing = true;
  let pdf = null;
  try {
    let lib;
    try { lib = await loadPdfjs(); } catch(e){ toast('No se pudo cargar el lector de PDF.', 5000); return null; }
    try { pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise; }
    catch(e){ toast('No se pudo abrir este PDF.', 5000); return null; }
    let n = target.nb, isNew = false;
    if(!n){
      const title = (file.name || '').replace(/\.pdf$/i, '').trim().slice(0, 80) || 'PDF importado';
      n = { id: uid(), title, cover: COVERS[profile.notebooks.length % COVERS.length][0], paper: 'lined', paperColor: 'white', pages: [], created: Date.now(), updated: Date.now(), lastPage: 0 };
      if(folderById(target.folderId)) n.folder = target.folderId;
      profile.notebooks.unshift(n); isNew = true;
    }
    const T = pdf.numPages, first = n.pages.length;
    let done = 0, failed = 0, full = false;
    for(let i = 1; i <= T; i++){
      toast('Importando diapositiva ' + i + ' de ' + T + '…', 60000);
      let r = null;
      try { r = await renderPdfPage(pdf, i); } catch(e){ failed++; }
      const pg = { id: uid(), nb: n.id, strokes: [] };
      if(r){
        try { await backend.setImg(r.img, r.blob); }
        catch(e){ full = true; break; }
        pg.bg = { img: r.img, x: r.x, y: r.y, w: r.w, h: r.h };
      }
      pages.set(pg.id, pg); n.pages.push(pg.id); savePageNow(pg); done++;
    }
    if(isNew && !n.pages.length) profile.notebooks = profile.notebooks.filter(x => x !== n);
    n.updated = Date.now(); saveProfile();
    if(full) toast('Sin espacio: se importaron ' + done + ' de ' + T + ' páginas.', 6000);
    else if(failed) toast(failed === 1 ? '1 página no se pudo convertir.' : failed + ' páginas no se pudieron convertir.', 6000);
    else toast('PDF importado: ' + done + (done === 1 ? ' página' : ' páginas'));
    return { nb: n, first, done };
  } finally {
    importing = false;
    if(pdf) pdf.destroy();
  }
}
async function importPdfFlow(file, target){
  const r = await importPdf(file, target);
  if(!r || !r.done) return r;
  if(target.nb){ if(nb === target.nb){ updPagebar(); await goPage(r.first); } }
  else { renderLibrary(); openNotebook(r.nb.id); }
  return r;
}
let pdfTarget = null;
function pickPdf(target){ pdfTarget = target; const f = $('#pdf-file'); f.value = ''; f.click(); }
$('#pdf-file').onchange = e => {
  const f = e.target.files && e.target.files[0], target = pdfTarget; pdfTarget = null;
  if(f && target) importPdfFlow(f, target);
};
```

- [ ] **Paso 3: interfaz**

En el HTML, después de `<input type="file" id="restore-file" accept=".json,application/json" hidden>`, añade:

```html
        <input type="file" id="pdf-file" accept="application/pdf,.pdf" hidden>
```

En `const ICON = {…}`, después de `scribble: …`, añade:

```js
  pdfIn: S+'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 11v6M9.5 14.5L12 17l2.5-2.5"/></svg>',
```

En `renderLibrary`, sustituye:

```js
  if(!folder){
    g.append(newCard(ICON.folderPlus, 'Nueva carpeta', newFolderFlow));
    for(const f of [...profile.folders].sort((a, b) => a.name.localeCompare(b.name, 'es'))) g.append(folderCard(f));
  }
```

por:

```js
  if(!folder) g.append(newCard(ICON.folderPlus, 'Nueva carpeta', newFolderFlow));
  g.append(newCard(ICON.pdfIn, 'Importar PDF', () => pickPdf({ folderId: curFolder })));
  if(!folder) for(const f of [...profile.folders].sort((a, b) => a.name.localeCompare(b.name, 'es'))) g.append(folderCard(f));
```

En `editorMenu`, sustituye:

```js
    l.append(menuBtn(ICON.pdf, 'Exportar el cuaderno en PDF', () => done('pdf')));
```

por:

```js
    l.append(menuBtn(ICON.pdfIn, 'Añadir PDF al final', () => done('addpdf')));
    l.append(menuBtn(ICON.pdf, 'Exportar el cuaderno en PDF', () => done('pdf')));
```

Y en la misma función, sustituye `  if(v === 'pdf') exportPDF();` por:

```js
  if(v === 'addpdf') pickPdf({ nb });
  else if(v === 'pdf') exportPDF();
```

- [ ] **Paso 4:** ejecuta `node tests/run.mjs tests/pdf-import.test.js` (esperado: `8 ok`) y después `node tests/run.mjs` (esperado: `63 ok, 0 fallos`). Si falla alguna prueba de carpetas que cuente tarjetas, comprueba que solo se ha añadido la tarjeta «Importar PDF» y no se ha cambiado el orden de las carpetas.

- [ ] **Paso 5: revisión visual**

Haz capturas con CDP en Edge sin interfaz (`Page.captureScreenshot`) de:
- la biblioteca con la tarjeta «Importar PDF»;
- una página importada con el PDF de prueba, en claro y en oscuro.

Guárdalas en el espacio de trabajo `.superpowers/sdd/…` y descríbelas en el informe.

- [ ] **Paso 6: commit**

```bash
git add index.html tests/pdf-import.test.js
git commit -m "PDF: importar como cuaderno nuevo o añadir al final, con progreso y errores" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 5: copias de seguridad con imágenes

**Archivos:** modificar `index.html` (`exportBackup`, `readBackup` y `restoreBackup`) y crear `tests/pdf-backup.test.js`.

**Interfaces:**
- Consume: `backend.getImg`, `setImg` y `delImg` (Tarea 2); `bgCache` (Tarea 3); `b64enc` y `b64dec` (ya existentes); `importPdf` (Tarea 4, solo en las pruebas).
- Produce: la copia con `images: { [imgId]: base64 }`.

- [ ] **Paso 1: escribe la prueba que debe fallar, `tests/pdf-backup.test.js`**

```js
async function snapshotWithImages(){
  const base = JSON.parse(await idbSnapshot()), imgs = {};
  for(const doc of Object.values(base.pages)) if(doc && doc.bg){
    const b = await backend.getImg(doc.bg.img);
    imgs[doc.bg.img] = b ? b64enc(new Uint8Array(await b.arrayBuffer())) : null;
  }
  return JSON.stringify([base, imgs]);
}
async function exportText(){
  let t = null; window.saveFile = async (name, data) => { t = await data.text(); };
  await exportBackup(); return t;
}
async function restoreText(t){
  const p = restoreBackup(new File([t], 'copia.json'));
  await clickDialog('Restaurar'); await p; await waitWrites();
}

test('la copia incluye las imágenes y se restaura idéntica', async () => {
  await importPdf(new File([makeTestPdf()], 'Tema.pdf'), { folderId: null }); await waitWrites();
  const before = await snapshotWithImages();
  const text = await exportText();
  assertEq(Object.keys(JSON.parse(text).images).length, 3);
  for(const k of (await idbKeys()).filter(k => k.startsWith('img:'))) await IDB.del(k);   // se pierden las imágenes
  await restoreText(text);
  assertEq(await snapshotWithImages(), before);
});

test('una copia antigua sin images se restaura y sus páginas no tienen fondo', async () => {
  const old = { app: 'cuaderno-copia', v: 1, exported: '2026-10-16T10:00:00.000Z',
    profile: { v: 1, prefs: {}, notebooks: [{ id: 'nb1', title: 'Viejo', cover: '#3A3F47', paper: 'lined', paperColor: 'white', pages: ['p1'], created: 1, updated: 2, lastPage: 0 }] },
    pages: { p1: { nb: 'nb1', strokes: [], updated: 2 } } };
  await restoreText(JSON.stringify(old));
  assertEq(profile.notebooks.map(n => n.id), ['nb1']);
  assert(!(await loadPage('p1', 'nb1')).bg, 'sin fondo');
});

test('restaurar borra las imágenes de páginas que ya no existen', async () => {
  const empty = await exportText();   // copia sin cuadernos
  await importPdf(new File([makeTestPdf()], 'Tema.pdf'), { folderId: null }); await waitWrites();
  assert((await idbKeys()).some(k => k.startsWith('img:')), 'hay imágenes antes');
  await restoreText(empty);
  assertEq((await idbKeys()).filter(k => k.startsWith('img:')), []);
});

test('foco: una página que apunta a una imagen ausente de la copia se restaura sin fondo visible', async () => {
  const c = { app: 'cuaderno-copia', v: 1, exported: '2026-10-17T10:00:00.000Z', images: {},
    profile: { v: 1, prefs: {}, notebooks: [{ id: 'nb1', title: 'Roto', cover: '#3A3F47', paper: 'lined', paperColor: 'white', pages: ['p1'], created: 1, updated: 2, lastPage: 0 }] },
    pages: { p1: { nb: 'nb1', strokes: [], updated: 2, bg: { img: 'falta', x: 40, y: 40, w: 920, h: 517.5 } } } };
  await restoreText(JSON.stringify(c));
  openNotebook('nb1');
  for(let i = 0; i < 100 && !page; i++) await sleep(20);
  await ensureBg(page);
  assert(!bgCache.has('falta'), 'no hay imagen que dibujar, y no falla');
});

test('foco: exportar una copia cuando falta una imagen no falla', async () => {
  await importPdf(new File([makeTestPdf()], 'Tema.pdf'), { folderId: null }); await waitWrites();
  const missing = (await idbKeys()).find(k => k.startsWith('img:'));
  await IDB.del(missing);
  const o = JSON.parse(await exportText());
  assertEq(Object.keys(o.images).length, 2);
  assert(!(missing.slice(4) in o.images), 'la imagen que falta no aparece');
});

test('readBackup rechaza images que no sea un objeto', async () => {
  const bad = JSON.stringify({ app: 'cuaderno-copia', v: 1, profile: { notebooks: [] }, pages: {}, images: 'x' });
  let threw = false; try { readBackup(bad); } catch(e){ threw = true; }
  assert(threw, 'debe rechazarla');
});
```

Ejecuta `node tests/run.mjs tests/pdf-backup.test.js`. Esperado: FAIL en las pruebas 1, 3, 5 y 6. La 2 y la 4 pueden pasar ya.

- [ ] **Paso 2: implementa**

En `exportBackup`, después del bucle de páginas y antes de `const d = new Date()…`, añade:

```js
  out.images = {};
  for(const doc of Object.values(out.pages)){
    if(!doc || !doc.bg || out.images[doc.bg.img]) continue;
    let blob = null;
    try { blob = await backend.getImg(doc.bg.img); } catch(_){}
    if(blob) out.images[doc.bg.img] = b64enc(new Uint8Array(await blob.arrayBuffer()));
  }
```

En `readBackup`, sustituye:

```js
  if(!o || o.app !== BACKUP_APP || !o.profile || !Array.isArray(o.profile.notebooks) || !o.pages || typeof o.pages !== 'object') throw new Error('formato');
```

por:

```js
  if(!o || o.app !== BACKUP_APP || !o.profile || !Array.isArray(o.profile.notebooks) || !o.pages || typeof o.pages !== 'object') throw new Error('formato');
  if(o.images !== undefined && (!o.images || typeof o.images !== 'object')) throw new Error('formato');
```

En `restoreBackup`, sustituye:

```js
  try {
    for(const n of profile.notebooks) for(const id of n.pages) if(!keep.has(id)) await backend.delPage(id);
```

por:

```js
  const keepImg = new Set(Object.values(o.pages).filter(d => d && d.bg).map(d => d.bg.img));
  try {
    for(const n of profile.notebooks) for(const id of n.pages){
      let doc = pages.get(id);
      if(!doc){ try { doc = await backend.getPage(id); } catch(_){} }
      if(doc && doc.bg && !keepImg.has(doc.bg.img)) await backend.delImg(doc.bg.img);
    }
    for(const [id, b64] of Object.entries(o.images || {})) await backend.setImg(id, new Blob([b64dec(b64)], { type: 'image/jpeg' }));
    for(const n of profile.notebooks) for(const id of n.pages) if(!keep.has(id)) await backend.delPage(id);
```

Y en la misma función, sustituye `  pages.clear(); hist.clear();` por `  pages.clear(); hist.clear(); bgCache.clear();`.

- [ ] **Paso 3:** ejecuta `node tests/run.mjs tests/pdf-backup.test.js` (esperado: `6 ok`) y después `node tests/run.mjs` (esperado: `69 ok, 0 fallos`).

- [ ] **Paso 4: commit**

```bash
git add index.html tests/pdf-backup.test.js
git commit -m "PDF: copias de seguridad con las imágenes de fondo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 6: versión v5 y comprobación sin red

**Archivos:** modificar `sw.js:3` y `README.md`.

- [ ] **Paso 1:** en `sw.js`, `const VERSION = 'v4';` pasa a `const VERSION = 'v5';`. En `README.md`, el ejemplo «(por ejemplo, de `v4` a `v5`)» pasa a «(por ejemplo, de `v5` a `v6`)». Debajo de la línea «Organiza los cuadernos en carpetas…», añade la línea `Importa diapositivas en PDF y escribe encima.`.
- [ ] **Paso 2:** ejecuta `node tests/run.mjs`. Esperado: `69 ok, 0 fallos`.
- [ ] **Paso 3: prueba sin red**

Ejecuta `node .superpowers/sdd/2026-10-16-carpetas-garabato/offline_test.mjs C:/Users/34669/Documents/cuaderno`. La línea JSON `precache` debe incluir `/vendor/pdfjs/pdf.min.mjs` y `/vendor/pdfjs/pdf.worker.min.mjs`; las cachés, `cuaderno-app-v5`; y la última línea, `"arranca":true` y `"controlada":true`.
- [ ] **Paso 4: commit**

```bash
git add sw.js README.md
git commit -m "Versión v5: importar PDF" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Paso 5: PARA.** El push y la comprobación del sitio publicado esperan al sí del usuario.
