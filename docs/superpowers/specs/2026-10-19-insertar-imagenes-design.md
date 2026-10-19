# Insertar imágenes en las páginas — diseño

Fecha: 2026-10-19 · Estado: aprobado en conversación, pendiente de revisión escrita

## Objetivo

Poder meter fotos (de la pizarra, del carrete, de la cámara o de Archivos) dentro de las páginas de un cuaderno. Las imágenes se colocan, se mueven, se redimensionan y se borran cuando quieras, y puedes escribir o subrayar encima o al lado. El uso principal son los apuntes de clase en el iPad.

**Éxito:**
- Inserto una foto del iPhone en pocos segundos.
- La coloco y la redimensiono con el lazo.
- Escribo encima con la misma fluidez que en el resto de la página.
- La imagen sale en el PDF exportado y en las copias de seguridad.
- Todo funciona sin conexión.

## Decisiones tomadas en la conversación

- La imagen es un **objeto movible**: se coloca, se mueve, se redimensiona y se borra en cualquier momento.
- La tinta y la imagen son **independientes**. Al mover una imagen, la tinta se queda donde está. Para mover las dos juntas se rodean con el lazo.
- **Enfoque A:** las imágenes son objetos propios de la página. No son trazos especiales ni elementos HTML superpuestos.

## Restricciones

- Siguen las del proyecto: HTML, CSS y JS planos, sin build ni dependencias nuevas, y funcionamiento sin conexión.
- **Datos:** solo se añaden. Una página sin imágenes se guarda exactamente igual que hoy, sin la clave `imgs`. No cambia el formato de los trazos (`encStroke`/`decStroke`) ni el de la diapositiva (`bg`), y las copias antiguas se restauran sin conversión.
- **Motor de dibujo:** pluma, fosforito, goma y garabato no cambian y solo actúan sobre `page.strokes`. Cambian la herramienta **lazo** (seleccionar, mover y redimensionar imágenes) y el **historial** (deshacer/rehacer), como se describe aquí.
- Al publicar hay que subir `VERSION` de `sw.js` y pedir permiso antes del push.

## Parte 1 · Uso

### Insertar

- En el menú **Opciones** del editor, dentro de «Acciones», aparece **«Insertar imagen»**. Abre `<input type="file" accept="image/*">`, que en el iPad ofrece Fototeca, Hacer foto y Elegir archivo.
- La imagen se coloca **centrada en la zona de la página que se ve en pantalla**. Su lado mayor mide como mucho `IMG_INSERT_FRAC = 0.6` del ancho de la página (600 unidades), sin ampliar nunca más allá de su tamaño natural a 1 px = 1 unidad. Mantiene sus proporciones.
- Si no cabe dentro de la página por algún lado, se recoloca para que quede entera dentro, desde 0 hasta PW×PH.
- Al insertarla, la herramienta pasa a **lazo** y la imagen queda **seleccionada**.
- **Errores:**
  - si la imagen no se puede leer: «No se pudo abrir esa imagen.»;
  - si no se puede guardar: «No se pudo guardar la imagen.».

  En los dos casos no se añade nada.

### Seleccionar, mover, redimensionar y borrar (herramienta lazo)

- **Tocar** una imagen, sin arrastrar más de 6 px de pantalla, selecciona solo esa imagen. Si se tocan varias superpuestas, se elige la de más arriba.
- **Rodear con el lazo** selecciona los trazos (con la regla actual del 50 % de puntos dentro) y las imágenes cuyo **centro** queda dentro del lazo.
- **Una selección que tiene imágenes** muestra el rectángulo discontinuo de siempre. Si es **una sola imagen**, muestra además **4 tiradores** en las esquinas: cuadrados de 10 px de pantalla, que se pueden tocar en un radio de `HANDLE_HIT = 22` px de pantalla.
- **Arrastrar dentro** de la selección mueve todo lo seleccionado: trazos e imágenes.
- **Arrastrar un tirador** redimensiona la imagen desde la esquina opuesta, que queda fija:
  - mantiene siempre las proporciones;
  - el tamaño mínimo es de 40 unidades en el lado menor;
  - no hay máximo, pero la imagen no puede salir de la página más de la mitad.
- **El menú de selección** (los botones «Duplicar» y «Borrar» que ya existen) actúa sobre trazos e imágenes:
  - «Duplicar» crea copias desplazadas 24 unidades, igual que con los trazos;
  - las copias de imagen reutilizan los mismos píxeles, con un `id` nuevo y el mismo `img`.
- La tecla Supr/Retroceso (teclado externo) borra también las imágenes seleccionadas, como ya hace con los trazos.

### Deshacer

Insertar, mover, redimensionar, duplicar y borrar imágenes son pasos normales del historial. Se mezclan con los trazos, y un solo «deshacer» deshace el último paso, sea del tipo que sea.

