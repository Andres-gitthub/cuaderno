# Carpetas y garabatear para borrar: plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usa superpowers:subagent-driven-development (recomendada) o superpowers:executing-plans para ejecutar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** añadir a la PWA Cuaderno carpetas de un nivel en la biblioteca y «garabatear para borrar» con la pluma.

**Arquitectura:** todo vive en `index.html` (HTML, CSS y JS inline, sin build).
- Las carpetas son datos del perfil: `profile.folders` y `notebook.folder`. La biblioteca tiene una vista raíz y una vista de carpeta, controladas por la variable `curFolder`.
- El garabato se evalúa al terminar un trazo de pluma, mediante un único gancho en la rama `draw` de `finishAct`. Las funciones de reconocimiento son puras y se prueban aparte.
- Las pruebas se ejecutan **dentro de la app real**: `tests/run.mjs` levanta `python -m http.server` y un Edge sin interfaz, y controla Edge por CDP (Node 24 trae `WebSocket` nativo, así que no hay que instalar nada).

**Tecnología:** JS plano en el navegador; Node 24 (solo para el ejecutor de pruebas); Python 3 (`http.server`); Microsoft Edge o Chrome.

**Spec:** `docs/superpowers/specs/2026-10-16-carpetas-garabato-design.md`. Léela antes de empezar.

## Restricciones globales

- Sin frameworks, sin dependencias nuevas y sin paso de build. Ni `npm install` ni `package.json`.
- No cambia el formato de las páginas en IndexedDB ni el de los trazos (`encStroke`/`decStroke`). Las copias antiguas se restauran sin conversión.
- `profile.v` sigue siendo `1`.
- Motor de dibujo: el único cambio es una línea en la rama `draw` de `finishAct` (Tarea 5). No toques `penPath`, `addPoint`, `onDown`/`onMove`/`onUp`, `startGesture`, `renderBg`/`renderInk`/`renderLive` ni `drawPaper`.
- Todo texto que venga del usuario (nombres de carpeta o de cuaderno) se pinta con `textContent`, nunca con `innerHTML`.
- Constantes exactas del garabato: `SCRIBBLE_MIN_PTS = 12`, `SCRIBBLE_MIN_REVERSALS = 4`, `SCRIBBLE_MIN_SWING = 8`, `SCRIBBLE_SWING_FRAC = 0.35`, `SCRIBBLE_MIN_DENSITY = 2.5`, `SCRIBBLE_PAD = 4`, `SCRIBBLE_COVER = 0.6`.
- El garabato solo se evalúa con la pluma (`cur.t === 'pen'`) y si `prefs().scribbleErase !== false`.
- Textos en español, con el mismo tono que el resto de la app.
- Commits pequeños, uno por tarea. Cada mensaje termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **No hagas `git push`** hasta la Tarea 6, y solo con el visto bueno del usuario.

## Foco de revisión

Estos son los casos que la spec implica pero no prueba de forma explícita. Cada uno tiene su prueba en la tarea indicada:

1. **Un cuaderno apunta a una carpeta que ya no existe** (dato antiguo o corrupto). Se muestra en la raíz, y moverlo sigue funcionando. → Tarea 2
2. **Se restaura una copia mientras se está viendo una carpeta.** La vista vuelve a la raíz, sin quedarse en una carpeta inexistente. → Tarea 3
3. **Un nombre de carpeta contiene HTML**, por ejemplo `<img src=x onerror=…>`. Se muestra literal y no se inserta ningún elemento. → Tarea 3
4. **Trazos degenerados** (un punto, dos puntos, 12 puntos idénticos o una recta). `isScribble` devuelve `false` sin lanzar errores y sin dividir por cero. → Tarea 4
5. **Se garabatea mientras hay una selección de lazo activa.** La selección se limpia y no quedan ids de trazos borrados. → Tarea 5

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `index.html` (modificar) | La app: datos de carpetas, interfaz de biblioteca, reconocimiento del garabato y su gancho |
| `sw.js` (modificar, Tarea 6) | `VERSION` de `v1` a `v2` |
| `tests/run.mjs` (crear) | Ejecutor: servidor + Edge sin interfaz + CDP; deja la app limpia en cada prueba |
| `tests/helpers.js` (crear) | Utilidades que se inyectan en la página: `test`, aserciones, trazos sintéticos, diálogos |
| `tests/smoke.test.js` (crear) | Línea base: dibujar y guardar; copia de ida y vuelta |
| `tests/folders-data.test.js` (crear) | Modelo de carpetas |
| `tests/folders-ui.test.js` (crear) | Biblioteca con carpetas |
| `tests/scribble-detect.test.js` (crear) | Reconocimiento del garabato (funciones puras) |
| `tests/scribble-erase.test.js` (crear) | Borrado por garabato integrado en el editor |

Para ejecutar las pruebas, desde la raíz del repo:

```bash
node tests/run.mjs
```

Para ejecutar un solo archivo:

```bash
node tests/run.mjs tests/scribble-detect.test.js
```

---

### Tarea 1: ejecutor de pruebas y línea base

**Archivos:**
- Crear: `tests/run.mjs`, `tests/helpers.js`, `tests/smoke.test.js`

**Interfaces:**
- Consume (de la app ya existente, globales de `index.html`): `makeStroke(t, c, w, pts, id?)`, `openNotebook(id)`, `closeNotebook()`, `page`, `pages`, `profile`, `view`, `uid()`, `sleep(ms)`, `saveProfile()`, `savePageNow(pg)`, `flushAll()`, `writer.busy()`, `IDB.get(k)`, `exportBackup()`, `restoreBackup(file)`, `setTool(t, silent)`.
- Produce (globales en la página, para todas las pruebas): `test(name, fn)`, `assert(cond, msg)`, `assertEq(a, b, msg)`, `waitWrites()`, `flat(xy) → number[]`, `densify(corners, step=3) → [x,y][]`, `penStroke(xy, t='pen') → stroke`, `zigzag(x, y, w, h, passes=6) → [x,y][]`, `word(x, y, w, letters=5) → stroke[]`, `cursiveM(x, y, humps=4) → [x,y][]`, `cursiveW(x, y, humps=4) → [x,y][]`, `openTestNotebook(strokes=[]) → notebook`, `drawWithPointer(xy, pointerType='mouse')`, `dialogButton(label)`, `clickDialog(label)`, `typeDialog(text)`, `idbSnapshot() → string`.

- [ ] **Paso 1: crea `tests/run.mjs`**

