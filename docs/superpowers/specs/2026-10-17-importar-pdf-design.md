# Importar PDF y anotar encima — diseño

Fecha: 2026-10-17 · Estado: aprobado en conversación, pendiente de revisión escrita

## Objetivo

Poder importar las diapositivas de clase (PDF) en Cuaderno, escribir encima con el Apple Pencil y exportarlas con las anotaciones. El uso principal es preparar y repasar las asignaturas del máster en el iPad.

**Éxito:**
- Importo un tema de unas 40 diapositivas en pocos segundos.
- Escribo encima con la misma fluidez que en una página normal.
- El PDF exportado se ve nítido.
- Todo sigue funcionando sin conexión y tras restaurar una copia.

## Restricciones

- Siguen las del proyecto: HTML, CSS y JS planos, sin build ni frameworks, y funcionamiento sin conexión.
- **Compatibilidad de datos:** solo se **añaden** campos. Las páginas sin fondo, las copias antiguas y el formato de los trazos (`encStroke`/`decStroke`) no cambian.
- **Motor de dibujo:** no se toca la captura de trazos ni los gestos (`onDown`/`onMove`/`onUp`, `addPoint`, `finishAct`, `penPath`). Solo se amplía el **dibujado del fondo** (`renderBg`, `renderPageCanvas`) para pintar la imagen debajo de la tinta.
- La goma, el lazo y el garabato actúan solo sobre `page.strokes`. El fondo queda fuera de su alcance por construcción.
- pdf.js se fija en **`pdfjs-dist@4.10.38`, build `legacy`**, copiado en `vendor/pdfjs/`. Es posterior a 4.2.67, que corrige CVE-2024-4367. Se carga solo al importar y se precachea en el service worker.
- Al publicar, hay que subir `VERSION` de `sw.js` (`v4` → `v5`).

## Parte 1 · Uso

### Importar como cuaderno nuevo

- En la biblioteca (raíz o carpeta) se añade una tarjeta **«Importar PDF»**, con borde discontinuo e icono de documento. Va después de «Nuevo cuaderno» y, en la raíz, de «Nueva carpeta».
- Al tocarla se abre el selector de archivos: `<input type="file" accept="application/pdf,.pdf">`.
- Se crea el cuaderno así:
  - **título:** el nombre del archivo sin la extensión `.pdf`, recortado a 80 caracteres;
  - **papel:** `lined` en `white`;
  - **portada:** `COVERS[profile.notebooks.length % COVERS.length]`, la misma regla que «Nuevo cuaderno»;
  - **carpeta:** `curFolder`, si estás viendo una.
- Cada página del PDF se convierte en una página del cuaderno. Al terminar se abre el cuaderno por la página 1.

### Añadir a un cuaderno existente

- En `editorMenu()`, dentro de «Acciones», aparece **«Añadir PDF al final»**. Al terminar, el editor va a la primera página añadida.

### Página importada

**Dónde va la imagen.** En unidades de página (1000 × 1414), con `M = 40` de margen:
- **Ancho:** `w = PW − 2M = 920`.
- **Alto:** `h = w × (alto/ancho de la página del PDF)`.
- **Si `h > PH − 2M`** (PDF vertical o muy alto): `h = PH − 2M` y `w = h × (ancho/alto)`, centrado en horizontal.
- **Posición:** `x = (PW − w)/2`, `y = M`.
- Una diapositiva 16:9 ocupa por tanto de `y = 40` a `y ≈ 557`. Debajo queda el papel del cuaderno para las notas.

**Cómo se pinta, en este orden:**
1. El papel.
2. Un rectángulo blanco detrás de la imagen.
3. La imagen.
4. Un borde de 1 px con el color `#D3D8DF`.
5. La tinta.

### Progreso y errores

