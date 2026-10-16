// Entrada del Apple Pencil: trazos cortos y rápidos no deben perderse.
function penEvent(type, [x, y], id = 3){
  const st = document.querySelector('#stage'), r = st.getBoundingClientRect();
  st.dispatchEvent(new PointerEvent(type, {
    pointerId: id, pointerType: 'pen', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure: 0.5,
    clientX: r.left + view.tx + x*view.s, clientY: r.top + view.ty + y*view.s, bubbles: true, cancelable: true }));
}

test('un trazo de lápiz cuyo «levantar» se perdió no bloquea el siguiente', async () => {
  await openTestNotebook();
  penEvent('pointerdown', [200, 200]);
  penEvent('pointermove', [230, 210]);          // el pointerup de este trazo nunca llega
  penEvent('pointerdown', [300, 300]);
  penEvent('pointermove', [340, 310]);
  penEvent('pointerup', [340, 310]);
  await sleep(20);
  assertEq(page.strokes.length, 2, 'los dos trazos deben quedar en la página');
  assertEq(act, null, 'no debe quedar ningún trazo abierto');
});

test('un toque corto de lápiz (un punto) se dibuja', async () => {
  await openTestNotebook();
  penEvent('pointerdown', [500, 500]);
  penEvent('pointerup', [500, 500]);
  await sleep(20);
  assertEq(page.strokes.length, 1);
});

test('el lienzo bloquea los gestos táctiles del sistema', async () => {
  await openTestNotebook();
  for(const type of ['touchstart', 'touchmove', 'touchend']){
    const ev = new Event(type, { bubbles: true, cancelable: true });
    document.querySelector('#cv-live').dispatchEvent(ev);
    assert(ev.defaultPrevented, type + ' sobre el lienzo debe llevar preventDefault');
  }
});

test('los botones del menú de selección siguen recibiendo toques', async () => {
  await openTestNotebook();
  const ev = new Event('touchstart', { bubbles: true, cancelable: true });
  document.querySelector('#selmenu button').dispatchEvent(ev);
  assert(!ev.defaultPrevented, 'el toque sobre el menú de selección no debe bloquearse');
});