```js
// Ejecuta las pruebas de tests/*.test.js dentro de la app real (Edge sin interfaz + CDP).
// Cada prueba arranca con la app recién cargada y el almacenamiento vacío.
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8123, DBG = 9335, ORIGIN = `http://localhost:${PORT}`, URL = ORIGIN + '/index.html';
const browser = [process.env.EDGE,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean).find(p => existsSync(p));
if(!browser){ console.error('No encuentro Edge ni Chrome. Indica la ruta en la variable EDGE.'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const args = process.argv.slice(2);
const files = args.length ? args : readdirSync(join(ROOT, 'tests')).filter(f => f.endsWith('.test.js')).sort().map(f => join('tests', f));
const helpers = readFileSync(join(ROOT, 'tests', 'helpers.js'), 'utf8');

const server = spawn('python', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
const edge = spawn(browser, ['--headless=new', `--remote-debugging-port=${DBG}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'cuaderno-tests-'))}`, '--no-first-run', '--window-size=1200,900', 'about:blank'], { stdio: 'ignore' });

let ws, seq = 0; const pend = new Map();
const send = (method, params = {}) => new Promise(res => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
async function evaluate(expression){
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if(r.error) throw new Error(r.error.message);
  if(r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result.result.value;
}
async function waitFor(expr, ms = 10000){
  const t0 = Date.now();
  while(Date.now() - t0 < ms){ try { if(await evaluate(expr)) return; } catch {} await sleep(50); }
  throw new Error('Tiempo agotado esperando: ' + expr);
}
async function freshApp(){
  await send('Page.navigate', { url: 'about:blank' }); await sleep(50);
  await send('Storage.clearDataForOrigin', { origin: ORIGIN, storageTypes: 'indexeddb,local_storage,cache_storage,service_workers' });
  await send('Page.navigate', { url: URL });
  await waitFor(`!!document.querySelector('#boot') && document.querySelector('#boot').hidden`);
  await evaluate(helpers);
}

let pass = 0, fail = 0;
try {
  let targets;
  for(let i = 0; i < 50 && !targets; i++){ try { targets = await (await fetch(`http://127.0.0.1:${DBG}/json`)).json(); } catch { await sleep(200); } }
  for(let i = 0; i < 50; i++){ try { await fetch(URL); break; } catch { await sleep(200); } }
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  ws.onmessage = m => { const d = JSON.parse(m.data); if(d.id && pend.has(d.id)){ pend.get(d.id)(d); pend.delete(d.id); } };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.setBypassServiceWorker', { bypass: true }); // las pruebas siempre ven el index.html del disco

  for(const f of files){
    const src = readFileSync(resolve(ROOT, f), 'utf8');
    console.log(f);
    await freshApp();
    const names = await evaluate(`(() => { window.__tests = []; ${src}\n; return __tests.map(t => t[0]); })()`);
    for(let i = 0; i < names.length; i++){
      await freshApp();
      try {
        await evaluate(`(async () => { window.__tests = []; ${src}\n; await __tests[${i}][1](); })()`);
        pass++; console.log('  ok   ' + names[i]);
      } catch(e){ fail++; console.log('  FAIL ' + names[i] + '\n       ' + String(e.message).split('\n')[0]); }
    }
  }
} catch(e){ fail++; console.log('ERROR del ejecutor: ' + e.message); }
finally {
  console.log(`\n${pass} ok, ${fail} fallos`);
  try { ws && ws.close(); } catch {}
  edge.kill(); server.kill();
  process.exit(fail ? 1 : 0);
}
```

- [ ] **Paso 2: crea `tests/helpers.js`**

```js
// Utilidades de prueba. El ejecutor las evalúa dentro de la página de la app antes de cada prueba.
window.test = (name, fn) => window.__tests.push([name, fn]);
window.assert = (cond, msg) => { if(!cond) throw new Error(msg || 'la aserción falló'); };
window.assertEq = (a, b, msg) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if(A !== B) throw new Error((msg ? msg + ': ' : '') + A + ' !== ' + B);
};
// Espera a que se escriba todo lo pendiente en IndexedDB
window.waitWrites = async () => { flushAll(); await sleep(0); while(writer.busy()) await sleep(20); };

// ---- Trazos sintéticos (coordenadas de página: 1000 × 1414) ----
window.flat = xy => { const P = []; for(const [x, y] of xy) P.push(x, y, 0.5); return P; };
window.densify = (corners, step = 3) => {
  const out = [];
  for(let i = 0; i < corners.length - 1; i++){
    const [x0, y0] = corners[i], [x1, y1] = corners[i+1];
    const k = Math.max(1, Math.ceil(Math.hypot(x1-x0, y1-y0) / step));
    for(let j = 0; j < k; j++) out.push([x0 + (x1-x0)*j/k, y0 + (y1-y0)*j/k]);
  }
  out.push(corners[corners.length-1]);
  return out;
};
window.penStroke = (xy, t = 'pen') => makeStroke(t, t === 'hl' ? '#FFE14D' : '#1B1F27', t === 'hl' ? 20 : 2.8, Float32Array.from(flat(xy)));
// Garabato horizontal: `passes` pasadas de ida y vuelta entre x y x+w, bajando de y a y+h
window.zigzag = (x, y, w, h, passes = 6) => {
  const c = []; for(let i = 0; i <= passes; i++) c.push([i % 2 ? x + w : x, y + h*i/passes]);
  return densify(c);
};
// «Palabra»: `letters` trazos cortos en forma de ∧ dentro de [x, x+w] × [y, y+20]
window.word = (x, y, w, letters = 5) => {
  const out = [], lw = w / letters;
  for(let i = 0; i < letters; i++){
    const x0 = x + i*lw;
    out.push(penStroke(densify([[x0, y+20], [x0 + lw*0.5, y], [x0 + lw*0.8, y+20]])));
  }
  return out;
};
// «mmmm» y «wwww» en cursiva: arcos que avanzan hacia la derecha
window.cursiveM = (x, y, humps = 4, hw = 14, hh = 18) => {
  const c = [[x, y+hh]]; for(let i = 0; i < humps; i++){ c.push([x + i*hw + hw*0.5, y]); c.push([x + (i+1)*hw, y+hh]); }
  return densify(c, 2);
};
window.cursiveW = (x, y, humps = 4, hw = 14, hh = 18) => {
  const c = [[x, y]]; for(let i = 0; i < humps; i++){ c.push([x + i*hw + hw*0.5, y+hh]); c.push([x + (i+1)*hw, y]); }
  return densify(c, 2);
};

// ---- Editor ----
window.openTestNotebook = async (strokes = []) => {
  const pid = uid();
  const n = { id: uid(), title: 'Prueba', cover: '#3A3F47', paper: 'blank', paperColor: 'white', pages: [pid], created: Date.now(), updated: Date.now(), lastPage: 0 };
  profile.notebooks.unshift(n);
  pages.set(pid, { id: pid, nb: n.id, strokes });
  savePageNow(pages.get(pid));   // que la página exista también en IndexedDB, como si se hubiera dibujado
  saveProfile(); openNotebook(n.id);
  for(let i = 0; i < 200 && !page; i++) await sleep(20);
  assert(page, 'la página no llegó a abrirse');
  setTool('pen', true);
  return n;
};
// Dibuja con eventos de puntero reales sobre el lienzo; xy en coordenadas de página
window.drawWithPointer = async (xy, pointerType = 'mouse') => {
  const st = document.querySelector('#stage'), r = st.getBoundingClientRect();
  const fire = (type, [x, y]) => st.dispatchEvent(new PointerEvent(type, {
    pointerId: 7, pointerType, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure: 0.5,
    clientX: r.left + view.tx + x*view.s, clientY: r.top + view.ty + y*view.s, bubbles: true, cancelable: true }));
  fire('pointerdown', xy[0]);
  for(const p of xy.slice(1)) fire('pointermove', p);
  fire('pointerup', xy[xy.length-1]);
  await sleep(20);
};

// ---- Diálogos ----
window.dialogButton = label => [...document.querySelectorAll('#dlg button')].find(b => b.textContent.trim() === label);
window.clickDialog = async label => {
  for(let i = 0; i < 100 && !dialogButton(label); i++) await sleep(20);
  const b = dialogButton(label); assert(b, 'no hay botón «' + label + '» en el diálogo');
  b.click(); await sleep(30);
};
window.typeDialog = async text => {
  for(let i = 0; i < 100 && !document.querySelector('#dlg input.field'); i++) await sleep(20);
  document.querySelector('#dlg input.field').value = text;
};

// ---- Estado guardado ----
window.idbSnapshot = async () => {
  const P = await IDB.get('profile'), out = { profile: P, pages: {} };
  for(const n of P.notebooks) for(const id of n.pages) out.pages[id] = (await IDB.get('page:' + id)) || null;
  return JSON.stringify(out);
};
```

- [ ] **Paso 3: crea `tests/smoke.test.js`**

```js
test('un trazo dibujado con el puntero se guarda en IndexedDB', async () => {
  const n = await openTestNotebook();
  await drawWithPointer(densify([[200, 300], [400, 320], [600, 300]]));
  assertEq(page.strokes.length, 1, 'trazos en la página');
  await waitWrites();
  const d = await IDB.get('page:' + n.pages[0]);
  assertEq(d.strokes.length, 1, 'trazos guardados');
});

test('copia de seguridad: exportar y restaurar deja todo idéntico', async () => {
  await openTestNotebook([penStroke(densify([[100, 100], [300, 150]]))]);
  closeNotebook(); await waitWrites();
  const before = await idbSnapshot();
  let saved = null;
  window.saveFile = async (name, data) => { saved = await data.text(); };
  await exportBackup();
  assert(saved, 'no se generó la copia');
  const p = restoreBackup(new File([saved], 'copia.json'));
  await clickDialog('Restaurar'); await p;
  assertEq(await idbSnapshot(), before, 'perfil y páginas tras restaurar');
});
```

- [ ] **Paso 4: ejecuta las pruebas de línea base**

Ejecuta: `node tests/run.mjs tests/smoke.test.js`
Esperado: `2 ok, 0 fallos`. Las dos prueban comportamiento que ya existe; si fallan, el fallo está en el ejecutor o en las utilidades, no en la app. Arréglalo antes de seguir.

- [ ] **Paso 5: commit**

```bash
git add tests/run.mjs tests/helpers.js tests/smoke.test.js
git commit -m "Pruebas: ejecutor en Edge sin interfaz y línea base" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 2: modelo de datos de carpetas

**Archivos:**
- Modificar: `index.html`. En concreto: `defaultProfile`, `init`, `restoreBackup` y una sección nueva «Carpetas» justo antes de la línea `/* Garabatear para borrar */` o, si aún no existe, justo antes del comentario de sección `Biblioteca`.
- Crear: `tests/folders-data.test.js`

**Interfaces:**
- Consume: `profile`, `uid()`, `saveProfile()`, `restoreBackup(file)` (Tarea 1 / existente).
- Produce:
  - `normalizeProfile(p) → profile`: garantiza `notebooks`, `prefs` y `folders`.
  - `folderById(id) → folder | null`
  - `folderOf(n) → id | null`: devuelve `null` si la carpeta no existe.
  - `notebooksIn(folderId | null) → notebook[]`
  - `createFolder(name) → folder`
  - `renameFolder(id, name)`
  - `deleteFolder(id)`
  - `moveNotebook(n, folderId | null)`

- [ ] **Paso 1: escribe las pruebas que deben fallar, en `tests/folders-data.test.js`**

```js
test('normalizeProfile añade folders a un perfil antiguo y respeta los existentes', async () => {
  const old = normalizeProfile({ v: 1, notebooks: [], prefs: {} });
  assertEq(old.folders, []);
  const keep = normalizeProfile({ v: 1, notebooks: [], prefs: {}, folders: [{ id: 'a', name: 'A', created: 1 }] });
  assertEq(keep.folders.length, 1);
  const bad = normalizeProfile(null);
  assertEq([bad.notebooks, bad.folders], [[], []]);
});

test('crear, renombrar y eliminar una carpeta; sus cuadernos pasan a la raíz sin borrarse', async () => {
  const n = await openTestNotebook([penStroke(densify([[100, 100], [200, 100]]))]);
  closeNotebook();
  const f = createFolder('Física');
  assertEq(profile.folders.map(x => x.name), ['Física']);
  renameFolder(f.id, 'Física II');
  assertEq(folderById(f.id).name, 'Física II');
  moveNotebook(n, f.id);
  assertEq(notebooksIn(f.id).map(x => x.id), [n.id]);
  assertEq(notebooksIn(null).length, 0);
  deleteFolder(f.id);
  assertEq(profile.folders, []);
  assertEq(notebooksIn(null).map(x => x.id), [n.id]);
  assert(!('folder' in n), 'el cuaderno conserva el campo folder');
  await waitWrites();
  const d = await IDB.get('page:' + n.pages[0]);
  assertEq(d.strokes.length, 1, 'la página sigue intacta');
});

test('mover a carpeta y de vuelta; mover a una carpeta inexistente deja el cuaderno en la raíz', async () => {
  const n = await openTestNotebook(); closeNotebook();
  const f = createFolder('Química');
  moveNotebook(n, f.id); assertEq(folderOf(n), f.id);
  moveNotebook(n, null); assertEq(folderOf(n), null);
  moveNotebook(n, 'no-existe'); assertEq(folderOf(n), null);
  assert(!('folder' in n), 'no debe guardar un id de carpeta inexistente');
});

test('foco: un cuaderno que apunta a una carpeta inexistente se muestra en la raíz y se puede mover', async () => {
  const n = await openTestNotebook(); closeNotebook();
  n.folder = 'borrada';
  assertEq(folderOf(n), null);
  assertEq(notebooksIn(null).map(x => x.id), [n.id]);
  const f = createFolder('Mates');
  moveNotebook(n, f.id);
  assertEq(notebooksIn(f.id).map(x => x.id), [n.id]);
});

test('las carpetas se guardan en el perfil de IndexedDB', async () => {
  const f = createFolder('Historia');
  await waitWrites();
  const P = await IDB.get('profile');
  assertEq(P.folders.map(x => x.id), [f.id]);
});

test('restaurar una copia antigua sin carpetas: todo en la raíz y sin errores', async () => {
  createFolder('Se va a sustituir'); await waitWrites();
  const old = { app: 'cuaderno-copia', v: 1, exported: '2026-10-16T10:00:00.000Z',
    profile: { v: 1, prefs: {}, notebooks: [{ id: 'nb1', title: 'Viejo', cover: '#3A3F47', paper: 'lined', paperColor: 'white', pages: ['p1'], created: 1, updated: 2, lastPage: 0 }] },
    pages: { p1: { nb: 'nb1', strokes: [], updated: 2 } } };
  const p = restoreBackup(new File([JSON.stringify(old)], 'vieja.json'));
  await clickDialog('Restaurar'); await p;
  assertEq(profile.folders, []);
  assertEq(notebooksIn(null).map(x => x.id), ['nb1']);
});

test('una copia con carpetas se restaura idéntica', async () => {
  const n = await openTestNotebook([penStroke(densify([[100, 100], [300, 150]]))]); closeNotebook();
  moveNotebook(n, createFolder('Física').id);
  await waitWrites();
  const before = await idbSnapshot();
  let saved = null; window.saveFile = async (name, data) => { saved = await data.text(); };
  await exportBackup();
  const p = restoreBackup(new File([saved], 'copia.json'));
  await clickDialog('Restaurar'); await p;
  assertEq(await idbSnapshot(), before);
  assertEq(folderOf(profile.notebooks[0]), profile.folders[0].id);
});
```

- [ ] **Paso 2: comprueba que fallan**

Ejecuta: `node tests/run.mjs tests/folders-data.test.js`
Esperado: FAIL en todas, con mensajes como `normalizeProfile is not defined` o `createFolder is not defined`.

- [ ] **Paso 3: implementa**

En `index.html`, cambia `defaultProfile` por:

```js
function defaultProfile(){ return { v:1, notebooks:[], folders:[], prefs:{} }; }
```

Justo antes del comentario de sección

```js
/* =========================================================
   Biblioteca
   ========================================================= */
```

añade:

```js
/* =========================================================
   Carpetas (un solo nivel; viven en el perfil)
   ========================================================= */
function normalizeProfile(p){
  const prof = p && Array.isArray(p.notebooks) ? p : defaultProfile();
  prof.prefs = prof.prefs || {};
  prof.folders = Array.isArray(prof.folders) ? prof.folders : [];
  return prof;
}
function folderById(id){ return id ? profile.folders.find(f => f.id === id) || null : null; }
function folderOf(n){ return folderById(n.folder) ? n.folder : null; }
function notebooksIn(folderId){ return profile.notebooks.filter(n => folderOf(n) === (folderId || null)); }
function createFolder(name){
  const f = { id: uid(), name, created: Date.now() };
  profile.folders.push(f); saveProfile(); return f;
}
function renameFolder(id, name){ const f = folderById(id); if(!f) return; f.name = name; saveProfile(); }
function deleteFolder(id){
  for(const n of profile.notebooks) if(n.folder === id) delete n.folder;
  profile.folders = profile.folders.filter(f => f.id !== id);
  saveProfile();
}
function moveNotebook(n, folderId){
  if(folderId && folderById(folderId)) n.folder = folderId; else delete n.folder;
  saveProfile();
}
```

En `init()`, sustituye estas dos líneas:

```js
  profile = p && Array.isArray(p.notebooks) ? p : defaultProfile();
  profile.prefs = profile.prefs || {};
```

por:

```js
  profile = normalizeProfile(p);
```

En `restoreBackup`, sustituye:

```js
  profile = o.profile; profile.prefs = profile.prefs || {};
```

por:

```js
  profile = normalizeProfile(o.profile);
```

- [ ] **Paso 4: comprueba que pasan, y que la línea base sigue bien**

Ejecuta: `node tests/run.mjs tests/folders-data.test.js tests/smoke.test.js`
Esperado: `9 ok, 0 fallos`.

- [ ] **Paso 5: commit**

```bash
git add index.html tests/folders-data.test.js
git commit -m "Carpetas: modelo de datos en el perfil" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 3: biblioteca con carpetas

**Archivos:**
- Modificar: `index.html`. Se tocan: los tokens CSS de `:root` y de los dos bloques oscuros, el CSS de la biblioteca, la cabecera `#library`, `ICON`, `renderLibrary`, `notebookActions`, `newNotebookFlow`, `restoreBackup` y las funciones nuevas de esta tarea.
- Crear: `tests/folders-ui.test.js`

**Interfaces:**
- Consume: todo lo que produce la Tarea 2, más `askText`, `confirmBox`, `modal`, `menuBtn`, `fmtDate` y `openNotebook`, que ya existen.
- Produce:
  - `curFolder` (variable global: id o `null`)
  - `folderCard(f) → HTMLElement`
  - `newFolderFlow()`, `folderActions(f)`, `moveNotebookFlow(n)`
  - `newNotebookFlow(folderId)`: antes no tenía parámetros.
  - `ICON.folder`, `ICON.folderPlus`
  - Elementos `#lib-title` y `#btn-lib-back`

- [ ] **Paso 1: escribe las pruebas que deben fallar, en `tests/folders-ui.test.js`**

```js
const cards = () => [...document.querySelectorAll('#grid .card')];
const folderLabels = () => [...document.querySelectorAll('#grid .folder .label')].map(e => e.textContent);
const notebookLabels = () => [...document.querySelectorAll('#grid .cover:not(.cover-new) .label')].map(e => e.textContent);
const cardByText = t => cards().find(c => c.textContent.includes(t));
async function seedNotebook(title, folderId){
  const n = await openTestNotebook(); n.title = title; closeNotebook();
  if(folderId) moveNotebook(n, folderId);
  renderLibrary(); return n;
}

test('la raíz muestra «Nueva carpeta» y las carpetas en orden alfabético con su recuento', async () => {
  const b = createFolder('Química'), a = createFolder('álgebra');
  await seedNotebook('Tema 1', b.id);
  renderLibrary();
  assert(cardByText('Nueva carpeta'), 'falta la tarjeta Nueva carpeta');
  assertEq(folderLabels(), ['álgebra', 'Química']);
  assert(cardByText('Química').textContent.includes('1 cuaderno'), 'falta el recuento');
  assertEq(notebookLabels(), [], 'los cuadernos de una carpeta no aparecen en la raíz');
});

test('abrir una carpeta muestra solo sus cuadernos y la vuelta a la raíz', async () => {
  const f = createFolder('Física');
  await seedNotebook('Dentro', f.id); await seedNotebook('Fuera');
  document.querySelector('#grid .folder').click();
  assertEq(curFolder, f.id);
  assertEq(document.querySelector('#lib-title').textContent, 'Física');
  assert(!document.querySelector('#btn-lib-back').hidden, 'falta el botón de volver');
  assertEq(notebookLabels(), ['Dentro']);
  assert(!cardByText('Nueva carpeta'), 'Nueva carpeta no debe salir dentro de una carpeta');
  document.querySelector('#btn-lib-back').click();
  assertEq(curFolder, null);
  assertEq(document.querySelector('#lib-title').textContent, 'Cuadernos');
  assert(document.querySelector('#btn-lib-back').hidden, 'el botón de volver debe ocultarse en la raíz');
});

test('crear una carpeta desde la tarjeta', async () => {
  cardByText('Nueva carpeta').click();
  await typeDialog('Economía'); await clickDialog('Crear');
  assertEq(profile.folders.map(f => f.name), ['Economía']);
  assertEq(folderLabels(), ['Economía']);
});

test('un cuaderno nuevo creado dentro de una carpeta se queda en ella y al cerrarlo se vuelve a la carpeta', async () => {
  const f = createFolder('Física'); curFolder = f.id; renderLibrary();
  cardByText('Nuevo cuaderno').click();
  await typeDialog('Cinemática'); await clickDialog('Crear cuaderno');
  for(let i = 0; i < 100 && !page; i++) await sleep(20);
  assertEq(folderOf(nb), f.id);
  closeNotebook();
  assertEq(document.querySelector('#lib-title').textContent, 'Física');
  assertEq(notebookLabels(), ['Cinemática']);
});

test('mover un cuaderno con el menú ⋯', async () => {
  const f = createFolder('Física');
  const n = await seedNotebook('Apuntes');
  document.querySelector('[aria-label="Opciones de Apuntes"]').click();
  await clickDialog('Mover a carpeta');
  await clickDialog('Física');
  assertEq(folderOf(n), f.id);
  assertEq(notebookLabels(), []);
});

test('«Mover a carpeta» no aparece si no hay carpetas', async () => {
  await seedNotebook('Solo');
  document.querySelector('[aria-label="Opciones de Solo"]').click();
  await sleep(50);
  assert(!dialogButton('Mover a carpeta'), 'no debería ofrecer mover');
  await clickDialog('Cerrar');
});

test('eliminar una carpeta avisa del recuento y deja sus cuadernos en la raíz', async () => {
  const f = createFolder('Física');
  await seedNotebook('A', f.id); await seedNotebook('B', f.id);
  renderLibrary();
  document.querySelector('[aria-label="Opciones de la carpeta Física"]').click();
  await clickDialog('Eliminar carpeta');
  await sleep(50);
  assert(document.querySelector('#dlg p').textContent.includes('Los 2 cuadernos que contiene pasarán a la biblioteca'), 'texto de confirmación');
  await clickDialog('Eliminar carpeta');
  assertEq(profile.folders, []);
  assertEq(notebookLabels().sort(), ['A', 'B']);
});

test('una carpeta vacía muestra su texto de ayuda', async () => {
  const f = createFolder('Vacía'); curFolder = f.id; renderLibrary();
  const e = document.querySelector('#empty');
  assert(!e.hidden, 'el texto debe verse');
  assert(e.textContent.startsWith('Esta carpeta está vacía.'), 'texto de carpeta vacía');
});

test('foco: un nombre de carpeta con HTML se muestra literal', async () => {
  const evil = '<img src=x onerror="window.__xss=1">';
  createFolder(evil); renderLibrary();
  assertEq(folderLabels(), [evil]);
  assert(!document.querySelector('#grid img'), 'se insertó un elemento img');
  await sleep(50);
  assert(!window.__xss, 'se ejecutó código');
});

test('foco: restaurar una copia mientras se ve una carpeta vuelve a la raíz', async () => {
  let saved = null; window.saveFile = async (name, data) => { saved = await data.text(); };
  await exportBackup();                       // copia sin carpetas
  const f = createFolder('Temporal'); curFolder = f.id; renderLibrary();
  const p = restoreBackup(new File([saved], 'copia.json'));
  await clickDialog('Restaurar'); await p;
  assertEq(curFolder, null);
  assertEq(document.querySelector('#lib-title').textContent, 'Cuadernos');
});
```

- [ ] **Paso 2: comprueba que fallan**

Ejecuta: `node tests/run.mjs tests/folders-ui.test.js`
Esperado: FAIL; por ejemplo, `curFolder is not defined` o falta `#lib-title`.

- [ ] **Paso 3: tokens y CSS**

En el bloque `:root{…}` del principio, justo después de `--card:#FFFFFF;`, añade:

```css
  --folder:#C9D2DE; --folder-tab:#B3BECC;
```

En los **dos** bloques oscuros (el de `@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){…} }` y el de `:root[data-theme="dark"]{…}`), justo después de `--card:#22262E;`, añade:

```css
    --folder:#3A414D; --folder-tab:#2E343E;
```

Después de la línea `.lib-actions{display:flex;gap:8px;flex-wrap:wrap}`, añade:

```css
.lib-back{margin:0 0 6px -12px;color:var(--accent)}
.lib-back[hidden]{display:none}
.folder{position:relative;display:block;width:100%;aspect-ratio:3/4;border:0;padding:0;background:transparent;transition:transform .15s ease}
.folder:active{transform:scale(.98)}
.folder::before{content:"";position:absolute;left:0;top:6%;width:44%;height:12%;background:var(--folder-tab);border-radius:9px 9px 0 0}
.folder::after{content:"";position:absolute;left:0;right:0;top:12%;bottom:0;background:var(--folder);border-radius:4px 10px 10px 10px;box-shadow:var(--shadow)}
.folder .label{position:absolute;z-index:1;left:12%;right:12%;top:44%;color:var(--ink);font-family:var(--book);font-weight:600;font-size:15px;line-height:1.25;text-align:center;
  overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;word-break:break-word}
.btn.block[aria-pressed="true"]{border-color:var(--accent);color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}
```

En `@media (prefers-reduced-motion: reduce){.toast,.cover{transition:none}}`, cambia el selector a `.toast,.cover,.folder`.

- [ ] **Paso 4: cabecera de la biblioteca**

Sustituye:

```html
      <div class="grow">
        <h1>Cuadernos</h1>
```

por:

```html
      <div class="grow">
        <button class="pill lib-back" id="btn-lib-back" hidden></button>
        <h1 id="lib-title">Cuadernos</h1>
```

- [ ] **Paso 5: iconos**

En `const ICON = {…}`, después de la línea `edit: …`, añade:

```js
  folder: S+'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  folderPlus: S+'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10.5v5M9.5 13h5"/></svg>',
```

- [ ] **Paso 6: `renderLibrary` y las funciones nuevas**

Sustituye `renderLibrary` entera, desde `function renderLibrary(){` hasta su `}` de cierre (justo antes de `async function notebookActions`), por:

```js
let curFolder = null;   // carpeta que se ve en la biblioteca; null = raíz
const EMPTY_ROOT = 'Todavía no tienes cuadernos. Crea uno, elige el papel y empieza a escribir con el Apple Pencil.';
const EMPTY_FOLDER = 'Esta carpeta está vacía. Crea un cuaderno aquí o mueve uno desde el menú ⋯ de cualquier cuaderno.';
function newCard(icon, text, fn){
  const b = document.createElement('button'); b.className = 'card';
  b.innerHTML = '<span class="cover cover-new">' + icon + '</span><span class="meta"><span class="txt"><span class="t"></span></span></span>';
  b.querySelector('.t').textContent = text; b.onclick = fn; return b;
}
function countText(k){ return k + (k === 1 ? ' cuaderno' : ' cuadernos'); }
function folderCard(f){
  const card = document.createElement('div'); card.className = 'card';
  const cov = document.createElement('button'); cov.className = 'folder';
  cov.setAttribute('aria-label', 'Abrir carpeta ' + f.name);
  const lab = document.createElement('span'); lab.className = 'label'; lab.textContent = f.name;
  cov.append(lab); cov.onclick = () => { curFolder = f.id; renderLibrary(); };
  const meta = document.createElement('div'); meta.className = 'meta';
  const txt = document.createElement('div'); txt.className = 'txt';
  const t = document.createElement('div'); t.className = 't'; t.textContent = f.name;
  const d = document.createElement('div'); d.className = 'd'; d.textContent = countText(notebooksIn(f.id).length);
  txt.append(t, d);
  const more = document.createElement('button'); more.className = 'ib sm'; more.innerHTML = ICON.more;
  more.setAttribute('aria-label', 'Opciones de la carpeta ' + f.name);
  more.onclick = () => folderActions(f);
  meta.append(txt, more); card.append(cov, meta);
  return card;
}
function renderLibrary(){
  if(curFolder && !folderById(curFolder)) curFolder = null;
  const folder = folderById(curFolder);
  $('#lib-title').textContent = folder ? folder.name : 'Cuadernos';
  $('#btn-lib-back').hidden = !folder;
  const g = $('#grid'); g.textContent = '';
  g.append(newCard(ICON.plus, 'Nuevo cuaderno', () => newNotebookFlow(curFolder)));
  if(!folder){
    g.append(newCard(ICON.folderPlus, 'Nueva carpeta', newFolderFlow));
    for(const f of [...profile.folders].sort((a, b) => a.name.localeCompare(b.name, 'es'))) g.append(folderCard(f));
  }
  const list = notebooksIn(curFolder).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  for(const n of list){
    const card = document.createElement('div'); card.className = 'card';
    const cov = document.createElement('button'); cov.className = 'cover';
    cov.style.setProperty('--c', n.cover); cov.setAttribute('aria-label', 'Abrir ' + n.title);
    const lab = document.createElement('span'); lab.className = 'label'; lab.textContent = n.title;
    cov.append(lab); cov.onclick = () => openNotebook(n.id);
    const meta = document.createElement('div'); meta.className = 'meta';
    const txt = document.createElement('div'); txt.className = 'txt';
    const t = document.createElement('div'); t.className = 't'; t.textContent = n.title;
    const d = document.createElement('div'); d.className = 'd';
    d.textContent = n.pages.length + (n.pages.length === 1 ? ' página' : ' páginas');
    const d2 = document.createElement('div'); d2.className = 'd'; d2.textContent = fmtDate(n.updated);
    txt.append(t, d, d2);
    const more = document.createElement('button'); more.className = 'ib sm'; more.innerHTML = ICON.more;
    more.setAttribute('aria-label', 'Opciones de ' + n.title);
    more.onclick = () => notebookActions(n);
    meta.append(txt, more); card.append(cov, meta); g.append(card);
  }
  const empty = $('#empty');
  empty.textContent = folder ? EMPTY_FOLDER : EMPTY_ROOT;
  empty.hidden = folder ? list.length > 0 : (profile.notebooks.length > 0 || profile.folders.length > 0);
  $('#store-mode').textContent = 'Tus cuadernos se guardan en este dispositivo. Haz una copia de vez en cuando con «Exportar copia».';
}
async function newFolderFlow(){
  const name = await askText('Nueva carpeta', '', 'Crear');
  if(!name) return;
  createFolder(name); renderLibrary();
}
async function folderActions(f){
  const v = await modal({ title: f.name, body: (b, done) => {
    const l = document.createElement('div'); l.className = 'menu-list';
    l.append(menuBtn(ICON.edit, 'Cambiar nombre', () => done('rename')));
    l.append(menuBtn(ICON.trash, 'Eliminar carpeta', () => done('delete'), 'danger'));
    b.append(l);
  }, actions: [{ label:'Cerrar', value:null }] });
  if(v === 'rename'){
    const t = await askText('Nombre de la carpeta', f.name, 'Guardar');
    if(t){ renameFolder(f.id, t); renderLibrary(); }
  } else if(v === 'delete'){
    const k = notebooksIn(f.id).length;
    const moved = k === 0 ? '' : (k === 1 ? 'El cuaderno que contiene pasará' : 'Los ' + k + ' cuadernos que contiene pasarán') + ' a la biblioteca. ';
    const ok = await confirmBox('¿Eliminar la carpeta «' + f.name + '»?', moved + 'No se borra ningún cuaderno.', 'Eliminar carpeta');
    if(!ok) return;
    deleteFolder(f.id); renderLibrary();
  }
}
async function moveNotebookFlow(n){
  const cur = folderOf(n);
  const v = await modal({ title: 'Mover «' + n.title + '»', body: (b, done) => {
    const l = document.createElement('div'); l.className = 'menu-list';
    const opt = (icon, label, id) => {
      const bt = menuBtn(icon, label, () => done({ to: id }));
      bt.setAttribute('aria-pressed', String(cur === id)); l.append(bt);
    };
    opt(ICON.pages, 'Sin carpeta (biblioteca)', null);
    for(const f of [...profile.folders].sort((a, b) => a.name.localeCompare(b.name, 'es'))) opt(ICON.folder, f.name, f.id);
    b.append(l);
  }, actions: [{ label:'Cancelar', value:null }] });
  if(!v) return;
  moveNotebook(n, v.to); renderLibrary();
}
$('#btn-lib-back').innerHTML = ICON.back + '<span>Cuadernos</span>';
$('#btn-lib-back').onclick = () => { curFolder = null; renderLibrary(); };
```

`menuBtn` y `modal` son declaraciones de función, así que ya están disponibles aunque aparezcan más abajo en el archivo. `ICON` está declarado arriba. Las dos últimas líneas se ejecutan al cargar el script, cuando `#btn-lib-back` ya existe en el DOM.

- [ ] **Paso 7: menú del cuaderno y creación dentro de la carpeta**

En `notebookActions`, sustituye:

```js
    l.append(menuBtn(ICON.edit, 'Cambiar nombre', () => done('rename')));
    l.append(menuBtn(ICON.trash, 'Eliminar cuaderno', () => done('delete'), 'danger'));
```

por:

```js
    l.append(menuBtn(ICON.edit, 'Cambiar nombre', () => done('rename')));
    if(profile.folders.length || folderOf(n)) l.append(menuBtn(ICON.folder, 'Mover a carpeta', () => done('move')));
    l.append(menuBtn(ICON.trash, 'Eliminar cuaderno', () => done('delete'), 'danger'));
```

En la misma función, sustituye:

```js
  } else if(v === 'delete'){
    const ok = await confirmBox('¿Eliminar «' + n.title + '»?'
```

por:

```js
  } else if(v === 'move'){
    moveNotebookFlow(n);
  } else if(v === 'delete'){
    const ok = await confirmBox('¿Eliminar «' + n.title + '»?'
```

En `newNotebookFlow`, cambia la firma `async function newNotebookFlow(){` por `async function newNotebookFlow(folderId){`. Después, sustituye:

```js
  const n = { id:uid(), title:st.title, cover:st.cover, paper:st.paper, paperColor:st.paperColor, pages:[pid], created:Date.now(), updated:Date.now(), lastPage:0 };
```

por:

```js
  const n = { id:uid(), title:st.title, cover:st.cover, paper:st.paper, paperColor:st.paperColor, pages:[pid], created:Date.now(), updated:Date.now(), lastPage:0 };
  if(folderById(folderId)) n.folder = folderId;
```

En `restoreBackup`, sustituye:

```js
  profile = normalizeProfile(o.profile);
```

por:

```js
  profile = normalizeProfile(o.profile); curFolder = null;
```

- [ ] **Paso 8: comprueba que pasan las pruebas nuevas y las anteriores**

Ejecuta: `node tests/run.mjs`
Esperado: `19 ok, 0 fallos` (2 de smoke + 7 de datos + 10 de interfaz).

- [ ] **Paso 9: revisión visual rápida**

Sirve la carpeta con `python -m http.server 8000`, abre `http://localhost:8000/` en el navegador de la app y crea dos carpetas y un cuaderno. Haz una captura de la raíz y otra de dentro de una carpeta, en claro y en oscuro. Comprueba que:
- las tarjetas de carpeta quedan alineadas con las portadas;
- el nombre se lee sobre la carpeta;
- el botón `‹ Cuadernos` solo aparece dentro de una carpeta.

- [ ] **Paso 10: commit**

```bash
git add index.html tests/folders-ui.test.js
git commit -m "Carpetas: biblioteca con vista de carpeta, mover y eliminar" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 4: reconocimiento del garabato (funciones puras)

**Archivos:**
- Modificar: `index.html`. Añade una sección nueva justo después de la función `pointInPoly` y antes de `function finishAct`.
- Crear: `tests/scribble-detect.test.js`

**Interfaces:**
- Consume: `bboxOf(P, pad)` (puntos con paso 3) y `pointInPoly(x, y, poly)` (polígono plano con paso 2), que ya existen.
- Produce:
  - Las constantes `SCRIBBLE_*`
  - `strokeLength(P) → number`
  - `principalAxis(P) → [ax, ay]`
  - `isScribble(P) → boolean`
  - `convexHull(P) → number[]`: polígono plano `[x,y,…]`
  - `padPoly(poly, pad) → number[]`
  - `coverFraction(s, poly) → number` (de 0 a 1)
  - `scribbleTargets(P, strokes) → Set<id>`

  `P` siempre es un array plano `[x, y, p, …]`, ya sea `Array` o `Float32Array`.

- [ ] **Paso 1: escribe las pruebas que deben fallar, en `tests/scribble-detect.test.js`**

```js
test('un zigzag de ida y vuelta es un garabato', async () => {
  assert(isScribble(flat(zigzag(300, 300, 120, 30, 6))), 'zigzag de 6 pasadas');
  assert(isScribble(flat(zigzag(300, 300, 60, 20, 5))), 'zigzag pequeño de 5 pasadas');
});

test('la escritura y las líneas no son garabatos', async () => {
  assert(!isScribble(flat(cursiveM(100, 100, 4))), 'mmmm');
  assert(!isScribble(flat(cursiveW(100, 100, 4))), 'wwww');
  assert(!isScribble(flat(cursiveM(100, 100, 8))), 'mmmmmmmm');
  assert(!isScribble(flat(densify([[100, 500], [700, 505]]))), 'subrayado');
  assert(!isScribble(flat(densify([[100, 100], [200, 200], [100, 300]]))), 'una sola vuelta');
  assert(!isScribble(flat(zigzag(300, 300, 120, 30, 3))), 'solo 2 cambios de sentido');
});

test('foco: trazos degenerados devuelven false sin lanzar', async () => {
  assertEq(isScribble(flat([[10, 10]])), false, 'un punto');
  assertEq(isScribble(flat([[10, 10], [20, 20]])), false, 'dos puntos');
  assertEq(isScribble(flat(Array.from({ length: 30 }, () => [50, 50]))), false, '30 puntos iguales');
  assertEq(isScribble([]), false, 'vacío');
});

test('convexHull de un cuadrado con un punto interior da 4 vértices', async () => {
  const hull = convexHull(flat([[0, 0], [10, 0], [10, 10], [0, 10], [5, 5]]));
  assertEq(hull.length, 8);
  assert(pointInPoly(5, 5, hull) && !pointInPoly(15, 5, hull), 'contenido del polígono');
});

test('coverFraction: dentro, fuera, a medias y de un solo punto', async () => {
  const sq = [0, 0, 100, 0, 100, 100, 0, 100];
  assertEq(coverFraction(penStroke(densify([[10, 50], [90, 50]])), sq), 1);
  assertEq(coverFraction(penStroke(densify([[200, 50], [300, 50]])), sq), 0);
  const half = coverFraction(penStroke(densify([[50, 50], [150, 50]])), sq);
  assert(half > 0.45 && half < 0.55, 'a medias: ' + half);
  assertEq(coverFraction(penStroke([[50, 50]]), sq), 1, 'un punto dentro');
});

test('scribbleTargets: borra la palabra cubierta y deja lo que solo cruza o está lejos', async () => {
  const letters = word(300, 305, 120, 5);
  const underline = penStroke(densify([[100, 330], [800, 330]]));
  const far = penStroke(densify([[300, 900], [400, 900]]));
  const ids = scribbleTargets(flat(zigzag(295, 300, 130, 30, 6)), letters.concat([underline, far]));
  assertEq([...ids].sort(), letters.map(s => s.id).sort());
});
```

- [ ] **Paso 2: comprueba que fallan**

Ejecuta: `node tests/run.mjs tests/scribble-detect.test.js`
Esperado: FAIL con `isScribble is not defined`, etc.

- [ ] **Paso 3: implementa**

Inmediatamente después del `}` que cierra `function pointInPoly`, añade:

```js
/* =========================================================
   Garabatear para borrar: reconocimiento (funciones puras)
   Unidades de página (1000 × 1414). Ajustar tras probar en el iPad.
   ========================================================= */
const SCRIBBLE_MIN_PTS = 12;        // puntos mínimos del trazo
const SCRIBBLE_MIN_REVERSALS = 4;   // cambios de sentido sobre el eje principal
const SCRIBBLE_MIN_SWING = 8;       // retroceso mínimo para contar un cambio
const SCRIBBLE_SWING_FRAC = 0.35;   // … o esta fracción de la extensión, si es mayor
const SCRIBBLE_MIN_DENSITY = 2.5;   // longitud / diagonal de la caja
const SCRIBBLE_PAD = 4;             // margen de la zona tachada
const SCRIBBLE_COVER = 0.6;         // fracción de un trazo que debe quedar dentro
function strokeLength(P){
  let L = 0;
  for(let i=3;i<P.length;i+=3) L += Math.hypot(P[i]-P[i-3], P[i+1]-P[i-2]);
  return L;
}
function principalAxis(P){
  const n = P.length/3; let mx = 0, my = 0;
  for(let i=0;i<n;i++){ mx += P[i*3]; my += P[i*3+1]; }
  mx /= n; my /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for(let i=0;i<n;i++){ const dx = P[i*3]-mx, dy = P[i*3+1]-my; sxx += dx*dx; syy += dy*dy; sxy += dx*dy; }
  const a = 0.5*Math.atan2(2*sxy, sxx - syy);
  return [Math.cos(a), Math.sin(a)];
}
function isScribble(P){
  const n = P.length/3;
  if(n < SCRIBBLE_MIN_PTS) return false;
  const [ax, ay] = principalAxis(P);
  const proj = new Float64Array(n); let lo = Infinity, hi = -Infinity;
  for(let i=0;i<n;i++){ const t = P[i*3]*ax + P[i*3+1]*ay; proj[i] = t; if(t < lo) lo = t; if(t > hi) hi = t; }
  const extent = hi - lo;
  if(!(extent >= SCRIBBLE_MIN_SWING*2)) return false;
  const swing = Math.max(SCRIBBLE_MIN_SWING, extent*SCRIBBLE_SWING_FRAC);
  let dir = 0, hiE = proj[0], loE = proj[0], rev = 0;
  for(let i=1;i<n;i++){
    const t = proj[i];
    if(dir === 0){
      if(t - loE >= swing){ dir = 1; hiE = t; }
      else if(hiE - t >= swing){ dir = -1; loE = t; }
      else { if(t > hiE) hiE = t; if(t < loE) loE = t; }
    } else if(dir === 1){
      if(t > hiE) hiE = t; else if(hiE - t >= swing){ dir = -1; loE = t; rev++; }
    } else {
      if(t < loE) loE = t; else if(t - loE >= swing){ dir = 1; hiE = t; rev++; }
    }
  }
  if(rev < SCRIBBLE_MIN_REVERSALS) return false;
  const b = bboxOf(P, 0), diag = Math.hypot(b[2]-b[0], b[3]-b[1]);
  return diag > 0 && strokeLength(P) >= SCRIBBLE_MIN_DENSITY*diag;
}
function convexHull(P){
  const pts = [];
  for(let i=0;i<P.length;i+=3) pts.push([P[i], P[i+1]]);
  pts.sort((a, b) => a[0]-b[0] || a[1]-b[1]);
  if(pts.length < 3) return pts.flat();
  const cross = (o, a, b) => (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]);
  const lower = [], upper = [];
  for(const p of pts){ while(lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], p) <= 0) lower.pop(); lower.push(p); }
  for(let i=pts.length-1;i>=0;i--){ const p = pts[i]; while(upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], p) <= 0) upper.pop(); upper.push(p); }
  upper.pop(); lower.pop();
  return lower.concat(upper).flat();
}
function padPoly(poly, pad){
  const m = poly.length/2; let cx = 0, cy = 0;
  for(let i=0;i<m;i++){ cx += poly[i*2]; cy += poly[i*2+1]; }
  cx /= m; cy /= m;
  const out = [];
  for(let i=0;i<m;i++){
    const dx = poly[i*2]-cx, dy = poly[i*2+1]-cy, d = Math.hypot(dx, dy) || 1;
    out.push(poly[i*2] + dx/d*pad, poly[i*2+1] + dy/d*pad);
  }
  return out;
}
function coverFraction(s, poly){
  const P = s.pts, n = P.length/3;
  if(n === 1) return pointInPoly(P[0], P[1], poly) ? 1 : 0;
  let tot = 0, ins = 0;
  for(let i=0;i<n-1;i++){
    const x0 = P[i*3], y0 = P[i*3+1], x1 = P[i*3+3], y1 = P[i*3+4], L = Math.hypot(x1-x0, y1-y0);
    if(!L) continue;
    const k = Math.max(1, Math.ceil(L/4));
    for(let j=0;j<k;j++){
      const t = (j + 0.5)/k; tot += L/k;
      if(pointInPoly(x0 + (x1-x0)*t, y0 + (y1-y0)*t, poly)) ins += L/k;
    }
  }
  return tot ? ins/tot : (pointInPoly(P[0], P[1], poly) ? 1 : 0);
}
function scribbleTargets(P, strokes){
  const out = new Set();
  const hull = convexHull(P);
  if(hull.length < 6) return out;
  const zone = padPoly(hull, SCRIBBLE_PAD);
  let zx0 = Infinity, zy0 = Infinity, zx1 = -Infinity, zy1 = -Infinity;
  for(let i=0;i<zone.length;i+=2){ zx0 = Math.min(zx0, zone[i]); zx1 = Math.max(zx1, zone[i]); zy0 = Math.min(zy0, zone[i+1]); zy1 = Math.max(zy1, zone[i+1]); }
  for(const s of strokes){
    const b = s.bb;
    if(b[2] < zx0 || b[0] > zx1 || b[3] < zy0 || b[1] > zy1) continue;
    if(coverFraction(s, zone) >= SCRIBBLE_COVER) out.add(s.id);
  }
  return out;
}
```

- [ ] **Paso 4: comprueba que pasan**

Ejecuta: `node tests/run.mjs tests/scribble-detect.test.js`
Esperado: `6 ok, 0 fallos`.

Si falla «la escritura y las líneas no son garabatos» o «un zigzag … es un garabato», **no cambies las constantes por tu cuenta**: son las aprobadas en la spec. Antes, imprime `rev`, `extent` y la densidad del caso que falla (con un `console.log` temporal, o devolviéndolos en una prueba) y comprueba si el error está en la prueba sintética o en el algoritmo. Si de verdad hay que cambiar una constante, para y consúltalo con el usuario.

- [ ] **Paso 5: commit**

```bash
git add index.html tests/scribble-detect.test.js
git commit -m "Garabato: reconocimiento y zona tachada (funciones puras)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 5: borrar con el garabato en el editor

