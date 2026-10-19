# Insertar imágenes: plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usa superpowers:subagent-driven-development (recomendada) o superpowers:executing-plans para ejecutar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** insertar fotos en las páginas como objetos movibles. Se pueden seleccionar, mover, redimensionar, duplicar y borrar con el lazo, deshacer, exportar, incluir en las copias y usar sin conexión.

**Arquitectura:**
- Cada página puede llevar `imgs: [{id, img, x, y, w, h}]`. Los píxeles se guardan como JPEG en `img:<img>`, igual que las diapositivas.
- Las imágenes se dibujan en el lienzo de fondo, entre la diapositiva y la tinta.
- El historial guarda estados `{s, i}` (trazos e imágenes).
- El lazo aprende a seleccionar, mover y redimensionar imágenes.
- Una limpieza diaria borra los píxeles huérfanos.

**Tecnología:** JS plano en `index.html` y el ejecutor de pruebas `node tests/run.mjs` (Edge sin interfaz).

**Spec:** `docs/superpowers/specs/2026-10-19-insertar-imagenes-design.md`. Léela antes de empezar.

## Restricciones globales

- Sin frameworks, sin build y sin dependencias nuevas. Nada de `git push`.
- Una página sin imágenes se guarda **sin** la clave `imgs`. No cambian ni `encStroke`/`decStroke` ni `bg`, y las copias antiguas se restauran igual.
- No se tocan la pluma, el fosforito, la goma, el garabato (`tryScribbleErase`), `addPoint`, `penPath` ni los gestos. Solo cambian el lazo (`startTool` rama lasso, `onMove` rama move/resize, `finishAct` ramas lasso/move/resize, `abortAct`), el historial y el dibujo de fondo y en vivo, tal como indica cada tarea.
- Constantes exactas: `IMG_MAX_PX = 2000`, `IMG_QUALITY = 0.85`, `IMG_INSERT_FRAC = 0.6`, `HANDLE_HIT = 22`, `IMG_MIN_SIDE = 40`, `IMG_GC_DELAY = 5000`, `IMG_GC_EVERY = 24*3600*1000`.
- Textos exactos: «Insertar imagen», «No se pudo abrir esa imagen.», «No se pudo guardar la imagen.». El menú de selección conserva sus botones «Duplicar» y «Borrar».
- Un commit por tarea, terminado en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Añade los archivos uno a uno, nunca con `git add -A`.
- La suite tiene ahora **83** pruebas. Tras cada tarea, el total esperado es el que indica esa tarea.

## Foco de revisión

1. **Una foto panorámica o enorme** (8000×1000 px) queda reducida, con sus proporciones, a 600 unidades de ancho. → Tarea 3
2. **Borras una imagen, pasa la limpieza y después deshaces.** La imagen vuelve con sus píxeles, porque la limpieza respeta el historial. → Tarea 5
3. **Tocar una imagen con la pluma** escribe y no la selecciona. → Tarea 4
4. **Redimensionar hasta casi cero o fuera de la página.** Se respeta el mínimo de 40 y el centro no sale de la página. → Tarea 4
5. **Una página con más de 8 imágenes** las dibuja todas, porque la caché no expulsa ninguna de la página abierta. → Tarea 2

---

### Tarea 1: datos de imágenes, historial y borrado

**Archivos:** modificar `index.html` (un bloque nuevo antes del historial, el historial, `savePageNow`, `loadPage` y `dropPageData`) y `tests/helpers.js`; crear `tests/img-data.test.js`.

**Interfaces:**
- Produce:
  - `pageImgs(pg) → array` (`[]` si no hay);
  - `validImgObj(o) → bool`;
  - `imgRefs(doc) → string[]`: las claves `img` de la diapositiva y de las imágenes, sin repetir;
  - `commit(prevStrokes, prevImgs = pageImgs(page))`;
  - `commitImgs(prevImgs)`;
  - los pasos del historial pasan a ser `{ s, i }`.
- En las utilidades de prueba:
  - `addTestImg(pg, rect, rgb) → obj`: guarda los píxeles y añade el objeto a `pg.imgs`;
  - `imgFile(w, h, rgb, name) → File`.

- [ ] **Paso 1: utilidades de prueba.** Al final de `tests/helpers.js`:

```js
// ---- Imágenes insertadas ----
window.addTestImg = async (pg, rect = { x: 300, y: 200, w: 400, h: 300 }, rgb = [30, 60, 220]) => {
  const key = 'k' + uid();
  await backend.setImg(key, await noiseJpeg(160, 120, rgb));
  const o = Object.assign({ id: uid(), img: key }, rect);
  pg.imgs = [...(pg.imgs || []), o];
  return o;
};
window.imgFile = async (w, h, rgb = [30, 60, 220], name = 'foto.jpg') => new File([await noiseJpeg(w, h, rgb)], name, { type: 'image/jpeg' });
```

- [ ] **Paso 2: prueba que debe fallar, `tests/img-data.test.js`**

```js
test('las imágenes de una página se guardan y se leen; sin imágenes no hay clave imgs', async () => {
  const n = await openTestNotebook(); closeNotebook(); await waitWrites();
  const pg = pages.get(n.pages[0]);
  assert(!('imgs' in await IDB.get('page:' + pg.id)), 'sin imágenes no hay clave');
  const o = await addTestImg(pg);
  savePageNow(pg); await waitWrites(); pages.clear();
  assertEq((await loadPage(pg.id, n.id)).imgs, [o]);
});

test('loadPage descarta imágenes mal formadas', async () => {
  const n = await openTestNotebook(); closeNotebook(); await waitWrites();
  const id = n.pages[0], doc = await IDB.get('page:' + id);
  doc.imgs = [null, { id: 'a', img: 'k', x: 0, y: 0, w: 0, h: 5 }, { id: 'b', img: 'k', x: 1, y: 2, w: 3, h: 4 }, { id: 3, img: 'k', x: 1, y: 2, w: 3, h: 4 }];
  await IDB.set('page:' + id, doc); pages.clear();
  assertEq((await loadPage(id, n.id)).imgs.map(o => o.id), ['b']);
});

test('deshacer y rehacer devuelven las imágenes y se mezclan con los trazos', async () => {
  await openTestNotebook();
  const prev = pageImgs(page);
  page.imgs = [{ id: 'i1', img: 'k1', x: 10, y: 10, w: 100, h: 50 }]; commitImgs(prev);
  await drawWithPointer(densify([[200, 560], [400, 570]]));
  assertEq([page.strokes.length, page.imgs.length], [1, 1]);
  undo(); assertEq([page.strokes.length, page.imgs.length], [0, 1]);
  undo(); assertEq([page.strokes.length, pageImgs(page).length], [0, 0]);
  redo(); redo(); assertEq([page.strokes.length, page.imgs.length], [1, 1]);
});

test('imgRefs junta diapositiva e imágenes sin repetir', async () => {
  assertEq(imgRefs({ bg: { img: 'a' }, imgs: [{ img: 'b' }, { img: 'a' }, { img: 'b' }] }), ['a', 'b']);
  assertEq(imgRefs(null), []);
});

test('eliminar una página o el cuaderno borra los píxeles de sus imágenes', async () => {
  await openTestNotebook(); addPage();
  const [a, b] = nb.pages.map(id => pages.get(id));
  const oa = await addTestImg(a), ob = await addTestImg(b);
  savePageNow(a); savePageNow(b); await waitWrites();
  const p = deletePageAt(0); await clickDialog('Eliminar página'); await p; await waitWrites();
  assertEq(await backend.getImg(oa.img), undefined);
  assert(await backend.getImg(ob.img), 'la imagen de la otra página sigue');
  closeNotebook();
  document.querySelector('[aria-label="Opciones de Prueba"]').click();
  await clickDialog('Eliminar cuaderno'); await clickDialog('Eliminar cuaderno'); await waitWrites();
  assertEq(await backend.getImg(ob.img), undefined);
});
```

