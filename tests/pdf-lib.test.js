test('pdf.js se carga una sola vez y abre un PDF de prueba', async () => {
  const a = await loadPdfjs(), b = await loadPdfjs();
  assert(a === b, 'loadPdfjs debe devolver siempre el mismo módulo');
  assertEq(a.version, '4.10.38');
  const data = new Uint8Array(await makeTestPdf().arrayBuffer());
  const pdf = await a.getDocument({ data, isEvalSupported: false }).promise;
  assertEq(pdf.numPages, 3);
  const vp = (await pdf.getPage(3)).getViewport({ scale: 1 });
  assert(vp.height > vp.width, 'la página 3 es vertical');
  await pdf.destroy();
});

test('el service worker precachea pdf.js', async () => {
  const sw = await (await fetch('sw.js', { cache: 'no-store' })).text();
  assert(sw.includes("'vendor/pdfjs/pdf.min.mjs'"), 'falta pdf.min.mjs en PRECACHE');
  assert(sw.includes("'vendor/pdfjs/pdf.worker.min.mjs'"), 'falta pdf.worker.min.mjs en PRECACHE');
});
