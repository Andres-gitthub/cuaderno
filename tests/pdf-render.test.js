function pixelAt(px, py){   // píxel de #cv-bg en coordenadas de página
  const c = document.querySelector('#cv-bg'), d = Math.min(window.devicePixelRatio || 1, 3);
  return [...c.getContext('2d').getImageData(Math.round((view.tx + px*view.s)*d), Math.round((view.ty + py*view.s)*d), 1, 1).data].slice(0, 3);
}
const reddish = p => p[0] > 150 && p[1] < 90 && p[2] < 90;
const whitish = p => p[0] > 235 && p[1] > 235 && p[2] > 235;
async function notebookWithBg(){   // cuaderno guardado con una página de fondo rojo, sin cargar en memoria
  const n = await openTestNotebook(); closeNotebook();
  await backend.setImg('red', await noiseJpeg(320, 180, [220, 30, 30]));
  const pg = pages.get(n.pages[0]); pg.bg = Object.assign({ img: 'red' }, bgRect(1600, 900));
  savePageNow(pg); await waitWrites(); pages.clear(); bgCache.clear();
  return n;
}

test('al abrir una página importada se pinta la diapositiva y el papel alrededor', async () => {
  const n = await notebookWithBg();
  openNotebook(n.id);
  for(let i = 0; i < 100 && !(page && bgCache.has('red')); i++) await sleep(20);
  await sleep(50); renderBg();
  assert(reddish(pixelAt(500, 310)), 'dentro de la diapositiva: ' + pixelAt(500, 310));
  assert(whitish(pixelAt(500, 580)), 'fuera, papel: ' + pixelAt(500, 580));
});

test('foco: si falta la imagen, la página se abre solo con el papel', async () => {
  const n = await openTestNotebook(); closeNotebook();
  const pg = pages.get(n.pages[0]); pg.bg = Object.assign({ img: 'no-existe' }, bgRect(1600, 900));
  savePageNow(pg); await waitWrites(); pages.clear();
  openNotebook(n.id);
  for(let i = 0; i < 100 && !page; i++) await sleep(20);
  await ensureBg(page); renderBg();
  assert(whitish(pixelAt(500, 310)), 'sin imagen se ve el papel: ' + pixelAt(500, 310));
});

test('la caché no pasa de BG_CACHE_MAX imágenes', async () => {
  for(let i = 0; i < BG_CACHE_MAX + 3; i++){
    await backend.setImg('c' + i, await noiseJpeg(32, 18));
    await ensureBg({ bg: { img: 'c' + i, x: 0, y: 0, w: 1, h: 1 } });
  }
  assertEq(bgCache.size, BG_CACHE_MAX);
  assert(!bgCache.has('c0') && bgCache.has('c' + (BG_CACHE_MAX + 2)), 'se descartan las más antiguas');
});

test('exportar la página como imagen incluye la diapositiva', async () => {
  const n = await notebookWithBg(); openNotebook(n.id);
  for(let i = 0; i < 100 && !page; i++) await sleep(20);
  let blob = null; window.saveFile = async (name, data) => { blob = data; };
  await exportPNG();
  const bmp = await createImageBitmap(blob), c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0);
  const k = bmp.width / PW, p = [...c.getContext('2d').getImageData(500*k, 300*k, 1, 1).data].slice(0, 3);
  assert(reddish(p), 'PNG exportado con diapositiva: ' + p);
});

test('el PDF exportado de páginas con diapositiva es más grande que sin ella', async () => {
  let size = 0; window.saveFile = async (name, data) => { size = data.size; };
  const plain = await openTestNotebook(); addPage(); await exportPDF(); const s0 = size; closeNotebook();
  const n = await openTestNotebook(); addPage();
  for(const [i, id] of nb.pages.entries()){
    await backend.setImg('e' + i, await noiseJpeg(640, 360));
    const pg = pages.get(id); pg.bg = Object.assign({ img: 'e' + i }, bgRect(1600, 900));
  }
  await exportPDF();
  assert(size > s0 * 1.5, 'con fondo ' + size + ' vs sin fondo ' + s0);
});