Ejecuta `node tests/run.mjs tests/img-data.test.js`. Esperado: FAIL (`pageImgs is not defined`, etc.).

- [ ] **Paso 3: implementa.** Inmediatamente antes del comentario de sección `Historial (deshacer / rehacer)`, añade:

```js
/* =========================================================
   Imágenes insertadas en la página (objetos movibles)
   ========================================================= */
function pageImgs(pg){ return (pg && pg.imgs) || []; }
function validImgObj(o){ return !!o && typeof o.id === 'string' && typeof o.img === 'string' && [o.x, o.y, o.w, o.h].every(Number.isFinite) && o.w > 0 && o.h > 0; }
// Claves img: que usa una página: su diapositiva y sus imágenes insertadas
function imgRefs(doc){
  const out = [];
  if(doc && doc.bg && typeof doc.bg.img === 'string') out.push(doc.bg.img);
  for(const o of pageImgs(doc)) if(o && typeof o.img === 'string' && !out.includes(o.img)) out.push(o.img);
  return out;
}
```

Sustituye `commit`, `undo` y `redo` por:

```js
// Cada paso del historial guarda el estado anterior de trazos e imágenes (referencias, nunca copias)
function commit(prevStrokes, prevImgs = pageImgs(page)){
  const h = H(); h.u.push({ s: prevStrokes, i: prevImgs }); if(h.u.length > 200) h.u.shift(); h.r.length = 0;
  markDirty(); updUndo();
}
function commitImgs(prevImgs){ commit(page.strokes, prevImgs); }
function undo(){
  if(!page) return; const h = H(); if(!h.u.length) return;
  clearSelection(); h.r.push({ s: page.strokes, i: pageImgs(page) });
  const st = h.u.pop(); page.strokes = st.s; page.imgs = st.i;
  renderBg(); renderInk(); renderLive(); markDirty(); updUndo();
}
function redo(){
  if(!page) return; const h = H(); if(!h.r.length) return;
  clearSelection(); h.u.push({ s: page.strokes, i: pageImgs(page) });
  const st = h.r.pop(); page.strokes = st.s; page.imgs = st.i;
  renderBg(); renderInk(); renderLive(); markDirty(); updUndo();
}
```

En `savePageNow`, después de `if(pg.bg) body.bg = pg.bg;`, añade:

```js
    if(pg.imgs && pg.imgs.length) body.imgs = pg.imgs.map(({ id, img, x, y, w, h }) => ({ id, img, x, y, w, h }));
```

En `loadPage`, después de `if(doc && doc.bg && typeof doc.bg.img === 'string') pg.bg = doc.bg;`, añade:

```js
  if(doc && Array.isArray(doc.imgs)){ const v = doc.imgs.filter(validImgObj); if(v.length) pg.imgs = v; }
```

En `dropPageData`, sustituye el comentario de cabecera por `// Borra una página guardada y los píxeles de su diapositiva y de sus imágenes`, y sustituye `    if(doc && doc.bg) await backend.delImg(doc.bg.img);` por:

```js
    for(const k of imgRefs(doc)) await backend.delImg(k);
```

- [ ] **Paso 4:** ejecuta `node tests/run.mjs tests/img-data.test.js` (esperado: `5 ok`) y después `node tests/run.mjs` (esperado: `88 ok, 0 fallos`).

- [ ] **Paso 5: commit**

```bash
git add index.html tests/helpers.js tests/img-data.test.js
git commit -m "Imágenes: datos en la página, historial con imágenes y borrado de píxeles" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 2: dibujar las imágenes

**Archivos:** modificar `index.html` (`ensureBg` y la caché, `renderBg`, `renderPageCanvas`, `goPage`, `pagesOverview`, `exportPNG` y `exportPDF`); crear `tests/img-render.test.js`.

**Interfaces:**
- Consume: `pageImgs` e `imgRefs` (Tarea 1).
- Produce:
  - `ensureImg(key) → Promise`, que nunca lanza;
  - `ensureImgs(pg) → Promise`;
  - `drawImgs(ctx, pg, skip?)`: `skip` es un `Set` de `id` que no se dibujan;
  - `ensureBg(pg)` se mantiene.

- [ ] **Paso 1: prueba que debe fallar, `tests/img-render.test.js`**

```js
function pixelAt(cv, px, py){
  const c = document.querySelector(cv), d = Math.min(window.devicePixelRatio || 1, 3);
  return [...c.getContext('2d').getImageData(Math.round((view.tx + px*view.s)*d), Math.round((view.ty + py*view.s)*d), 1, 1).data];
}
const bluish = p => p[2] > 150 && p[0] < 110;
const whitish = p => p[0] > 235 && p[1] > 235 && p[2] > 235;

test('una imagen insertada se pinta en su sitio, sobre el papel', async () => {
  await openTestNotebook(); await addTestImg(page, { x: 300, y: 200, w: 400, h: 300 });
  await ensureImgs(page); renderBg();
  assert(bluish(pixelAt('#cv-bg', 500, 350)), 'dentro: ' + pixelAt('#cv-bg', 500, 350));
  assert(whitish(pixelAt('#cv-bg', 150, 580)), 'fuera: ' + pixelAt('#cv-bg', 150, 580));
});

