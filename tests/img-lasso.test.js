async function pageWithImg(rect = { x: 300, y: 200, w: 400, h: 300 }){
  await openTestNotebook();
  const o = await addTestImg(page, rect); await ensureImgs(page);
  setTool('lasso', true); renderBg();
  return o;
}
const img = id => page.imgs.find(o => o.id === id);

test('tocar una imagen con el lazo la selecciona; tocar fuera quita la selección', async () => {
  const o = await pageWithImg();
  await drawWithPointer([[500, 350], [500, 350]]);
  assert(selection && selection.imgIds.has(o.id), 'seleccionada');
  await drawWithPointer([[850, 560], [851, 560]]);
  assertEq(selection, null);
});

test('arrastrar una imagen la mueve y deshacer la devuelve', async () => {
  const o = await pageWithImg();
  await drawWithPointer(densify([[500, 350], [560, 390]]));
  assertEq([Math.round(img(o.id).x), Math.round(img(o.id).y)], [360, 240]);
  undo();
  assertEq([img(o.id).x, img(o.id).y], [300, 200]);
});

test('arrastrar una esquina redimensiona con proporciones y la esquina opuesta fija', async () => {
  const o = await pageWithImg();
  await drawWithPointer([[500, 350], [500, 350]]);           // seleccionar
  await drawWithPointer(densify([[700, 500], [800, 575]]));  // esquina inferior derecha
  const r = img(o.id);
  assertEq([r.x, r.y], [300, 200]);
  assert(Math.abs(r.w - 500) < 0.5 && Math.abs(r.h - 375) < 0.5, r.w + '×' + r.h);
  undo(); assertEq([img(o.id).w, img(o.id).h], [400, 300]);
});

test('foco: el tamaño mínimo es 40 y la imagen no puede sacar su centro de la página', async () => {
  const o = await pageWithImg();
  await drawWithPointer([[500, 350], [500, 350]]);
  await drawWithPointer(densify([[700, 500], [305, 205]]));
  const r = img(o.id);
  assert(Math.abs(Math.min(r.w, r.h) - 40) < 0.5, 'mínimo 40: ' + r.w + '×' + r.h);
  assertEq(resizeRect({ x: 900, y: 100, w: 80, h: 60 }, 2, 2000, 100), null);
});

test('el lazo selecciona trazos e imágenes a la vez y se mueven juntos en un solo paso', async () => {
  const o = await pageWithImg();
  page.strokes = [penStroke(densify([[200, 540], [280, 540]]))]; renderInk();
  const steps = H().u.length;
  await drawWithPointer(densify([[150, 150], [850, 150], [850, 580], [150, 580], [150, 152]]));
  assert(selection && selection.ids.size === 1 && selection.imgIds.has(o.id), 'selección mixta');
  await drawWithPointer(densify([[500, 350], [520, 360]]));
  assertEq([Math.round(img(o.id).x), Math.round(img(o.id).y)], [320, 210]);
  assert(Math.abs(page.strokes[0].bb[0] - (200 - page.strokes[0].w*0.8) - 20) < 0.5, 'el trazo también se movió');
  assertEq(H().u.length, steps + 1);
  undo(); assertEq([img(o.id).x, img(o.id).y], [300, 200]);
});

test('Duplicar y Borrar del menú de selección funcionan con imágenes', async () => {
  const o = await pageWithImg();
  await drawWithPointer([[500, 350], [500, 350]]);
  document.querySelector('#selmenu [data-sel=dup]').click();
  assertEq(page.imgs.length, 2);
  assertEq(page.imgs[1].img, o.img);
  assertEq([page.imgs[1].x, page.imgs[1].y], [324, 224]);
  document.querySelector('#selmenu [data-sel=del]').click();
  assertEq(page.imgs.map(x => x.id), [o.id]);
  undo(); assertEq(page.imgs.length, 2);
});

test('pluma, goma y garabato no tocan las imágenes', async () => {
  await pageWithImg();
  const before = JSON.stringify(page.imgs);
  setTool('pen', true); await drawWithPointer(densify([[320, 300], [680, 310]]));
  setTool('eraser', true); await drawWithPointer(densify([[320, 300], [680, 310]]));
  setTool('pen', true); await drawWithPointer(zigzag(320, 280, 300, 40, 4));
  assertEq(JSON.stringify(page.imgs), before);
});

test('foco: tocar una imagen con la pluma escribe y no la selecciona', async () => {
  await pageWithImg(); setTool('pen', true);
  await drawWithPointer([[500, 350], [500, 350]]);
  assertEq(selection, null);
  assertEq(page.strokes.length, 1);
});
