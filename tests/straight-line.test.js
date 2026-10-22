// Dibuja con el puntero y, si se pide, se queda quieto `holdMs` antes de seguir con `after` y levantar
const drawHold = async (xy, holdMs = 0, after = [], pointerType = 'pen') => {
  const st = document.querySelector('#stage'), r = st.getBoundingClientRect();
  const fire = (type, [x, y]) => st.dispatchEvent(new PointerEvent(type, {
    pointerId: 7, pointerType, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure: 0.5,
    clientX: r.left + view.tx + x*view.s, clientY: r.top + view.ty + y*view.s, bubbles: true, cancelable: true }));
  fire('pointerdown', xy[0]);
  for(const p of xy.slice(1)) fire('pointermove', p);
  if(holdMs) await sleep(holdMs);
  for(const p of after) fire('pointermove', p);
  const last = after.length ? after[after.length-1] : xy[xy.length-1];
  fire('pointerup', last);
  await sleep(20);
};
// Línea casi recta con temblor de ±3 unidades
const wobbly = (x0, y0, x1, y1) => densify([[x0, y0], [x1, y1]], 3).map(([x, y], i) => [x, y + (i % 4 < 2 ? 3 : -3)]);
const maxDev = s => {
  const P = s.pts, n = P.length/3;
  let m = 0; for(let i=0;i<n;i++) m = Math.max(m, segDist(P[i*3], P[i*3+1], P[0], P[1], P[(n-1)*3], P[(n-1)*3+1]));
  return m;
};

test('isLineLike: casi recta sí; curvas, idas y vueltas y trazos cortos no', async () => {
  assert(isLineLike(flat(wobbly(100, 100, 400, 140))), 'casi recta');
  assert(isLineLike(flat(densify([[100, 100], [100, 400]]))), 'vertical');
  const arc = Array.from({ length: 40 }, (_, i) => [300 + 150*Math.cos(Math.PI*i/39), 300 - 150*Math.sin(Math.PI*i/39)]);
  assert(!isLineLike(flat(arc)), 'arco');
  assert(!isLineLike(flat(zigzag(300, 300, 120, 30, 3))), 'zigzag');
  assert(!isLineLike(flat(densify([[100, 100], [400, 100], [150, 102]]))), 'ida y vuelta');
  assert(!isLineLike(flat(densify([[100, 100], [110, 100]]))), 'demasiado corta');
  assert(!isLineLike(flat([[100, 100]])), 'un punto');
});

test('mantener quieto al final convierte el trazo en una recta', async () => {
  await openTestNotebook();
  await drawHold(wobbly(200, 300, 500, 330), 650);
  assertEq(page.strokes.length, 1);
  const s = page.strokes[0], P = s.pts, n = P.length/3;
  assert(maxDev(s) < 0.5, 'no es recta: ' + maxDev(s));
  assert(Math.hypot(P[0] - 200, P[1] - 303) < 4, 'inicio');
  assert(Math.hypot(P[(n-1)*3] - 500, P[(n-1)*3+1] - 330) < 6, 'final');
});

test('sin mantener, el trazo se queda como se dibujó', async () => {
  await openTestNotebook();
  await drawHold(wobbly(200, 300, 500, 330));
  assertEq(page.strokes.length, 1);
  assert(maxDev(page.strokes[0]) > 1.5, 'se enderezó sin mantener');
});

test('mantener al final de una curva no la endereza', async () => {
  await openTestNotebook();
  const arc = Array.from({ length: 60 }, (_, i) => [400 + 150*Math.cos(Math.PI*i/59), 400 - 150*Math.sin(Math.PI*i/59)]);
  await drawHold(arc, 650);
  assert(maxDev(page.strokes[0]) > 50, 'la curva se enderezó');
});

test('tras enderezar, mover el lápiz sin levantarlo mueve el extremo', async () => {
  await openTestNotebook();
  await drawHold(wobbly(200, 300, 500, 330), 650, [[480, 360], [450, 420]]);
  const s = page.strokes[0], P = s.pts, n = P.length/3;
  assert(maxDev(s) < 0.5, 'no es recta');
  assert(Math.hypot(P[(n-1)*3] - 450, P[(n-1)*3+1] - 420) < 1, 'el extremo no siguió al lápiz');
  assert(Math.hypot(P[0] - 200, P[1] - 303) < 4, 'el inicio se movió');
});

test('si el lápiz sigue moviéndose despacio no se endereza', async () => {
  await openTestNotebook();
  const st = document.querySelector('#stage'), r = st.getBoundingClientRect();
  const fire = (type, x, y) => st.dispatchEvent(new PointerEvent(type, {
    pointerId: 7, pointerType: 'pen', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure: 0.5,
    clientX: r.left + view.tx + x*view.s, clientY: r.top + view.ty + y*view.s, bubbles: true, cancelable: true }));
  const pts = wobbly(200, 300, 500, 330);
  fire('pointerdown', ...pts[0]);
  for(let i = 1; i < pts.length; i++){ fire('pointermove', ...pts[i]); if(i % 10 === 0) await sleep(60); }
  fire('pointerup', ...pts[pts.length-1]); await sleep(20);
  assert(maxDev(page.strokes[0]) > 1.5, 'se enderezó mientras se movía');
});

test('el fosforito también se endereza y deshacer la quita de una vez', async () => {
  await openTestNotebook();
  setTool('hl', true);
  await drawHold(wobbly(200, 300, 500, 330), 650);
  assertEq(page.strokes.length, 1);
  assertEq(page.strokes[0].t, 'hl');
  assert(maxDev(page.strokes[0]) < 0.5, 'no es recta');
  undo();
  assertEq(page.strokes.length, 0);
});