test('la tinta escrita encima de una imagen se ve encima', async () => {
  await openTestNotebook(); await addTestImg(page, { x: 300, y: 200, w: 400, h: 300 });
  await ensureImgs(page); renderBg();
  await drawWithPointer(densify([[350, 350], [650, 352]]));
  assert(pixelAt('#cv-ink', 500, 351)[3] > 0, 'la tinta está en su capa, por encima');
});

test('al abrir la página se cargan y se pintan sus imágenes', async () => {
  const n = await openTestNotebook(); closeNotebook();
  const pg = pages.get(n.pages[0]), o = await addTestImg(pg, { x: 300, y: 200, w: 400, h: 300 });
  savePageNow(pg); await waitWrites(); pages.clear(); bgCache.clear();
  openNotebook(n.id);
  for(let i = 0; i < 100 && !(page && bgCache.has(o.img)); i++) await sleep(20);
  await sleep(50); renderBg();
  assert(bluish(pixelAt('#cv-bg', 500, 350)), 'pintada: ' + pixelAt('#cv-bg', 500, 350));
});

test('foco: una página con más imágenes que BG_CACHE_MAX las tiene todas en caché', async () => {
  await openTestNotebook();
  for(let i = 0; i < BG_CACHE_MAX + 2; i++) await addTestImg(page, { x: 20 + i*40, y: 50, w: 30, h: 30 });
  await ensureImgs(page);
  assert(page.imgs.every(o => bgCache.has(o.img)), 'faltan imágenes de la página abierta en caché');
});

test('exportar la página en PNG y el cuaderno en PDF incluye la imagen', async () => {
  let blob = null, size = 0; window.saveFile = async (name, data) => { blob = data; size = data.size; };
  await openTestNotebook(); addPage(); await exportPDF(); const plain = size; closeNotebook();
  await openTestNotebook(); await addTestImg(page, { x: 300, y: 200, w: 400, h: 300 });
  await exportPNG();
  const bmp = await createImageBitmap(blob), c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0);
  const k = bmp.width / PW, p = [...c.getContext('2d').getImageData(500*k, 350*k, 1, 1).data];
  assert(bluish(p), 'PNG con la imagen: ' + p);
  addPage(); await addTestImg(pages.get(nb.pages[1]), { x: 100, y: 100, w: 800, h: 600 });
  await exportPDF();
  assert(size > plain * 1.5, 'PDF con imágenes ' + size + ' vs sin ellas ' + plain);
});
```

Ejecuta `node tests/run.mjs tests/img-render.test.js`. Esperado: FAIL (`ensureImgs is not defined`).

- [ ] **Paso 2: implementa.** Sustituye la función `ensureBg` entera (desde `async function ensureBg(pg){` hasta su `}` de cierre) por:

```js
// Asegura en caché la imagen `key`. Nunca expulsa ninguna imagen de la página abierta.
async function ensureImg(key){
  if(typeof key !== 'string') return;
  if(bgCache.has(key)){ const v = bgCache.get(key); bgCache.delete(key); bgCache.set(key, v); return; }
  let blob = null;
  try { blob = await backend.getImg(key); } catch(_){}
  if(!blob) return;
  let im = null;
  try { im = await decodeImg(blob); } catch(_){ return; }
  if(bgCache.has(key)){ if(im.close) im.close(); return; }
  bgCache.set(key, im);
  const keep = new Set(imgRefs(page));
  while(bgCache.size > BG_CACHE_MAX){
    const k = [...bgCache.keys()].find(x => !keep.has(x));
    if(k === undefined) break;
    const v = bgCache.get(k); bgCache.delete(k); if(v && v.close) v.close();
  }
}
async function ensureBg(pg){ if(pg && pg.bg) await ensureImg(pg.bg.img); }
async function ensureImgs(pg){ for(const k of imgRefs(pg)) await ensureImg(k); }
function drawImgs(ctx, pg, skip){
  for(const o of pageImgs(pg)){
    if(skip && skip.has(o.id)) continue;
    const im = bgCache.get(o.img); if(im) ctx.drawImage(im, o.x, o.y, o.w, o.h);
  }
}
```

En `renderPageCanvas`, después de `  drawBg(x, pg, Math.max(0.9, 1/k));`, añade `  drawImgs(x, pg);`.

En `renderBg`, sustituye `drawBg(c, page, 1/view.s); c.restore();` por:

```js
drawBg(c, page, 1/view.s); drawImgs(c, page, selection && selection.moving ? selection.imgIds : null); c.restore();
```

En `goPage`, sustituye la línea `  if(pg.bg && !bgCache.has(pg.bg.img)) ensureBg(pg).then(() => { if(page === pg) requestRender(); });` por:

```js
  if(imgRefs(pg).some(k => !bgCache.has(k))) ensureImgs(pg).then(() => { if(page === pg) requestRender(); });