**Archivos:**
- Modificar: `index.html`. Se tocan: una función nueva `tryScribbleErase` (después de `scribbleTargets`), **una línea** en la rama `draw` de `finishAct`, `ICON` y `editorMenu`.
- Crear: `tests/scribble-erase.test.js`

**Interfaces:**
- Consume (de la Tarea 4): `isScribble(P)`, `scribbleTargets(P, strokes)`. Ya existentes: `page`, `selection`, `clearSelection()`, `renderInk()`, `commit(prev)`, `undo()`, `prefs()`, `saveProfileSoon()`, `toast(msg)`.
- Produce: `tryScribbleErase(c) → boolean`, con `c = { t, pts }` (como `cur`), e `ICON.scribble`.

- [ ] **Paso 1: escribe las pruebas que deben fallar, en `tests/scribble-erase.test.js`**

```js
const ids = list => list.map(s => s.id).sort();

test('garabatear con el puntero sobre una palabra la borra y no deja el garabato', async () => {
  const letters = word(300, 305, 120, 5), far = penStroke(densify([[300, 900], [400, 900]]));
  await openTestNotebook(letters.concat([far]));
  await drawWithPointer(zigzag(295, 300, 130, 30, 6));
  assertEq(ids(page.strokes), [far.id]);
});

test('garabatear sobre papel vacío deja el garabato como tinta', async () => {
  await openTestNotebook();
  await drawWithPointer(zigzag(295, 300, 130, 30, 6));
  assertEq(page.strokes.length, 1);
});

test('deshacer devuelve exactamente lo borrado', async () => {
  const letters = word(300, 305, 120, 5);
  await openTestNotebook(letters);
  await drawWithPointer(zigzag(295, 300, 130, 30, 6));
  assertEq(page.strokes.length, 0);
  undo();
  assertEq(ids(page.strokes), ids(letters));
});

test('con el interruptor apagado no borra y añade el garabato', async () => {
  const letters = word(300, 305, 120, 5);
  await openTestNotebook(letters);
  prefs().scribbleErase = false;
  await drawWithPointer(zigzag(295, 300, 130, 30, 6));
  assertEq(page.strokes.length, letters.length + 1);
});

test('un garabato con el fosforito no borra nada', async () => {
  const letters = word(300, 305, 120, 5);
  await openTestNotebook(letters);
  setTool('hl', true);
  await drawWithPointer(zigzag(295, 300, 130, 30, 6));
  assertEq(page.strokes.length, letters.length + 1);
});

test('un garabato de pluma borra también el fosforito que hay debajo', async () => {
  const mark = penStroke(densify([[300, 315], [420, 315]]), 'hl');
  await openTestNotebook([mark]);
  await drawWithPointer(zigzag(295, 300, 130, 30, 6));
  assertEq(page.strokes.length, 0);
});

test('foco: garabatear con una selección activa la limpia', async () => {
  const letters = word(300, 305, 120, 5), keep = penStroke(densify([[300, 900], [400, 900]]));
  await openTestNotebook(letters.concat([keep]));
  selection = { ids: new Set([letters[0].id, keep.id]), bb: [290, 290, 410, 910], dx: 0, dy: 0, moving: false };
  assert(tryScribbleErase({ t: 'pen', pts: flat(zigzag(295, 300, 130, 30, 6)) }), 'debería borrar');
  assertEq(selection, null);
  assertEq(ids(page.strokes), [keep.id]);
});

test('la primera vez avisa y lo recuerda', async () => {
  await openTestNotebook(word(300, 305, 120, 5));
  assert(!prefs().scribbleSeen, 'empieza sin haberlo visto');
  await drawWithPointer(zigzag(295, 300, 130, 30, 6));
  assert(prefs().scribbleSeen, 'scribbleSeen debe quedar a true');
  assertEq(document.querySelector('#toast').textContent, 'Garabato: borrado. Deshaz para recuperarlo.');
});

test('el borrado se guarda en IndexedDB', async () => {
  const letters = word(300, 305, 120, 5), keep = penStroke(densify([[300, 900], [400, 900]]));
  const n = await openTestNotebook(letters.concat([keep]));
  await drawWithPointer(zigzag(295, 300, 130, 30, 6));
  await waitWrites();
  const d = await IDB.get('page:' + n.pages[0]);
  assertEq(d.strokes.map(s => s.i), [keep.id]);
});

test('el interruptor del menú de opciones cambia el ajuste', async () => {
  await openTestNotebook();
  editorMenu();
  await clickDialog('Garabatear para borrar: Sí');
  assertEq(prefs().scribbleErase, false);
  editorMenu();
  await clickDialog('Garabatear para borrar: No');
  assertEq(prefs().scribbleErase, true);
});

test('dibujar normal con el puntero sigue igual (sin regresión)', async () => {
  await openTestNotebook();
  await drawWithPointer(cursiveM(200, 400, 6));
  assertEq(page.strokes.length, 1);
  assertEq(page.strokes[0].t, 'pen');
});
```

