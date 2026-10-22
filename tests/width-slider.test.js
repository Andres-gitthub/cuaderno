const sizeBtns = () => [...document.querySelectorAll('#sizes .sz')];
const pop = () => document.querySelector('#sizepop');
const slide = v => { const r = pop().querySelector('input[type=range]'); r.value = String(v); r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); };

test('tocar el grosor elegido abre la barra; tocar otro solo lo elige', async () => {
  await openTestNotebook();
  assert(pop().hidden, 'la barra empieza abierta');
  sizeBtns()[2].click();
  assertEq(ui.size.pen, 2);
  assert(pop().hidden, 'elegir otro grosor abrió la barra');
  sizeBtns()[2].click();
  assert(!pop().hidden, 'tocar el elegido no abrió la barra');
  sizeBtns()[2].click();
  assert(pop().hidden, 'tocarlo otra vez no la cerró');
});

test('la barra cambia el grosor del botón, el trazo nuevo y se guarda', async () => {
  await openTestNotebook();
  sizeBtns()[1].click();
  slide(6);
  assertEq(ui.widths.pen[1], 6);
  assertEq(toolWidth('pen'), 6);
  assert(/mm/.test(pop().textContent), 'no muestra los mm');
  assert(parseFloat(sizeBtns()[1].querySelector('i').style.width) > parseFloat(sizeBtns()[2].querySelector('i').style.width), 'el punto del botón no creció');
  await drawWithPointer(densify([[200, 300], [400, 320]]));
  assertEq(page.strokes[0].w, 6);
  await waitWrites(); await sleep(1300); await waitWrites();
  const P = await IDB.get('profile');
  assertEq(P.prefs.ui.widths.pen[1], 6);
});

test('los grosores no se salen del rango y se recuperan al arrancar', async () => {
  const u = { tool: 'pen', widths: { pen: [0.1, 5, 99], hl: 'roto', eraser: [10, 20] } };
  applyUiPrefs(u);
  assertEq(ui.widths.pen, [WIDTH_RANGE.pen[0], 5, WIDTH_RANGE.pen[1]]);
  assertEq(ui.widths.hl, SIZES.hl);
  assertEq(ui.widths.eraser, SIZES.eraser);
});

test('el grosor de la goma decide lo que borra', async () => {
  await openTestNotebook([penStroke(densify([[300, 300], [400, 300]]))]);
  setTool('eraser', true);
  ui.size.eraser = 0; ui.widths.eraser[0] = 3;
  await drawWithPointer(densify([[350, 320], [350, 330]]));
  assertEq(page.strokes.length, 1, 'la goma pequeña borró lejos');
  ui.widths.eraser[0] = 30;
  await drawWithPointer(densify([[350, 320], [350, 330]]));
  assertEq(page.strokes.length, 0, 'la goma grande no borró');
});

test('la barra se cierra al tocar fuera o al cambiar de herramienta', async () => {
  await openTestNotebook();
  sizeBtns()[1].click();   // el medio ya está elegido
  assert(!pop().hidden, 'no se abrió');
  await drawWithPointer(densify([[200, 300], [400, 320]]));
  assert(pop().hidden, 'no se cerró al dibujar');
  sizeBtns()[1].click();
  assert(!pop().hidden, 'no se volvió a abrir');
  setTool('hl');
  assert(pop().hidden, 'no se cerró al cambiar de herramienta');
});
