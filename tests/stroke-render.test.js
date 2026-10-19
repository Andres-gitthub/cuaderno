// Dibujo de trazos de pluma: sin huecos en giros cerrados ni muescas en curvas.
// Compara lo pintado por drawStroke con la cobertura ideal (círculos y segmentos del grosor local),
// a escala grande para ver píxeles sueltos.
function unpainted(xy, pressures, w = 2.8, K = 12){
  const P = []; xy.forEach(([x, y], i) => P.push(x, y, pressures ? pressures[i] : 0.6));
  const s = makeStroke('pen', '#000000', w, Float32Array.from(P));
  const b = bboxOf(P, w*2), W = Math.ceil((b[2]-b[0])*K), H = Math.ceil((b[3]-b[1])*K);
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.setTransform(K,0,0,K,-b[0]*K,-b[1]*K); x.fillStyle = '#000'; x.strokeStyle = '#000'; return x; };
  const real = mk(); drawStroke(real, s);
  const ideal = mk();
  for(let k=0;k<P.length/3;k++){ ideal.beginPath(); ideal.arc(P[k*3], P[k*3+1], radius(w, P[k*3+2])*0.8, 0, Math.PI*2); ideal.fill(); }
  for(let k=0;k<P.length/3-1;k++){ ideal.lineWidth = 2*Math.min(radius(w, P[k*3+2]), radius(w, P[k*3+5]))*0.8; ideal.lineCap = 'round'; ideal.beginPath(); ideal.moveTo(P[k*3], P[k*3+1]); ideal.lineTo(P[k*3+3], P[k*3+4]); ideal.stroke(); }
  const a = real.getImageData(0,0,W,H).data, d = ideal.getImageData(0,0,W,H).data;
  let holes = 0, inside = 0, painted = 0;
  for(let p=3;p<a.length;p+=4){ if(a[p] > 128) painted++; if(d[p] > 250){ inside++; if(a[p] < 128) holes++; } }
  return { holes, inside, painted };
}
const zig = densify([[0,0],[3,8],[6,0],[9,8],[12,0],[15,8]], 1);

test('una «v» cerrada no deja huecos', async () => {
  const r = unpainted(densify([[0,0],[6,14],[12,0]], 1.2));
  assertEq(r.holes, 0, 'píxeles sin pintar de ' + r.inside);
});

test('un zigzag fino no deja huecos', async () => {
  const r = unpainted(zig);
  assertEq(r.holes, 0, 'píxeles sin pintar de ' + r.inside);
});

test('giros con presión variable no dejan huecos', async () => {
  const xy = densify([[0,0],[6,14],[12,0],[18,14]], 1.5).slice(0, 40);
  const r = unpainted(xy, xy.map((_, k) => 0.2 + 0.8*Math.abs(Math.sin(k/3))));
  assertEq(r.holes, 0, 'píxeles sin pintar de ' + r.inside);
});

test('una curva con temblor de la mano no tiene muescas', async () => {
  const xy = []; for(let k=0;k<80;k++){ const a = k/80*Math.PI*1.6; xy.push([20*Math.cos(a) + 0.35*Math.sin(k*2.3), 20*Math.sin(a) + 0.35*Math.cos(k*1.7)]); }
  const r = unpainted(xy, xy.map((_, k) => 0.45 + 0.3*Math.sin(k/5)));
  assertEq(r.holes, 0, 'píxeles sin pintar de ' + r.inside);
});

test('el trazo no engorda: una recta pinta lo mismo que antes (±2 %)', async () => {
  const xy = densify([[0,0],[60,0]], 1.5), P = []; xy.forEach(([x, y]) => P.push(x, y, 0.6));
  const s = makeStroke('pen', '#000', 2.8, Float32Array.from(P)), K = 12, b = bboxOf(P, 6);
  const W = Math.ceil((b[2]-b[0])*K), H = Math.ceil((b[3]-b[1])*K);
  const count = draw => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.setTransform(K,0,0,K,-b[0]*K,-b[1]*K); x.fillStyle = '#000'; draw(x); let n = 0; const d = x.getImageData(0,0,W,H).data; for(let p=3;p<d.length;p+=4) if(d[p] > 128) n++; return n; };
  const before = count(x => x.fill(penPath(s.pts, s.w))), after = count(x => drawStroke(x, s));
  assert(Math.abs(after - before) / before < 0.02, 'antes ' + before + ', ahora ' + after);
});

test('el modo diagnóstico muestra eventos y fotogramas mientras se escribe', async () => {
  await openTestNotebook();
  assert(!document.querySelector('#diag'), 'sin ?diag no hay panel');
  startDiag();
  await drawWithPointer(densify([[200, 300], [500, 320]]));
  await sleep(1100);
  const t = document.querySelector('#diag').textContent;
  assert(/eventos\/s/.test(t) && /fotograma/.test(t) && /pintar/.test(t), 'texto del panel: ' + t);
});