- [ ] **Paso 2: comprueba que fallan**

Ejecuta: `node tests/run.mjs tests/scribble-erase.test.js`
Esperado: varias en FAIL. Por ejemplo, en la primera habrá 7 trazos en lugar de 1, y `tryScribbleErase is not defined`. Las que prueban que *no* se borra (papel vacío, fosforito, interruptor apagado sin ajuste en el menú, sin regresión) pueden pasar ya: es lo esperado.

- [ ] **Paso 3: implementa `tryScribbleErase`**

Inmediatamente después del `}` que cierra `function scribbleTargets`, añade:

```js
function tryScribbleErase(c){
  if(c.t !== 'pen' || prefs().scribbleErase === false) return false;
  if(!isScribble(c.pts)) return false;
  const targets = scribbleTargets(c.pts, page.strokes);
  if(!targets.size) return false;
  const prev = page.strokes;
  clearSelection();
  page.strokes = prev.filter(s => !targets.has(s.id));
  renderInk(); commit(prev);
  if(!prefs().scribbleSeen){ prefs().scribbleSeen = true; saveProfileSoon(); toast('Garabato: borrado. Deshaz para recuperarlo.'); }
  return true;
}
```

- [ ] **Paso 4: el gancho en `finishAct` (el único cambio en el motor)**

