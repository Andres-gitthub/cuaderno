test('un zigzag de ida y vuelta es un garabato', async () => {
  assert(isScribble(flat(zigzag(300, 300, 120, 30, 6))), 'zigzag de 6 pasadas');
  assert(isScribble(flat(zigzag(300, 300, 60, 20, 5))), 'zigzag pequeño de 5 pasadas');
});

test('la escritura y las líneas no son garabatos', async () => {
  assert(!isScribble(flat(cursiveM(100, 100, 4))), 'mmmm');
  assert(!isScribble(flat(cursiveW(100, 100, 4))), 'wwww');
  assert(!isScribble(flat(cursiveM(100, 100, 8))), 'mmmmmmmm');
  assert(!isScribble(flat(densify([[100, 500], [700, 505]]))), 'subrayado');
  assert(!isScribble(flat(densify([[100, 100], [200, 200], [100, 300]]))), 'una sola vuelta');
  assert(!isScribble(flat(zigzag(300, 300, 120, 30, 2))), 'solo 1 cambio de sentido');
  assert(!isScribble(flat(densify([[100, 100], [140, 100], [100, 140], [140, 140]]))), 'una Z');
});

test('foco: trazos degenerados devuelven false sin lanzar', async () => {
  assertEq(isScribble(flat([[10, 10]])), false, 'un punto');
  assertEq(isScribble(flat([[10, 10], [20, 20]])), false, 'dos puntos');
  assertEq(isScribble(flat(Array.from({ length: 30 }, () => [50, 50]))), false, '30 puntos iguales');
  assertEq(isScribble([]), false, 'vacío');
});

test('convexHull de un cuadrado con un punto interior da 4 vértices', async () => {
  const hull = convexHull(flat([[0, 0], [10, 0], [10, 10], [0, 10], [5, 5]]));
  assertEq(hull.length, 8);
  assert(pointInPoly(5, 5, hull) && !pointInPoly(15, 5, hull), 'contenido del polígono');
});

test('coverFraction: dentro, fuera, a medias y de un solo punto', async () => {
  const sq = [0, 0, 100, 0, 100, 100, 0, 100];
  assertEq(coverFraction(penStroke(densify([[10, 50], [90, 50]])), sq), 1);
  assertEq(coverFraction(penStroke(densify([[200, 50], [300, 50]])), sq), 0);
  const half = coverFraction(penStroke(densify([[50, 50], [150, 50]])), sq);
  assert(half > 0.45 && half < 0.55, 'a medias: ' + half);
  assertEq(coverFraction(penStroke([[50, 50]]), sq), 1, 'un punto dentro');
});

test('scribbleTargets: borra la palabra cubierta y deja lo que solo cruza o está lejos', async () => {
  const letters = word(300, 305, 120, 5);
  const underline = penStroke(densify([[100, 330], [800, 330]]));
  const far = penStroke(densify([[300, 900], [400, 900]]));
  const ids = scribbleTargets(flat(zigzag(295, 300, 130, 30, 6)), letters.concat([underline, far]));
  assertEq([...ids].sort(), letters.map(s => s.id).sort());
});

test('basta un garabato rápido de 3 pasadas', async () => {
  assert(isScribble(flat(zigzag(300, 300, 120, 30, 3))), '3 pasadas');
  assert(isScribble(flat(zigzag(300, 300, 120, 10, 3))), '3 pasadas planas');
});

test('cuentan las pasadas desiguales', async () => {
  // vuelve solo un 28 % del ancho en la segunda pasada
  assert(isScribble(flat(densify([[300, 300], [420, 304], [386, 308], [420, 312], [300, 316]]))), 'pasadas desiguales');
});

test('un garabato plano borra las letras que sobresalen por arriba y por abajo', async () => {
  const letters = word(300, 300, 120, 5);          // letras de 20 de alto (y 300–320)
  const ids = scribbleTargets(flat(zigzag(295, 306, 130, 8, 3)), letters);
  assertEq([...ids].sort(), letters.map(s => s.id).sort());
});

test('scribbleStats explica la decisión con los mismos resultados que isScribble', async () => {
  const z = scribbleStats(flat(zigzag(300, 300, 120, 30, 3)));
  assertEq([z.ok, z.rev], [true, 2]);
  assert(z.extent > 100 && z.swing >= 8 && z.density > 2.5, JSON.stringify(z));
  const m = scribbleStats(flat(cursiveM(100, 100, 4)));
  assertEq([m.ok, m.rev], [false, 0]);
  for(const P of [flat(zigzag(300, 300, 60, 20, 5)), flat(cursiveW(100, 100, 4)), flat([[10, 10]])]) assertEq(scribbleStats(P).ok, isScribble(P));
});

// «ll» de un solo trazo, 40 de alto: las letras suben y bajan, y la palabra avanza hacia la derecha
const printLL = (x, y, gap = 10, h = 40) => densify([[x, y], [x, y+h], [x+gap, y], [x+gap, y+h]], 2);
const cursiveLL = (x, y, h = 40) => densify([[x, y+h], [x+12, y+6], [x+10, y], [x+6, y+5], [x+6, y+h],
  [x+18, y+6], [x+16, y], [x+12, y+5], [x+12, y+h], [x+20, y+h-8]], 2);

test('una «ll» y otras letras que suben y bajan no son garabatos', async () => {
  assert(!isScribble(flat(printLL(100, 100))), 'll de imprenta: ' + JSON.stringify(scribbleStats(flat(printLL(100, 100)))));
  assert(!isScribble(flat(printLL(100, 100, 4))), 'll de imprenta muy junta');
  assert(!isScribble(flat(cursiveLL(100, 100))), 'll en cursiva: ' + JSON.stringify(scribbleStats(flat(cursiveLL(100, 100)))));
  assert(!isScribble(flat(densify([[100, 140], [100, 100], [115, 140], [130, 100], [130, 140]], 2))), 'M');
  assert(!isScribble(flat(densify([[100, 100], [108, 140], [115, 110], [122, 140], [130, 100]], 2))), 'W');
  // inclinada 20°, como al escribir rápido
  const slant = printLL(100, 100).map(([x, y]) => [x + (140 - y)*0.36, y]);
  assert(!isScribble(flat(slant)), 'll inclinada');
});

test('un garabato de arriba abajo necesita más pasadas', async () => {
  const vert = passes => zigzag(300, 300, 120, 30, passes).map(([x, y]) => [y, x]);
  assert(!isScribble(flat(vert(3))), 'vertical de 3 pasadas');
  assert(isScribble(flat(vert(6))), 'vertical de 6 pasadas');
  assertEq(scribbleStats(flat(vert(6))).minRev, 5);
  assertEq(scribbleStats(flat(zigzag(300, 300, 120, 30, 3))).minRev, 2);
});
