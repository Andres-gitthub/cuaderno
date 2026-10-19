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

// ---- Imágenes insertadas ----
window.addTestImg = async (pg, rect = { x: 300, y: 200, w: 400, h: 300 }, rgb = [30, 60, 220]) => {
  const key = 'k' + uid();
  await backend.setImg(key, await noiseJpeg(160, 120, rgb));
  const o = Object.assign({ id: uid(), img: key }, rect);
  pg.imgs = [...(pg.imgs || []), o];
  return o;
};
window.imgFile = async (w, h, rgb = [30, 60, 220], name = 'foto.jpg') => new File([await noiseJpeg(w, h, rgb)], name, { type: 'image/jpeg' });

// La limpieza automática de imágenes huérfanas se programa al arrancar: en las pruebas se lanza a mano
if(typeof gcTimer !== 'undefined') clearTimeout(gcTimer);