En `function finishAct(e)`, rama `if(a.kind === 'draw'){`, sustituye:

```js
    if(cur.pts.length){
      const pts = simplify(cur.pts, 0.18);
```

por:

```js
    if(cur.pts.length){
      if(tryScribbleErase(cur)){ cur = null; requestLive(); return; }
      const pts = simplify(cur.pts, 0.18);
```

No cambies nada más en `finishAct`. Después de la cadena `if/else if` no se ejecuta ningún otro código, así que el `return` es seguro.

- [ ] **Paso 5: el interruptor en el menú del editor**

En `const ICON = {…}`, después de `folderPlus: …`, añade:

```js
  scribble: S+'<path d="M4 15c2-6 3-6 4 0s2 6 4 0 2-6 4 0 2 6 4 0"/></svg>',
```

En `editorMenu`, sustituye:

```js
    l.append(menuBtn(ICON.trash, 'Eliminar esta página', () => done('delpage'), 'danger'));
```

por:

```js
    const scribOn = prefs().scribbleErase !== false;
    const scrib = menuBtn(ICON.scribble, 'Garabatear para borrar: ' + (scribOn ? 'Sí' : 'No'), () => done('scribble'));
    scrib.setAttribute('aria-pressed', String(scribOn));
    l.append(scrib);
    l.append(menuBtn(ICON.trash, 'Eliminar esta página', () => done('delpage'), 'danger'));
```

