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
