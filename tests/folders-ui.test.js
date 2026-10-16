const cards = () => [...document.querySelectorAll('#grid .card')];
const folderLabels = () => [...document.querySelectorAll('#grid .folder .label')].map(e => e.textContent);
const notebookLabels = () => [...document.querySelectorAll('#grid .cover:not(.cover-new) .label')].map(e => e.textContent);
const cardByText = t => cards().find(c => c.textContent.includes(t));
async function seedNotebook(title, folderId){
  const n = await openTestNotebook(); n.title = title; closeNotebook();
  if(folderId) moveNotebook(n, folderId);
  renderLibrary(); return n;
}

test('la raíz muestra «Nueva carpeta» y las carpetas en orden alfabético con su recuento', async () => {
  const b = createFolder('Química'), a = createFolder('álgebra');
  await seedNotebook('Tema 1', b.id);
  renderLibrary();
  assert(cardByText('Nueva carpeta'), 'falta la tarjeta Nueva carpeta');
  assertEq(folderLabels(), ['álgebra', 'Química']);
  assert(cardByText('Química').textContent.includes('1 cuaderno'), 'falta el recuento');
  assertEq(notebookLabels(), [], 'los cuadernos de una carpeta no aparecen en la raíz');
});

test('abrir una carpeta muestra solo sus cuadernos y la vuelta a la raíz', async () => {
  const f = createFolder('Física');
  await seedNotebook('Dentro', f.id); await seedNotebook('Fuera');
  document.querySelector('#grid .folder').click();
  assertEq(curFolder, f.id);
  assertEq(document.querySelector('#lib-title').textContent, 'Física');
  assert(!document.querySelector('#btn-lib-back').hidden, 'falta el botón de volver');
  assertEq(notebookLabels(), ['Dentro']);
  assert(!cardByText('Nueva carpeta'), 'Nueva carpeta no debe salir dentro de una carpeta');
  document.querySelector('#btn-lib-back').click();
  assertEq(curFolder, null);
  assertEq(document.querySelector('#lib-title').textContent, 'Cuadernos');
  assert(document.querySelector('#btn-lib-back').hidden, 'el botón de volver debe ocultarse en la raíz');
});

test('crear una carpeta desde la tarjeta', async () => {
  cardByText('Nueva carpeta').click();
  await typeDialog('Economía'); await clickDialog('Crear');
  assertEq(profile.folders.map(f => f.name), ['Economía']);
  assertEq(folderLabels(), ['Economía']);
});

test('un cuaderno nuevo creado dentro de una carpeta se queda en ella y al cerrarlo se vuelve a la carpeta', async () => {
  const f = createFolder('Física'); curFolder = f.id; renderLibrary();
  cardByText('Nuevo cuaderno').click();
  await typeDialog('Cinemática'); await clickDialog('Crear cuaderno');
  for(let i = 0; i < 100 && !page; i++) await sleep(20);
  assertEq(folderOf(nb), f.id);
  closeNotebook();
  assertEq(document.querySelector('#lib-title').textContent, 'Física');
  assertEq(notebookLabels(), ['Cinemática']);
});

test('mover un cuaderno con el menú ⋯', async () => {
  const f = createFolder('Física');
  const n = await seedNotebook('Apuntes');
  document.querySelector('[aria-label="Opciones de Apuntes"]').click();
  await clickDialog('Mover a carpeta');
  await clickDialog('Física');
  assertEq(folderOf(n), f.id);
  assertEq(notebookLabels(), []);
});

test('«Mover a carpeta» no aparece si no hay carpetas', async () => {
  await seedNotebook('Solo');
  document.querySelector('[aria-label="Opciones de Solo"]').click();
  await sleep(50);
  assert(!dialogButton('Mover a carpeta'), 'no debería ofrecer mover');
  await clickDialog('Cerrar');
});

test('eliminar una carpeta avisa del recuento y deja sus cuadernos en la raíz', async () => {
  const f = createFolder('Física');
  await seedNotebook('A', f.id); await seedNotebook('B', f.id);
  renderLibrary();
  document.querySelector('[aria-label="Opciones de la carpeta Física"]').click();
  await clickDialog('Eliminar carpeta');
  await sleep(50);
  assert(document.querySelector('#dlg p').textContent.includes('Los 2 cuadernos que contiene pasarán a la biblioteca'), 'texto de confirmación');
  await clickDialog('Eliminar carpeta');
  assertEq(profile.folders, []);
  assertEq(notebookLabels().sort(), ['A', 'B']);
});

test('una carpeta vacía muestra su texto de ayuda', async () => {
  const f = createFolder('Vacía'); curFolder = f.id; renderLibrary();
  const e = document.querySelector('#empty');
  assert(!e.hidden, 'el texto debe verse');
  assert(e.textContent.startsWith('Esta carpeta está vacía.'), 'texto de carpeta vacía');
});

test('foco: un nombre de carpeta con HTML se muestra literal', async () => {
  const evil = '<img src=x onerror="window.__xss=1">';
  createFolder(evil); renderLibrary();
  assertEq(folderLabels(), [evil]);
  assert(!document.querySelector('#grid img'), 'se insertó un elemento img');
  await sleep(50);
  assert(!window.__xss, 'se ejecutó código');
});

test('foco: restaurar una copia mientras se ve una carpeta vuelve a la raíz', async () => {
  let saved = null; window.saveFile = async (name, data) => { saved = await data.text(); };
  await exportBackup();                       // copia sin carpetas
  const f = createFolder('Temporal'); curFolder = f.id; renderLibrary();
  const p = restoreBackup(new File([saved], 'copia.json'));
  await clickDialog('Restaurar'); await p;
  assertEq(curFolder, null);
  assertEq(document.querySelector('#lib-title').textContent, 'Cuadernos');
});
