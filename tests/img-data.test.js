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
