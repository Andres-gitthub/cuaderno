const pdfFile = (name = 'Tema 3.pdf') => new File([makeTestPdf()], name, { type: 'application/pdf' });

test('importar crea un cuaderno con el nombre del archivo, en la carpeta actual, y lo abre', async () => {
  const f = createFolder('Física'); curFolder = f.id; renderLibrary();
  await importPdfFlow(pdfFile(), { folderId: curFolder });
  assertEq(nb.title, 'Tema 3'); assertEq(nb.pages.length, 3); assertEq(folderOf(nb), f.id);
  for(let i = 0; i < 100 && !page; i++) await sleep(20);
  assertEq(pageIdx, 0);
  await waitWrites();
  for(const id of nb.pages){
    const doc = await IDB.get('page:' + id);
    assert(doc.bg && typeof doc.bg.img === 'string', 'página con bg');
    const blob = await backend.getImg(doc.bg.img);
    assert(blob && blob.type === 'image/jpeg', 'imagen JPEG guardada');
  }
  assertEq(document.querySelector('#toast').textContent, 'PDF importado: 3 páginas');
});

test('posición: diapositivas apaisadas arriba a todo el ancho, A4 limitado por el ancho', async () => {
  await importPdfFlow(pdfFile(), { folderId: null });
  const [a, , p] = nb.pages.map(id => pages.get(id).bg);
  assertEq([a.x, a.y, a.w], [40, 40, 920]); assert(Math.abs(a.h - 517.5) < 2, 'alto ' + a.h);
  assertEq([p.x, p.y, p.w], [40, 40, 920]); assert(Math.abs(p.h - 1301) < 3, 'alto A4 ' + p.h);
});

test('«Añadir PDF al final» añade las páginas al final y va a la primera nueva', async () => {
  await openTestNotebook(); addPage();
  assertEq(nb.pages.length, 2);
  await importPdfFlow(pdfFile(), { nb });
  assertEq(nb.pages.length, 5);
  assert(!pages.get(nb.pages[1]).bg && pages.get(nb.pages[2]).bg, 'las nuevas van al final');
  for(let i = 0; i < 100 && pageIdx !== 2; i++) await sleep(20);
  assertEq(pageIdx, 2);
});

test('dibujar, borrar y garabatear sobre la diapositiva no toca el fondo', async () => {
  await importPdfFlow(pdfFile(), { folderId: null });
  for(let i = 0; i < 100 && !page; i++) await sleep(20);
  const bg = JSON.stringify(page.bg);
  await drawWithPointer(densify([[200, 200], [600, 220]]));
  setTool('eraser', true); await drawWithPointer(densify([[200, 210], [600, 215]]));
  setTool('pen', true); await drawWithPointer(zigzag(150, 150, 300, 40, 4));
  assertEq(JSON.stringify(page.bg), bg);
  assert(await backend.getImg(page.bg.img), 'la imagen sigue guardada');
});

test('un PDF dañado no crea nada y avisa', async () => {
  const before = profile.notebooks.length;
  const junk = new Uint8Array(4096); crypto.getRandomValues(junk);
  const r = await importPdf(new File([junk], 'roto.pdf'), { folderId: null });
  assertEq(r, null);
  assertEq(profile.notebooks.length, before);
  assertEq(document.querySelector('#toast').textContent, 'No se pudo abrir este PDF.');
  await waitWrites();
  assertEq((await idbKeys()).filter(k => k.startsWith('img:')), []);
});

test('foco: nombre «.pdf» o en mayúsculas', async () => {
  await importPdf(pdfFile('.pdf'), { folderId: null });
  assertEq(profile.notebooks[0].title, 'PDF importado');
  await importPdf(pdfFile('TEMA.PDF'), { folderId: null });
  assertEq(profile.notebooks[0].title, 'TEMA');
});

test('foco: dos importaciones a la vez, la segunda avisa y no hace nada', async () => {
  const before = profile.notebooks.length;
  const first = importPdf(pdfFile(), { folderId: null });
  const second = await importPdf(pdfFile(), { folderId: null });
  assertEq(second, null);
  assertEq(document.querySelector('#toast').textContent, 'Ya se está importando un PDF.');
  await first;
  assertEq(profile.notebooks.length, before + 1);
});

test('la biblioteca muestra «Importar PDF» y el menú del editor «Añadir PDF al final»', async () => {
  renderLibrary();
  assert([...document.querySelectorAll('#grid .card')].some(c => c.textContent.includes('Importar PDF')), 'tarjeta en la biblioteca');
  await openTestNotebook(); editorMenu(); await sleep(50);
  assert(dialogButton('Añadir PDF al final'), 'opción en el menú del editor');
  await clickDialog('Listo');
});
test('si no se pueden guardar las imágenes, la importación para y lo dice', async () => {
  const orig = backend.setImg;
  backend.setImg = () => Promise.reject(new DOMException('blob', 'UnknownError'));
  try { await importPdf(new File([makeTestPdf()], 'Tema.pdf'), { folderId: null }); } finally { backend.setImg = orig; }
  assertEq(document.querySelector('#toast').textContent, 'No se pudieron guardar las diapositivas: se importaron 0 de 3 páginas.');
  assert(!profile.notebooks.some(n => n.title === 'Tema'), 'no debe quedar un cuaderno vacío');
});
