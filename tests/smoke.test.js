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
