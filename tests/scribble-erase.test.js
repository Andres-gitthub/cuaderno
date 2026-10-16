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