```

En `pagesOverview`, `exportPNG` y `exportPDF`, sustituye cada `await ensureBg(` por `await ensureImgs(`. Son tres apariciones: `ensureBg(pg)`, `ensureBg(page)` y `ensureBg(pg)`.

- [ ] **Paso 3:** ejecuta `node tests/run.mjs tests/img-render.test.js tests/pdf-render.test.js` (las pruebas de diapositivas también deben pasar) y después `node tests/run.mjs` (esperado: `93 ok, 0 fallos`).

- [ ] **Paso 4: commit**

```bash
git add index.html tests/img-render.test.js
git commit -m "Imágenes: dibujarlas entre la diapositiva y la tinta, en miniaturas y exportación" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 3: insertar una imagen

**Archivos:** modificar `index.html` (input oculto, sección nueva y `editorMenu`); crear `tests/img-insert.test.js`.

**Interfaces:**
- Consume:
  - de la Tarea 1: `pageImgs`, `commitImgs`;
  - de la Tarea 2: `ensureImg`;
  - ya existentes: `backend.setImg`, `setTool`, `uid`, `clamp`, `view`, `SW`, `SH`, `PW`, `PH`, `toast`, `renderBg`, `requestLive`.
- Produce:
  - las constantes `IMG_MAX_PX`, `IMG_QUALITY` e `IMG_INSERT_FRAC`;
  - `prepareImage(file) → {blob, w, h}`, que lanza si no se puede leer;
  - `insertRect(pw, ph) → {x, y, w, h}`;
  - `selectImg(o)`;
  - `insertImageFile(file) → obj | null`;
  - `pickImage()` y el input `#img-file`.

- [ ] **Paso 1: prueba que debe fallar, `tests/img-insert.test.js`**

```js
test('insertar una foto la añade, la guarda, la selecciona y pasa al lazo', async () => {
  await openTestNotebook(); setTool('pen', true);
  const o = await insertImageFile(await imgFile(800, 600));
  assert(o, 'debe devolver la imagen');
  assertEq(page.imgs.map(x => x.id), [o.id]);
  assertEq(ui.tool, 'lasso');
  assert(selection && selection.imgIds.has(o.id) && selection.ids.size === 0, 'seleccionada');
  const blob = await backend.getImg(o.img); assert(blob && blob.type === 'image/jpeg', 'JPEG guardado');
  await waitWrites();
  assertEq((await IDB.get('page:' + page.id)).imgs.map(x => x.id), [o.id]);
});

test('posición: centrada en la zona visible, 600 como máximo, con proporciones y dentro de la página', async () => {
  await openTestNotebook();
  const o = await insertImageFile(await imgFile(800, 600));
  assert(Math.abs(o.w - 600) < 0.5 && Math.abs(o.h - 450) < 0.5, o.w + '×' + o.h);
  const cx = (SW/2 - view.tx)/view.s, cy = (SH/2 - view.ty)/view.s;
  assert(Math.abs(o.x + o.w/2 - cx) < 1 && Math.abs(o.y + o.h/2 - cy) < 1, 'centrada');
  assert(o.x >= 0 && o.y >= 0 && o.x + o.w <= PW && o.y + o.h <= PH, 'dentro de la página');
  const small = await insertImageFile(await imgFile(100, 80));
  assertEq([small.w, small.h], [100, 80]);
});

test('foco: una foto panorámica enorme se reduce con sus proporciones', async () => {
  await openTestNotebook();
  const o = await insertImageFile(await imgFile(8000, 1000));
  assert(Math.abs(o.w - 600) < 0.5 && Math.abs(o.h - 75) < 0.5, o.w + '×' + o.h);
});

test('un archivo que no es imagen avisa y no añade nada', async () => {
  await openTestNotebook();
  const r = await insertImageFile(new File(['hola'], 'nota.txt', { type: 'text/plain' }));
  assertEq(r, null); assertEq(pageImgs(page).length, 0);
  assertEq(document.querySelector('#toast').textContent, 'No se pudo abrir esa imagen.');
});

test('si no se puede guardar, avisa y no añade nada', async () => {
  await openTestNotebook();
  const orig = backend.setImg; backend.setImg = () => Promise.reject(new DOMException('x', 'UnknownError'));
  let r; try { r = await insertImageFile(await imgFile(400, 300)); } finally { backend.setImg = orig; }
  assertEq(r, null); assertEq(pageImgs(page).length, 0);
  assertEq(document.querySelector('#toast').textContent, 'No se pudo guardar la imagen.');
});

test('el menú de opciones ofrece «Insertar imagen»', async () => {
  await openTestNotebook(); editorMenu(); await sleep(50);
  assert(dialogButton('Insertar imagen'), 'falta la opción');
  await clickDialog('Listo');
});
```

Ejecuta `node tests/run.mjs tests/img-insert.test.js`. Esperado: FAIL (`insertImageFile is not defined`).

- [ ] **Paso 2: implementa.** En el HTML, después de `<input type="file" id="pdf-file" accept="application/pdf,.pdf" hidden>`, añade:

```html
        <input type="file" id="img-file" accept="image/*" hidden>
```

Inmediatamente después de la función `drawImgs` (Tarea 2), añade:

```js
/* Insertar imagen */
const IMG_MAX_PX = 2000, IMG_QUALITY = 0.85, IMG_INSERT_FRAC = 0.6;
// Lee la foto y la deja en JPEG sobre fondo blanco, como mucho de IMG_MAX_PX de lado. Lanza si no es una imagen.
async function prepareImage(file){
  const bmp = await createImageBitmap(file);
  try {
    const k = Math.min(1, IMG_MAX_PX / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width*k)), h = Math.max(1, Math.round(bmp.height*k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    try {
      const x = c.getContext('2d'); x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, w, h); x.drawImage(bmp, 0, 0, w, h);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', IMG_QUALITY));
      if(!blob) throw new Error('toBlob');
      return { blob, w, h };
    } finally { c.width = c.height = 0; }
  } finally { if(bmp.close) bmp.close(); }
}
// Dónde va una imagen nueva: centrada en la zona visible, lado mayor ≤ 60 % del ancho, nunca más grande que su tamaño natural, dentro de la página
function insertRect(pw, ph){
  const k = Math.min(1, (PW*IMG_INSERT_FRAC) / Math.max(pw, ph));
  const w = pw*k, h = ph*k;
  const cx = clamp((SW/2 - view.tx)/view.s, 0, PW), cy = clamp((SH/2 - view.ty)/view.s, 0, PH);
  return { x: clamp(cx - w/2, 0, Math.max(0, PW - w)), y: clamp(cy - h/2, 0, Math.max(0, PH - h)), w, h };
}
function selectImg(o){ selection = { ids: new Set(), imgIds: new Set([o.id]), bb: [o.x, o.y, o.x + o.w, o.y + o.h], dx: 0, dy: 0, moving: false }; }
async function insertImageFile(file){
  if(!page) return null;
  const pg = page;
  let prep;
  try { prep = await prepareImage(file); } catch(e){ toast('No se pudo abrir esa imagen.'); return null; }
  const key = uid();
  try { await backend.setImg(key, prep.blob); } catch(e){ toast('No se pudo guardar la imagen.'); return null; }
  if(page !== pg) return null;   // se cambió de página mientras tanto: los píxeles los recogerá la limpieza
  const o = Object.assign({ id: uid(), img: key }, insertRect(prep.w, prep.h));
  const prevImgs = pageImgs(pg);
  pg.imgs = [...prevImgs, o]; commitImgs(prevImgs);
  await ensureImg(key);
  setTool('lasso');
  selectImg(o);
  renderBg(); requestLive();
  return o;
}
function pickImage(){ const f = $('#img-file'); f.value = ''; f.click(); }
$('#img-file').onchange = e => { const f = e.target.files && e.target.files[0]; if(f) insertImageFile(f); };
```

En `editorMenu`, sustituye:

```js
    l.append(menuBtn(ICON.pdfIn, 'Añadir PDF al final', () => done('addpdf')));
```

por:

```js
    l.append(menuBtn(ICON.image, 'Insertar imagen', () => done('addimg')));
    l.append(menuBtn(ICON.pdfIn, 'Añadir PDF al final', () => done('addpdf')));
```

Y en la misma función, sustituye `  if(v === 'addpdf') pickPdf({ nb });` por:

```js
  if(v === 'addimg') pickImage();
  else if(v === 'addpdf') pickPdf({ nb });
```

- [ ] **Paso 3:** ejecuta `node tests/run.mjs tests/img-insert.test.js` (esperado: `6 ok`) y después `node tests/run.mjs` (esperado: `99 ok, 0 fallos`).

- [ ] **Paso 4: commit**

```bash
git add index.html tests/img-insert.test.js
git commit -m "Imágenes: insertar desde Fototeca, cámara o Archivos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 4: el lazo mueve, redimensiona, duplica y borra imágenes

**Archivos:** modificar `index.html` (`startTool` rama lasso, `onMove`, `finishAct` ramas lasso/move y la nueva resize, `abortAct`, `renderLive` y el clic del menú de selección); crear `tests/img-lasso.test.js`.

**Interfaces:**
- Consume:
  - de la Tarea 1: `pageImgs`, `commit(prevS, prevI)`, `commitImgs`;
  - de la Tarea 3: `selectImg`;
  - existentes: `inBB`, `pointInPoly`, `moved`, `bgCache`.
- Produce:
  - las constantes `HANDLE_HIT` e `IMG_MIN_SIDE`;
  - `selImgIds() → Set`;
  - `imgAt(x, y) → obj | null`;
  - `soleImg() → obj | null`;
  - `imgCorners(o)`;
  - `hitHandle(x, y) → 0..3 | -1`;
  - `resizeRect(o, h, px, py) → rect | null`;
  - la selección gana `imgIds` y `rect`, y hay una acción nueva `resize`.

- [ ] **Paso 1: prueba que debe fallar, `tests/img-lasso.test.js`**

```js
async function pageWithImg(rect = { x: 300, y: 200, w: 400, h: 300 }){
  await openTestNotebook();
  const o = await addTestImg(page, rect); await ensureImgs(page);
  setTool('lasso', true); renderBg();
  return o;
}
const img = id => page.imgs.find(o => o.id === id);

test('tocar una imagen con el lazo la selecciona; tocar fuera quita la selección', async () => {
  const o = await pageWithImg();
  await drawWithPointer([[500, 350], [500, 350]]);
  assert(selection && selection.imgIds.has(o.id), 'seleccionada');
  await drawWithPointer([[850, 560], [851, 560]]);
  assertEq(selection, null);
});

test('arrastrar una imagen la mueve y deshacer la devuelve', async () => {
  const o = await pageWithImg();
  await drawWithPointer(densify([[500, 350], [560, 390]]));
  assertEq([Math.round(img(o.id).x), Math.round(img(o.id).y)], [360, 240]);
  undo();
  assertEq([img(o.id).x, img(o.id).y], [300, 200]);
});

test('arrastrar una esquina redimensiona con proporciones y la esquina opuesta fija', async () => {
  const o = await pageWithImg();
  await drawWithPointer([[500, 350], [500, 350]]);           // seleccionar
  await drawWithPointer(densify([[700, 500], [800, 575]]));  // esquina inferior derecha
  const r = img(o.id);
  assertEq([r.x, r.y], [300, 200]);
  assert(Math.abs(r.w - 500) < 0.5 && Math.abs(r.h - 375) < 0.5, r.w + '×' + r.h);
  undo(); assertEq([img(o.id).w, img(o.id).h], [400, 300]);
});

test('foco: el tamaño mínimo es 40 y la imagen no puede sacar su centro de la página', async () => {
  const o = await pageWithImg();
  await drawWithPointer([[500, 350], [500, 350]]);
  await drawWithPointer(densify([[700, 500], [305, 205]]));
  const r = img(o.id);
  assert(Math.abs(Math.min(r.w, r.h) - 40) < 0.5, 'mínimo 40: ' + r.w + '×' + r.h);
  assertEq(resizeRect({ x: 900, y: 100, w: 80, h: 60 }, 2, 2000, 100), null);
});

test('el lazo selecciona trazos e imágenes a la vez y se mueven juntos en un solo paso', async () => {
  const o = await pageWithImg();
  page.strokes = [penStroke(densify([[200, 540], [280, 540]]))]; renderInk();
  const steps = H().u.length;
  await drawWithPointer(densify([[150, 150], [850, 150], [850, 580], [150, 580], [150, 152]]));
  assert(selection && selection.ids.size === 1 && selection.imgIds.has(o.id), 'selección mixta');
  await drawWithPointer(densify([[500, 350], [520, 360]]));
  assertEq([img(o.id).x, img(o.id).y], [320, 210]);
  assert(Math.abs(page.strokes[0].bb[0] - (200 - page.strokes[0].w*0.8) - 20) < 0.5, 'el trazo también se movió');
  assertEq(H().u.length, steps + 1);
  undo(); assertEq([img(o.id).x, img(o.id).y], [300, 200]);
});

test('Duplicar y Borrar del menú de selección funcionan con imágenes', async () => {
  const o = await pageWithImg();
  await drawWithPointer([[500, 350], [500, 350]]);
  document.querySelector('#selmenu [data-sel=dup]').click();
  assertEq(page.imgs.length, 2);
  assertEq(page.imgs[1].img, o.img);
  assertEq([page.imgs[1].x, page.imgs[1].y], [324, 224]);
  document.querySelector('#selmenu [data-sel=del]').click();
  assertEq(page.imgs.map(x => x.id), [o.id]);
  undo(); assertEq(page.imgs.length, 2);
});

test('pluma, goma y garabato no tocan las imágenes', async () => {
  await pageWithImg();
  const before = JSON.stringify(page.imgs);
  setTool('pen', true); await drawWithPointer(densify([[320, 300], [680, 310]]));
  setTool('eraser', true); await drawWithPointer(densify([[320, 300], [680, 310]]));
  setTool('pen', true); await drawWithPointer(zigzag(320, 280, 300, 40, 4));
  assertEq(JSON.stringify(page.imgs), before);
});

test('foco: tocar una imagen con la pluma escribe y no la selecciona', async () => {
  await pageWithImg(); setTool('pen', true);
  await drawWithPointer([[500, 350], [500, 350]]);
  assertEq(selection, null);
  assertEq(page.strokes.length, 1);
});
```

Ejecuta `node tests/run.mjs tests/img-lasso.test.js`. Esperado: FAIL.

- [ ] **Paso 2: utilidades.** Inmediatamente después de `function selectImg(o){ … }` (Tarea 3), añade:

```js
const HANDLE_HIT = 22, IMG_MIN_SIDE = 40;   // radio para tocar un tirador (px de pantalla) y lado mínimo (unidades)
function selImgIds(){ return (selection && selection.imgIds) || new Set(); }
function imgAt(x, y){
  const l = pageImgs(page);
  for(let i = l.length - 1; i >= 0; i--){ const o = l[i]; if(x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return o; }
  return null;
}
function soleImg(){
  if(!selection || selection.ids.size || selImgIds().size !== 1) return null;
  const id = [...selImgIds()][0];
  return pageImgs(page).find(o => o.id === id) || null;
}
function imgCorners(o){ return [[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]]; }
function hitHandle(x, y){
  const o = soleImg(); if(!o) return -1;
  const c = imgCorners(o);
  for(let i = 0; i < 4; i++) if(Math.hypot(x - c[i][0], y - c[i][1])*view.s <= HANDLE_HIT) return i;
  return -1;
}
// Rectángulo al arrastrar la esquina h (0 arriba-izq, 1 arriba-der, 2 abajo-der, 3 abajo-izq) hasta (px, py):
// la esquina opuesta queda fija, se mantienen las proporciones, lado mínimo IMG_MIN_SIDE; null si el centro saldría de la página
function resizeRect(o, h, px, py){
  const [ax, ay] = imgCorners(o)[(h + 2) % 4];
  let s = Math.max(Math.abs(px - ax)/o.w, Math.abs(py - ay)/o.h);
  s = Math.max(s, IMG_MIN_SIDE / Math.min(o.w, o.h));
  const w = o.w*s, hh = o.h*s;
  const r = { x: (h === 0 || h === 3) ? ax - w : ax, y: (h === 0 || h === 1) ? ay - hh : ay, w, h: hh };
  const cx = r.x + w/2, cy = r.y + hh/2;
  return (cx < 0 || cx > PW || cy < 0 || cy > PH) ? null : r;
}
```

- [ ] **Paso 3: `startTool`.** Sustituye la rama `} else if(tool === 'lasso'){ … }` (hasta su `}` de cierre, antes del `}` final de `startTool`) por:

```js
  } else if(tool === 'lasso'){
    const [x,y] = toPage(e);
    const h = hitHandle(x, y);
    if(h >= 0){
      const o = soleImg();
      act = { kind:'resize', pid:e.pointerId, ptype:e.pointerType, handle:h, id:o.id, orig:Object.assign({}, o) };
      selection.moving = true; selection.rect = { x:o.x, y:o.y, w:o.w, h:o.h }; renderBg(); requestLive();
    } else if(selection && inBB(selection.bb, x, y, 14/view.s)){
      act = { kind:'move', pid:e.pointerId, ptype:e.pointerType, x0:x, y0:y };
      selection.dx = 0; selection.dy = 0; selection.moving = true; renderBg(); renderInk(); requestLive();
    } else {
      const o = imgAt(x, y);
      if(o){
        selectImg(o);
        act = { kind:'move', pid:e.pointerId, ptype:e.pointerType, x0:x, y0:y };
        selection.moving = true; renderBg(); renderInk(); requestLive();
      } else {
        clearSelection();
        act = { kind:'lasso', pid:e.pointerId, ptype:e.pointerType }; lasso = [x, y];
      }
    }
  }