- **Progreso:** un aviso persistente, «Importando diapositiva N de T…», que se actualiza en cada página. Al terminar: «PDF importado: T páginas».
- **PDF dañado o con contraseña:** «No se pudo abrir este PDF.». No se crea nada: el cuaderno nuevo se crea solo cuando pdf.js ya ha abierto el documento.
- **Falla el dibujado de una página concreta:** la página se añade sin fondo, con un aviso al final: «N páginas no se pudieron convertir.».
- **Falla el guardado a mitad (sin espacio):** se paran las siguientes páginas, se conservan las ya importadas, y aparece el aviso «Sin espacio: se importaron N de T páginas.».
- **Archivo que no es PDF:** se trata igual que un PDF dañado.

### Exportar

«Exportar el cuaderno en PDF» y «Exportar esta página como imagen» incluyen la diapositiva con las anotaciones encima. El mecanismo actual se queda igual: una imagen por página.

### Fuera de alcance

Buscar texto en el PDF, enlaces que se puedan tocar, importar imágenes o fotos, varias diapositivas por página, girar páginas y elegir la calidad de importación.

## Parte 2 · Técnica

### Datos

**Documento de página** (en IndexedDB, clave `page:<id>`) con un campo opcional nuevo:

```js
{ nb, strokes:[…], updated, bg?: { img: '<imgId>', x, y, w, h } }
```

En memoria, la página (`pages.get(id)`) lleva el mismo `bg`. `loadPage` lo copia del documento y `savePageNow` lo escribe.

**Imagen** (clave `img:<imgId>`): un `Blob` JPEG. El backend local gana estos métodos, con el mismo patrón de memoria de respaldo que los demás:
- `getImg(id) → Blob | undefined`
- `setImg(id, blob)`
- `delImg(id)`

**Propiedad:** cada imagen pertenece a una sola página. Cuando una página con `bg` se elimina (`deletePageAt`, eliminar un cuaderno), se hace también `delImg(bg.img)`. Esto pasa por la misma cola `writer` que el resto de escrituras.

### pdf.js

- **Archivos:** `vendor/pdfjs/pdf.min.mjs` y `vendor/pdfjs/pdf.worker.min.mjs`, copiados de `pdfjs-dist@4.10.38/legacy/build/`. También se copia el `LICENSE` (Apache-2.0) como `vendor/pdfjs/LICENSE`.
- **Carga perezosa:** `loadPdfjs()` hace `import('./vendor/pdfjs/pdf.min.mjs')` una sola vez (la promesa se memoriza) y fija `GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.mjs'`.
- **Apertura:** `getDocument({ data, isEvalSupported: false })`.
- **Service worker:** `PRECACHE` añade los dos archivos `.mjs`. El `LICENSE` no hace falta.

### Conversión de cada página

Las páginas se procesan **en secuencia, una a una**:
1. `page.getViewport({ scale: 1 })` da el tamaño natural.
2. Se calcula `scale = IMPORT_WIDTH / ancho`, con `IMPORT_WIDTH = 2000`. Si el alto resultante pasa de `IMPORT_MAX_H = 2800`, se reduce para que quepa.
3. Se dibuja en un canvas con fondo blanco y se convierte con `toBlob('image/jpeg', IMPORT_QUALITY)`, donde `IMPORT_QUALITY = 0.85`.
4. **Inmediatamente después:** `canvas.width = canvas.height = 0` y `page.cleanup()`. Esto libera memoria, porque Safari limita mucho la de los canvas.
5. `backend.setImg(id, blob)`, se crea la página con `bg`, se llama a `savePageNow` y se actualiza el progreso.

Al terminar: `pdf.destroy()` y `saveProfile()`.

### Dibujado

**Caché de imágenes decodificadas:** `bgCache`, un `Map imgId → ImageBitmap | HTMLImageElement` con un máximo de **8** entradas. Al pasarse, se descarta la más antigua y se llama a su `close()` si existe.

- `ensureBg(pg) → Promise`: si la página tiene `bg` y la imagen no está en la caché, la lee con `getImg` y la decodifica con `createImageBitmap(blob)`. Si `createImageBitmap` no está disponible, usa `Image` con una URL de objeto.

**`drawBg(ctx, pg)`:** sincrónica. Si la imagen está en la caché, pinta el rectángulo blanco, la imagen y el borde. Si no, no pinta nada.