### Exportar y miniaturas

El PDF del cuaderno, la imagen PNG de una página y las miniaturas incluyen las imágenes, en su sitio y con su tamaño.

### Fuera de alcance

Girar, recortar, transparencia (los PNG con fondo transparente se guardan sobre fondo blanco), arrastrar imágenes desde otras apps, pegar desde el portapapeles, filtros y ajustes, y que la tinta se pegue a la imagen.

## Parte 2 · Técnica

### Datos

Documento de página (clave `page:<id>`), con un campo opcional nuevo:

```js
{ nb, strokes:[…], updated, bg?: {…}, imgs?: [ { id, img, x, y, w, h } ] }
```

- `id`: identificador del objeto imagen (`uid()`).
- `img`: clave de los píxeles, en `img:<img>`.
- `x`, `y`, `w`, `h`: posición y tamaño en unidades de página.

**En memoria:** `pages.get(id).imgs` es un array que **nunca se modifica**. Cada cambio crea un array nuevo, y eso permite que el historial guarde referencias. Si el array está vacío, `savePageNow` no escribe la clave `imgs`. `loadPage` solo acepta entradas con `id` e `img` de tipo texto y `x`, `y`, `w`, `h` numéricos y finitos con `w`, `h` > 0.

**Píxeles:** un JPEG en `img:<img>`, con el mismo backend que las diapositivas (`setImg`/`getImg`/`delImg`; `setImg` lanza si falla).

### Preparar la imagen al insertar

1. `createImageBitmap(file)`. Si falla, sale el aviso de «no se pudo abrir».
2. `scale = min(1, IMG_MAX_PX / max(ancho, alto))`, con `IMG_MAX_PX = 2000`.
3. Se dibuja en un canvas de ese tamaño **sobre fondo blanco** y se convierte con `toBlob('image/jpeg', IMG_QUALITY)`, donde `IMG_QUALITY = 0.85`. Después, `canvas.width = canvas.height = 0` y `bitmap.close()`.
4. `await backend.setImg(imgId, blob)`. Si falla, sale el aviso de «no se pudo guardar».
5. Solo después de guardar: se crea el objeto, `page.imgs = [...page.imgs, obj]`, se hace `commit` del estado anterior y se selecciona la imagen.

### Dibujo

**Orden de capas en el lienzo de fondo (`renderBg`):** papel → diapositiva (`drawBg`) → **imágenes (`drawImgs`)**. La tinta sigue en su capa, encima.

- **`drawImgs(ctx, pg, skip)`:** dibuja `pg.imgs` en orden con `drawImage`, saltándose los `id` de `skip`, que son las imágenes que se están moviendo.
- **Caché compartida:** `bgCache` pasa a guardar cualquier imagen por su clave `img`.
  - `ensureImgs(pg)` asegura la diapositiva y todas las imágenes de la página; `ensureBg` sigue funcionando.
  - El desalojo nunca expulsa una imagen de la página abierta: un conjunto `keep` reúne la diapositiva y todas las `img` de `page`.
- **Mientras se mueve o redimensiona:**
  - la capa de fondo se redibuja sin las imágenes seleccionadas;
  - la capa en vivo (`renderLive`) las dibuja en su posición provisional, igual que hoy hace con los trazos que se mueven;
  - al soltar, se hace `commit` y se redibuja.
- **Exportar y miniaturas:** `renderPageCanvas` dibuja `drawImgs` después de `drawBg`. Quien la usa (`pagesOverview`, `exportPNG`, `exportPDF`) hace antes `await ensureImgs(pg)`.

### Historial

- Cada paso guardado pasa a ser un estado `{ s: strokes, i: imgs }` (dos referencias), en lugar de solo el array de trazos.
- `commit(prev)` mantiene su forma: el que llama le pasa el array de trazos anterior, y el estado de imágenes se toma del `page.imgs` actual. Para los cambios de imágenes existe `commitImgs(prevImgs)`, que guarda `{ s: page.strokes, i: prevImgs }`.
- `undo`/`redo` restauran las dos partes, limpian la selección y vuelven a dibujar la capa de fondo y la de tinta.
- Las llamadas existentes a `commit(prev)` (pluma, goma, garabato, lazo) no cambian.

### Lazo

La selección actual `{ ids, bb, dx, dy, moving }` gana:
- `imgIds` (un `Set`);
- `scale`, que solo se usa al redimensionar;
- `handle`: la esquina agarrada.

**Al pulsar con el lazo** (`startTool`), el orden de comprobación es:
1. un tirador de la imagen seleccionada → acción `resize`;
2. dentro del rectángulo de la selección actual → acción `move` (como hoy);
3. encima de una imagen → seleccionar esa imagen y empezar `move` sobre ella;
4. si no, empezar un lazo nuevo (como hoy).