```

- [ ] **Paso 4: `onMove`.** Sustituye:

```js
  } else if(act.kind === 'move'){
    const [x,y] = toPage(e); selection.dx = x - act.x0; selection.dy = y - act.y0; requestLive();
  }
```

por:

```js
  } else if(act.kind === 'move'){
    const [x,y] = toPage(e); selection.dx = x - act.x0; selection.dy = y - act.y0; requestLive();
  } else if(act.kind === 'resize'){
    const [x,y] = toPage(e); const r = resizeRect(act.orig, act.handle, x, y); if(r) selection.rect = r; requestLive();
  }
```

- [ ] **Paso 5: `finishAct`.** En la rama lasso, sustituye `      if(ids.size) selection = { ids, bb, dx:0, dy:0, moving:false };` por:

```js
      const imgIds = new Set();
      for(const o of pageImgs(page)){
        if(!pointInPoly(o.x + o.w/2, o.y + o.h/2, poly)) continue;
        imgIds.add(o.id);
        bb = bb ? [Math.min(bb[0],o.x),Math.min(bb[1],o.y),Math.max(bb[2],o.x+o.w),Math.max(bb[3],o.y+o.h)] : [o.x, o.y, o.x+o.w, o.y+o.h];
      }
      if(ids.size || imgIds.size) selection = { ids, imgIds, bb, dx:0, dy:0, moving:false };