En la misma función, sustituye:

```js
  else if(v === 'delpage') deletePageAt(pageIdx);
```

por:

```js
  else if(v === 'delpage') deletePageAt(pageIdx);
  else if(v === 'scribble'){
    prefs().scribbleErase = prefs().scribbleErase === false;
    saveProfileSoon();
    toast(prefs().scribbleErase ? 'Garabatear para borrar: activado.' : 'Garabatear para borrar: desactivado.');
  }
```

En la lista de ayuda de `editorMenu` (`help.innerHTML = …`), añade este elemento antes del último `'<li>El botón de la mano…'`:

```js
      + '<li>Tacha con la pluma encima de algo para borrarlo; se deshace como cualquier trazo.</li>'
```

- [ ] **Paso 6: comprueba que pasa todo**

Ejecuta: `node tests/run.mjs`
Esperado: `36 ok, 0 fallos` (2 + 7 + 10 + 6 + 11).

- [ ] **Paso 7: commit**

```bash
git add index.html tests/scribble-erase.test.js
git commit -m "Garabato: borrar al tachar con la pluma, con interruptor y deshacer" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 6: versión y publicación

**Archivos:**
- Modificar: `sw.js:3`
- Modificar: `README.md` (una línea)

**Interfaces:** ninguna nueva.

- [ ] **Paso 1: sube la versión de la caché**

En `sw.js`, sustituye `const VERSION = 'v1';` por `const VERSION = 'v2';`.

- [ ] **Paso 2: menciona las funciones en el README**

En `README.md`, debajo del primer párrafo («App para escribir a mano…»), añade:

```markdown
Organiza los cuadernos en carpetas (una por asignatura) y tacha con la pluma encima de algo para borrarlo.
```

- [ ] **Paso 3: pasa todas las pruebas y comprueba la prueba sin red**

Ejecuta: `node tests/run.mjs`
Esperado: `36 ok, 0 fallos`.

Comprueba también que el service worker sigue sirviendo la app sin red. Ejecuta la prueba sin red de la sesión anterior, si sigue disponible en el scratchpad (`offline_test.mjs`, que recibe como argumento la ruta del repo). Si no, sirve la carpeta, ábrela una vez en Edge, detén el servidor y recarga: la app debe abrir y mostrar los cuadernos.

- [ ] **Paso 4: commit**

```bash
git add sw.js README.md
git commit -m "Versión v2: carpetas y garabatear para borrar" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Paso 5: PARA y pide permiso al usuario antes de publicar**

Enséñale el resumen de commits (`git log --oneline origin/main..HEAD`) y el resultado de las pruebas. Pregúntale si publicas. Solo con su sí:

```bash
git push origin main
```

- [ ] **Paso 6: comprueba el sitio publicado**

Espera a que GitHub Pages termine: `gh api repos/Andres-gitthub/cuaderno/pages --jq .status` debe devolver `built` y `curl -s https://andres-gitthub.github.io/cuaderno/sw.js | grep -c "'v2'"` debe devolver `1`. Después comprueba que `index.html` publicado contiene `tryScribbleErase` y `newFolderFlow`:

```bash
curl -s https://andres-gitthub.github.io/cuaderno/index.html | grep -c "tryScribbleErase\|newFolderFlow"
```

Esperado: `2` o más.

Recuérdale al usuario cómo actualizar en el iPad: abrir la app con internet, cerrarla del todo y volver a abrirla.
