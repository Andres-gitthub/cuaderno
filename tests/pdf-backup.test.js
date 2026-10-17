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