```

Sustituye la rama `} else if(a.kind === 'move'){ … }` entera (hasta su `}` justo antes del `}` final de `finishAct`) por:

```js
  } else if(a.kind === 'move'){
    const { dx, dy } = selection; selection.moving = false;
    if(Math.abs(dx) + Math.abs(dy) > 0.3){
      const prevS = page.strokes, prevI = pageImgs(page), im = selImgIds();
      page.strokes = prevS.map(s => selection.ids.has(s.id) ? moved(s, dx, dy) : s);
      if(im.size) page.imgs = prevI.map(o => im.has(o.id) ? Object.assign({}, o, { x: o.x + dx, y: o.y + dy }) : o);
      selection.bb = [selection.bb[0]+dx, selection.bb[1]+dy, selection.bb[2]+dx, selection.bb[3]+dy];
      commit(prevS, prevI);
    }
    selection.dx = 0; selection.dy = 0;
    renderBg(); renderInk(); requestLive();
  } else if(a.kind === 'resize'){
    const r = selection.rect, o = a.orig; selection.moving = false; selection.rect = null;
    if(r && Math.abs(r.x - o.x) + Math.abs(r.y - o.y) + Math.abs(r.w - o.w) > 0.3){
      const prevI = pageImgs(page);
      page.imgs = prevI.map(x => x.id === a.id ? Object.assign({}, x, r) : x);
      selection.bb = [r.x, r.y, r.x + r.w, r.y + r.h];
      commitImgs(prevI);
    }
    renderBg(); renderInk(); requestLive();
  }
```

- [ ] **Paso 6: `abortAct`.** Sustituye:

```js
  if(act.kind === 'move' && selection){ selection.moving = false; selection.dx = selection.dy = 0; renderInk(); }
```

por:

```js
  if(act.kind === 'move' && selection){ selection.moving = false; selection.dx = selection.dy = 0; renderBg(); renderInk(); }
  if(act.kind === 'resize' && selection){ selection.moving = false; selection.rect = null; renderBg(); }
```

- [ ] **Paso 7: `renderLive`.** Sustituye:

```js
    if(selection.moving){
      c.save(); clipPage(c); c.translate(dx, dy);
      for(const s of page.strokes) if(selection.ids.has(s.id)) drawStroke(c, s);
      c.restore();
    }
    const b = selection.bb, pad = 6/view.s;
    c.strokeStyle = accent();
    c.lineWidth = 1.5/view.s; c.setLineDash([6/view.s, 5/view.s]);
    c.strokeRect(b[0]+dx-pad, b[1]+dy-pad, b[2]-b[0]+2*pad, b[3]-b[1]+2*pad);
    c.setLineDash([]);
