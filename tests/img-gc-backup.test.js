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

test('foco: si el perfil en memoria no es el guardado, la limpieza no borra ni guarda nada', async () => {
  const { o } = await savedImgPage(); closeNotebook(); await waitWrites();
  await backend.setImg('korphan', await noiseJpeg());
  const real = profile; profile = normalizeProfile(null);   // como si el perfil no se hubiera podido cargar
  let r; try { r = await collectImgGarbage(true); } finally { profile = real; }
  assertEq(r, 0);
  assert(await backend.getImg(o.img) && await backend.getImg('korphan'), 'no debía borrar nada');
  assertEq((await IDB.get('profile')).notebooks.length, 1);
});

test('foco: si una página no se puede leer, la limpieza no borra nada', async () => {
  const { o } = await savedImgPage(); closeNotebook(); await waitWrites(); pages.clear();
  await backend.setImg('korphan', await noiseJpeg());
  const orig = IDB.get; IDB.get = k => String(k).startsWith('page:') ? Promise.reject(new Error('io')) : orig(k);
  let r; try { r = await collectImgGarbage(true); } finally { IDB.get = orig; }
  assertEq(r, 0);
  assert(await backend.getImg(o.img) && await backend.getImg('korphan'), 'no debía borrar nada');
});

test('foco: si algo empieza a escribir durante la limpieza, se detiene', async () => {
  await savedImgPage(); closeNotebook(); await waitWrites();
  await backend.setImg('kz1', await noiseJpeg()); await backend.setImg('kz2', await noiseJpeg());
  const orig = IDB.del; let n = 0;
  IDB.del = k => { if(++n === 1) importing = true; return orig(k); };
  let r; try { r = await collectImgGarbage(true); } finally { IDB.del = orig; importing = false; }
  assertEq(r, 1);
  assertEq([!!(await backend.getImg('kz1')), !!(await backend.getImg('kz2'))].filter(Boolean).length, 1);
});