**`renderBg()`:** después de `drawPaper`, llama a `drawBg(cBg, page)`. Al abrir o cambiar de página:
- `goPage` lanza `ensureBg(page)`;
- al resolverse, si la página sigue siendo la actual, se llama a `requestRender()`.

**`renderPageCanvas(pg, n, width)`:** llama a `drawBg` después de `drawPaper`. Quien la usa (miniaturas en `pagesOverview`, `exportPDF`, `exportPNG`) hace antes `await ensureBg(pg)`.

### Copia de seguridad

- **`exportBackup`:** añade `images: { [imgId]: base64 }`, con todas las imágenes referenciadas por las páginas de la copia. Se leen con `getImg` y se codifican con `b64enc` sobre los bytes del Blob.
- **`readBackup`:** acepta `images` opcional; si viene, tiene que ser un objeto.
- **`restoreBackup`**, en este orden:
  1. Borra las imágenes de las páginas actuales que no estén en la copia.
  2. Escribe las imágenes de la copia, como `Blob` de tipo `image/jpeg`.
  3. Escribe las páginas.
  4. Escribe el perfil.

  Después vacía `bgCache`. Una copia antigua, sin `images`, se restaura como hoy.

### Constantes de importación

Las constantes `IMPORT_WIDTH`, `IMPORT_MAX_H`, `IMPORT_QUALITY` e `IMPORT_MARGIN = 40` van juntas en una sección «Importar PDF» de `index.html`.

## Pruebas

Todas usan el ejecutor existente (`node tests/run.mjs`). Las pruebas generan sus PDF dentro de la página con jsPDF, que ya está cargado: 2 páginas 16:9 apaisadas con un rectángulo de color, y 1 página A4 vertical.

1. **Importar como cuaderno nuevo:**
   - Se crea un cuaderno con el nombre del archivo y 3 páginas.
   - Cada página tiene `bg`, y existe `img:<id>` en IndexedDB con tipo `image/jpeg`.
   - El cuaderno queda en la carpeta actual.
2. **Posición del fondo:**
   - Página apaisada: `x = 40`, `w = 920`, `y = 40`, `h ≈ 517` (±2).
   - Página vertical: `h = 1334` y centrada.
3. **«Añadir PDF al final»** en un cuaderno con 2 páginas deja 5. Las nuevas van al final y el editor se sitúa en la 3.
4. **La diapositiva se pinta:**
   - Tras abrir la página, un píxel de `#cv-bg` dentro del rectángulo de la diapositiva tiene el color del rectángulo dibujado en el PDF de prueba.
   - Fuera de la diapositiva, el píxel es del papel.
5. **Las herramientas no tocan el fondo:** después de dibujar, borrar con la goma y garabatear sobre la diapositiva, `page.bg` sigue igual y la imagen sigue en IndexedDB.
6. **Liberar espacio:** al eliminar una página importada desaparece su `img:`, y al eliminar el cuaderno desaparecen todas.
7. **Copia de ida y vuelta** con imágenes: perfil, páginas e imágenes quedan idénticos. Se compara el base64 de cada imagen.
8. **Copia antigua sin `images`:** se restaura sin errores y las páginas no tienen `bg`.
9. **Exportar PDF** de un cuaderno importado: el número de páginas coincide y el tamaño es mayor que el de un cuaderno sin fondo con el mismo número de páginas.
10. **PDF dañado:** bytes al azar con nombre `.pdf`. No se crea ningún cuaderno, sale el aviso «No se pudo abrir este PDF.» y no queda ninguna clave `img:` nueva.
11. **Sin regresión:** todas las pruebas existentes (44) siguen pasando.

Además, la prueba sin red (`offline_test.mjs`) comprueba que la caché incluye `vendor/pdfjs/pdf.min.mjs` y `vendor/pdfjs/pdf.worker.min.mjs`.

**Pendiente de verificar en un iPad real:** tiempo y memoria al importar un tema real de unas 40 diapositivas, y la nitidez con zoom.

## Publicación

Subir `VERSION` a `v5`, añadir una línea al README («Importa diapositivas en PDF y escribe encima.»), commit, y **push solo con el visto bueno del usuario**.