```

por:

```js
    const rr = selection.rect;
    if(selection.moving){
      c.save(); clipPage(c);
      if(rr){ const o = soleImg(), im = o && bgCache.get(o.img); if(im) c.drawImage(im, rr.x, rr.y, rr.w, rr.h); }
      else {
        c.translate(dx, dy);
        const im = selImgIds();
        for(const o of pageImgs(page)) if(im.has(o.id)){ const bm = bgCache.get(o.img); if(bm) c.drawImage(bm, o.x, o.y, o.w, o.h); }
        for(const s of page.strokes) if(selection.ids.has(s.id)) drawStroke(c, s);
      }
      c.restore();
    }
    const b = rr ? [rr.x, rr.y, rr.x + rr.w, rr.y + rr.h] : selection.bb, pad = 6/view.s;
    c.strokeStyle = accent();
    c.lineWidth = 1.5/view.s; c.setLineDash([6/view.s, 5/view.s]);
    c.strokeRect(b[0]+dx-pad, b[1]+dy-pad, b[2]-b[0]+2*pad, b[3]-b[1]+2*pad);
    c.setLineDash([]);
    const so = !selection.moving && soleImg();
    if(so){
      const hs = 10/view.s; c.fillStyle = '#FFFFFF'; c.lineWidth = 1.5/view.s;
      for(const [hx, hy] of imgCorners(so)){ c.fillRect(hx - hs/2, hy - hs/2, hs, hs); c.strokeRect(hx - hs/2, hy - hs/2, hs, hs); }
    }
```

- [ ] **Paso 8: menú de selección.** Sustituye el cuerpo del manejador `$('#selmenu').addEventListener('click', e => { … });` por:

```js
$('#selmenu').addEventListener('click', e => {
  const b = e.target.closest('button'); if(!b || !selection) return;
  const prevS = page.strokes, prevI = pageImgs(page), im = selImgIds();
  if(b.dataset.sel === 'del'){
    page.strokes = prevS.filter(s => !selection.ids.has(s.id));
    page.imgs = prevI.filter(o => !im.has(o.id)); selection = null;
  } else {
    const copies = prevS.filter(s => selection.ids.has(s.id)).map(s => { const c = moved(s, 24, 24); c.id = uid(); return c; });
    const icopies = prevI.filter(o => im.has(o.id)).map(o => Object.assign({}, o, { id: uid(), x: o.x + 24, y: o.y + 24 }));
    page.strokes = prevS.concat(copies); page.imgs = prevI.concat(icopies);
    const b0 = selection.bb;
    selection = { ids:new Set(copies.map(c => c.id)), imgIds:new Set(icopies.map(o => o.id)), bb:[b0[0]+24,b0[1]+24,b0[2]+24,b0[3]+24], dx:0, dy:0, moving:false };
  }
  commit(prevS, prevI); renderBg(); renderInk(); renderLive();
});
```

- [ ] **Paso 9:** ejecuta `node tests/run.mjs tests/img-lasso.test.js` (esperado: `8 ok`) y después `node tests/run.mjs` (esperado: `107 ok, 0 fallos`). Las pruebas existentes del lazo, el garabato y las carpetas deben seguir pasando.

- [ ] **Paso 10: revisión visual.** Con CDP en Edge sin interfaz, haz una captura de una página con una imagen seleccionada (tiradores visibles) y otra después de redimensionarla. Guárdalas en el espacio de trabajo `.superpowers/sdd/…` y descríbelas en el informe.

- [ ] **Paso 11: commit**

```bash
git add index.html tests/img-lasso.test.js
git commit -m "Imágenes: el lazo las selecciona, mueve, redimensiona, duplica y borra" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 5: limpieza de píxeles huérfanos y copias de seguridad

**Archivos:** modificar `index.html` (`IDB`, `localBackend`, `exportBackup`, `restoreBackup`, `init` y una sección nueva) y `tests/helpers.js`; crear `tests/img-gc-backup.test.js`.

**Interfaces:**
- Consume: `imgRefs` y `pageImgs` (Tarea 1); `hist`, `writer.busy()`, `hasDirty()` e `importing` (existentes).
- Produce:
  - `IDB.keys()`;
  - `backend.listImgs() → string[]`;
  - `collectImgGarbage(force) → número de imágenes borradas`;
  - `gcTimer`;
  - `restoring` (bandera mientras se restaura);
  - las constantes `IMG_GC_DELAY` e `IMG_GC_EVERY`.

- [ ] **Paso 1: que la limpieza automática no interfiera en las pruebas.** Al final de `tests/helpers.js`, añade:

```js
// La limpieza automática de imágenes huérfanas se programa al arrancar: en las pruebas se lanza a mano
if(typeof gcTimer !== 'undefined') clearTimeout(gcTimer);
```

- [ ] **Paso 2: prueba que debe fallar, `tests/img-gc-backup.test.js`**

```js
async function savedImgPage(){
  const n = await openTestNotebook();
  await backend.setImg('kbg', await noiseJpeg());
  page.bg = { img: 'kbg', x: 40, y: 40, w: 920, h: 517.5 };
  const o = await addTestImg(page);
  savePageNow(page); await waitWrites();
  return { n, o };
}

test('la limpieza borra los píxeles huérfanos y respeta diapositivas e imágenes en uso', async () => {
  const { o } = await savedImgPage();
  await backend.setImg('korphan', await noiseJpeg());
  assertEq(await collectImgGarbage(true), 1);
  assertEq(await backend.getImg('korphan'), undefined);
  assert(await backend.getImg('kbg') && await backend.getImg(o.img), 'las usadas siguen');
});

test('foco: la limpieza respeta las imágenes que el historial puede devolver', async () => {
  const { o } = await savedImgPage();
  await ensureImgs(page); setTool('lasso', true); selectImg(o); renderLive();
  document.querySelector('#selmenu [data-sel=del]').click(); await waitWrites();
  await backend.setImg('korphan', await noiseJpeg());
  assertEq(await collectImgGarbage(true), 1);   // borra la huérfana de verdad, no la que el historial puede devolver
  undo();
  assert(await backend.getImg(o.img), 'los píxeles siguen para deshacer');
  assertEq(page.imgs.map(x => x.id), [o.id]);
});

test('la limpieza no se repite antes de 24 h', async () => {
  await savedImgPage();
  await backend.setImg('korphan', await noiseJpeg());
  prefs().imgGcAt = Date.now();
  assertEq(await collectImgGarbage(false), 0);
  assert(await backend.getImg('korphan'), 'no debía borrar todavía');
});

test('la copia incluye las imágenes insertadas y se restaura idéntica', async () => {
  const { o } = await savedImgPage(); closeNotebook(); await waitWrites();
  let text = null; window.saveFile = async (name, data) => { text = await data.text(); };
  await exportBackup();
  const c = JSON.parse(text);
  assert(c.images[o.img] && c.images.kbg, 'la copia lleva las dos imágenes');
  await IDB.del('img:' + o.img);
  const p = restoreBackup(new File([text], 'copia.json')); await clickDialog('Restaurar'); await p; await waitWrites();
  const blob = await backend.getImg(o.img);
  assertEq(b64enc(new Uint8Array(await blob.arrayBuffer())), c.images[o.img]);
  assertEq((await loadPage(Object.keys(c.pages)[0], profile.notebooks[0].id)).imgs.map(x => x.id), [o.id]);
});

test('restaurar borra las imágenes insertadas de páginas que desaparecen', async () => {
  let empty = null; window.saveFile = async (name, data) => { empty = await data.text(); };
  await exportBackup();
  const { o } = await savedImgPage(); closeNotebook(); await waitWrites();
  const p = restoreBackup(new File([empty], 'vacia.json')); await clickDialog('Restaurar'); await p; await waitWrites();
  assertEq(await backend.getImg(o.img), undefined);
});
```

