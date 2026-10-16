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
  assert(!isScribble(flat(zigzag(300, 300, 120, 30, 3))), 'solo 2 cambios de sentido');
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
