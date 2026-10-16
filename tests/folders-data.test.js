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

test('normalizeProfile descarta carpetas mal formadas', async () => {
  const p = normalizeProfile({ v: 1, notebooks: [], prefs: {}, folders: [null, { id: 'a', name: 'A', created: 1 }, { id: 2, name: 'B' }, { id: 'c' }] });
  assertEq(p.folders.map(f => f.id), ['a']);
});