Ejecuta `node tests/run.mjs tests/img-gc-backup.test.js`. Esperado: FAIL (`collectImgGarbage is not defined`, etc.).

- [ ] **Paso 3: implementa.** En el objeto que devuelve `IDB` (después de `del: …`), añade:

```js
    keys: () => run('readonly', s => s.getAllKeys()),
```

En `localBackend`, después de `delImg: …`, añade:

```js
    listImgs: () => safe(async () => (await IDB.keys()).map(String).filter(k => k.startsWith('img:')).map(k => k.slice(4)),
      () => [...mem.keys()].filter(k => k.startsWith('img:')).map(k => k.slice(4))),
```

Justo antes del comentario de sección `Arranque`, añade:

```js
/* =========================================================
   Limpieza de imágenes huérfanas (como mucho una vez al día)
   ========================================================= */
const IMG_GC_DELAY = 5000, IMG_GC_EVERY = 24*3600*1000;
let gcTimer = 0, restoring = false;
// Borra los píxeles que no usa ninguna página ni ningún paso del historial de esta sesión
async function collectImgGarbage(force){
  if(!profile) return 0;
  if(!force && Date.now() - (prefs().imgGcAt || 0) < IMG_GC_EVERY) return 0;
  if(importing || restoring || writer.busy() || hasDirty()) return 0;
  const used = new Set();
  try {
    for(const n of profile.notebooks) for(const id of n.pages){
      const doc = pages.has(id) ? pages.get(id) : await backend.getPage(id);
      for(const k of imgRefs(doc)) used.add(k);
    }
  } catch(_){ return 0; }
  for(const h of hist.values()) for(const st of h.u.concat(h.r)) for(const o of (st && st.i) || []) used.add(o.img);
  let removed = 0;
  for(const k of await backend.listImgs()){
    if(used.has(k)) continue;
    try { await backend.delImg(k); removed++; } catch(_){ break; }
  }
  prefs().imgGcAt = Date.now(); saveProfileSoon();
  return removed;
}
```

En `init`, después de `  $('#boot').hidden = true;`, añade:

```js
  gcTimer = setTimeout(() => { collectImgGarbage(false).catch(() => {}); }, IMG_GC_DELAY);
```

En `exportBackup`, sustituye el bucle `for(const doc of Object.values(out.pages)){ … }` que rellena `out.images` por:

```js
  for(const doc of Object.values(out.pages)){
    for(const k of imgRefs(doc)){
      if(out.images[k]) continue;
      let blob = null;
      try { blob = await backend.getImg(k); } catch(_){}
      if(blob) out.images[k] = b64enc(new Uint8Array(await blob.arrayBuffer()));
    }
  }
```

En `restoreBackup`:
- Sustituye `  const keepImg = new Set(Object.values(o.pages).filter(d => d && d.bg).map(d => d.bg.img));` por `  const keepImg = new Set(Object.values(o.pages).flatMap(d => imgRefs(d)));`.
- Sustituye `      if(doc && doc.bg && !keepImg.has(doc.bg.img)) staleImg.push(doc.bg.img);` por `      for(const k of imgRefs(doc)) if(!keepImg.has(k)) staleImg.push(k);`.
- Sustituye `  await settleWrites();` (el de dentro de `restoreBackup`, justo después de la confirmación) por `  await settleWrites(); restoring = true;`.
- Sustituye `  } catch(e){ toast('No se pudo restaurar la copia.', 5000); return; }` por `  } catch(e){ restoring = false; toast('No se pudo restaurar la copia.', 5000); return; }`.
- Sustituye `  pages.clear(); hist.clear();` por `  restoring = false; pages.clear(); hist.clear();`.

- [ ] **Paso 4:** ejecuta `node tests/run.mjs tests/img-gc-backup.test.js` (esperado: `5 ok`), `node tests/run.mjs tests/pdf-backup.test.js` (las copias con diapositivas también) y después `node tests/run.mjs` (esperado: `112 ok, 0 fallos`).

- [ ] **Paso 5: commit**

```bash
git add index.html tests/helpers.js tests/img-gc-backup.test.js
git commit -m "Imágenes: limpieza diaria de píxeles huérfanos y copias con imágenes insertadas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 6: versión v8

**Archivos:** modificar `sw.js:3` y `README.md`.

- [ ] **Paso 1:**
  - En `sw.js`, cambia `const VERSION = 'v7';` por `const VERSION = 'v8';`.
  - En `README.md`, el ejemplo «(por ejemplo, de `v7` a `v8`)» pasa a «(por ejemplo, de `v8` a `v9`)».
  - Debajo de la línea «Importa diapositivas en PDF y escribe encima.», añade: `Inserta fotos en las páginas y muévelas o cámbialas de tamaño con el lazo.`
- [ ] **Paso 2:** ejecuta `node tests/run.mjs`. Esperado: `112 ok, 0 fallos`.
- [ ] **Paso 3:** ejecuta `node .superpowers/sdd/2026-10-16-carpetas-garabato/offline_test.mjs C:/Users/34669/Documents/cuaderno`. Esperado: cachés `cuaderno-app-v8`, y en la última línea `"arranca":true` y `"controlada":true`.
- [ ] **Paso 4: commit**

```bash
git add sw.js README.md
git commit -m "Versión v8: insertar imágenes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Paso 5: PARA.** El push espera al sí del usuario.