**Al terminar un lazo:** además de los trazos, se añaden a `imgIds` las imágenes con el centro dentro del polígono (`pointInPoly`). `bb` es la unión de los dos.

**`finishAct`, rama `move`:** aplica `dx`/`dy` a los trazos (como hoy) y a las imágenes seleccionadas. Las imágenes se aplican con `commitImgs`, o con un solo `commit` combinado si se movieron trazos e imágenes a la vez: un único paso de historial.

**Rama nueva `resize`:**
- calcula el nuevo `w`/`h` a partir de la distancia a la esquina opuesta;
- aplica las proporciones, el mínimo de 40 y el límite de salir como mucho la mitad de la página;
- guarda con `commitImgs`.

**Menú de selección:** «Duplicar» y «Borrar» operan también sobre `imgIds`, en un solo paso de historial.

### Liberar espacio

- **Al eliminar una página o un cuaderno**, `dropPageData` borra la `bg.img` y todas las `img` de `imgs`.
- **Al borrar una imagen suelta**, sus píxeles **no** se borran, porque se puede deshacer.
- **Limpieza de huérfanas:**
  - Se ejecuta `IMG_GC_DELAY = 5000` ms después de arrancar, como mucho una vez cada `IMG_GC_EVERY = 24 h` (se guarda en `prefs.imgGcAt`).
  - Lee todas las claves `img:`, junta las referenciadas por todas las páginas de todos los cuadernos (`bg.img` e `imgs[].img`) y borra las demás.
  - No hace nada si hay escrituras pendientes o una importación en curso.
  - Si algo falla a mitad, se detiene sin borrar nada más.

### Copia de seguridad

- **Exportar:** `images` incluye también las `img` de `imgs`, sin duplicados.
- **Restaurar:**
  - `keepImg` y la lista de imágenes sobrantes cuentan también las `imgs`;
  - se mantiene el orden seguro (escribir imágenes → páginas → perfil → borrar las sobrantes);
  - `bgCache` se vacía, cerrando antes los bitmaps.

## Pruebas

Se hacen con el ejecutor existente. Para las imágenes de prueba se usa `noiseJpeg` en distintas proporciones, envuelto en un `File`.

1. **Insertar:**
   - la imagen se añade a `page.imgs`, queda seleccionada y la herramienta pasa a lazo;
   - `img:` existe en IndexedDB;
   - el documento guardado lleva `imgs`;
   - una página sin imágenes no lleva la clave.
2. **Posición al insertar:** centrada en la zona visible, lado mayor de 600 unidades como mucho, proporciones exactas (±0,5) y dentro de la página.
3. **Errores:**
   - un archivo que no es imagen avisa «No se pudo abrir esa imagen.» y no añade nada;
   - si `setImg` falla, avisa «No se pudo guardar la imagen.» y no añade nada.
4. **Tocar** una imagen con el lazo la selecciona; tocar fuera deshace la selección.
5. **Mover** arrastrando con eventos de puntero reales: la posición cambia según el desplazamiento y un `undo()` la devuelve.
6. **Redimensionar** desde una esquina: la esquina opuesta queda fija, las proporciones se mantienen, se respeta el mínimo de 40 y un `undo()` lo devuelve.
7. **Lazo mixto:** rodear un trazo y una imagen y moverlos los mueve juntos en un solo paso de historial.
8. **Duplicar y Borrar** desde el menú de selección, con imágenes; deshacer y rehacer.
9. **Las herramientas de tinta no tocan imágenes:** pluma encima de una imagen, goma pasando por encima y garabato sobre ella dejan `page.imgs` intacto.
10. **Dibujo:** un píxel del centro de la imagen en `#cv-bg` tiene su color, y la tinta escrita encima se ve por encima.
11. **Exportar:** el PNG de la página tiene el color de la imagen en su sitio, y el PDF de una página con imagen es más grande que sin ella.
12. **Copia de ida y vuelta** con imágenes insertadas: queda idéntica, imágenes incluidas.
13. **Copia antigua** sin `imgs`: se restaura igual.
14. **Limpieza de huérfanas:**
    - borra un `img:` que no usa ninguna página y respeta los que usan `bg` e `imgs`;
    - no se ejecuta dos veces en 24 h.
15. **Eliminar la página o el cuaderno** borra los `img:` de sus imágenes.
16. **Sin regresión:** todas las pruebas existentes siguen pasando.

**Pendiente de verificar en un iPad real:**
- el selector con la Fototeca y la cámara;
- las fotos HEIC;
- mover y redimensionar con el dedo y con el lápiz;
- la memoria con fotos de 12 MP.
