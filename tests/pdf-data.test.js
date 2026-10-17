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
