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
