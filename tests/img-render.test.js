function pixelAt(cv, px, py){
  const c = document.querySelector(cv), d = Math.min(window.devicePixelRatio || 1, 3);
  return [...c.getContext('2d').getImageData(Math.round((view.tx + px*view.s)*d), Math.round((view.ty + py*view.s)*d), 1, 1).data];
}
const bluish = p => p[2] > 150 && p[0] < 110;
const whitish = p => p[0] > 235 && p[1] > 235 && p[2] > 235;

test('una imagen insertada se pinta en su sitio, sobre el papel', async () => {
  await openTestNotebook(); await addTestImg(page, { x: 300, y: 200, w: 400, h: 300 });
  await ensureImgs(page); renderBg();
  assert(bluish(pixelAt('#cv-bg', 500, 350)), 'dentro: ' + pixelAt('#cv-bg', 500, 350));
  assert(whitish(pixelAt('#cv-bg', 150, 580)), 'fuera: ' + pixelAt('#cv-bg', 150, 580));
});

test('la tinta escrita encima de una imagen se ve encima', async () => {
  await openTestNotebook(); await addTestImg(page, { x: 300, y: 200, w: 400, h: 300 });
  await ensureImgs(page); renderBg();
  await drawWithPointer(densify([[350, 350], [650, 352]]));
  assert(pixelAt('#cv-ink', 500, 351)[3] > 0, 'la tinta está en su capa, por encima');
});

test('al abrir la página se cargan y se pintan sus imágenes', async () => {
  const n = await openTestNotebook(); closeNotebook();
  const pg = pages.get(n.pages[0]), o = await addTestImg(pg, { x: 300, y: 200, w: 400, h: 300 });
  savePageNow(pg); await waitWrites(); pages.clear(); bgCache.clear();
  openNotebook(n.id);
  for(let i = 0; i < 100 && !(page && bgCache.has(o.img)); i++) await sleep(20);
  await sleep(50); renderBg();
  assert(bluish(pixelAt('#cv-bg', 500, 350)), 'pintada: ' + pixelAt('#cv-bg', 500, 350));
});

test('foco: una página con más imágenes que BG_CACHE_MAX las tiene todas en caché', async () => {
  await openTestNotebook();
  for(let i = 0; i < BG_CACHE_MAX + 2; i++) await addTestImg(page, { x: 20 + i*40, y: 50, w: 30, h: 30 });
  await ensureImgs(page);
  assert(page.imgs.every(o => bgCache.has(o.img)), 'faltan imágenes de la página abierta en caché');
});

test('exportar la página en PNG y el cuaderno en PDF incluye la imagen', async () => {
  let blob = null, size = 0; window.saveFile = async (name, data) => { blob = data; size = data.size; };
  await openTestNotebook(); addPage(); await exportPDF(); const plain = size; closeNotebook();
  await openTestNotebook(); await addTestImg(page, { x: 300, y: 200, w: 400, h: 300 });
  await exportPNG();
  const bmp = await createImageBitmap(blob), c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0);
  const k = bmp.width / PW, p = [...c.getContext('2d').getImageData(500*k, 350*k, 1, 1).data];
  assert(bluish(p), 'PNG con la imagen: ' + p);
  addPage(); await addTestImg(pages.get(nb.pages[1]), { x: 100, y: 100, w: 800, h: 600 });
  await exportPDF();
  assert(size > plain * 1.5, 'PDF con imágenes ' + size + ' vs sin ellas ' + plain);
});

test('preparar otra página no expulsa sus imágenes aunque la abierta tenga muchas', async () => {
  await openTestNotebook(); addPage(); await goPage(0);
  for(let i = 0; i < BG_CACHE_MAX; i++) await addTestImg(page, { x: 20 + i*40, y: 50, w: 30, h: 30 });
  await ensureImgs(page);
  const other = pages.get(nb.pages[1]);
  for(let i = 0; i < 3; i++) await addTestImg(other, { x: 20 + i*40, y: 400, w: 30, h: 30 });
  await ensureImgs(other);
  assert(other.imgs.every(o => bgCache.has(o.img)), 'faltan imágenes de la página preparada');
  assert(page.imgs.every(o => bgCache.has(o.img)), 'faltan imágenes de la página abierta');
});
