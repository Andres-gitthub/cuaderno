# Carpetas y garabatear para borrar — diseño

Fecha: 2026-10-16 · Estado: aprobado en conversación, pendiente de revisión escrita

## Objetivo

Acercar Cuaderno a GoodNotes para su uso principal: **apuntes de clase en el iPad**. Este subproyecto añade dos cosas:

1. **Carpetas** de un solo nivel en la biblioteca, para agrupar los cuadernos por asignatura.
2. **Garabatear para borrar**: tachar con la pluma encima de lo escrito lo borra.

Éxito: puedo crear una carpeta por asignatura, mover a ella mis cuadernos y abrirlos desde ahí. Y al tachar una palabra con la pluma desaparece, sin cambiar de herramienta, y se recupera con deshacer.

## Restricciones

- Siguen valiendo las del proyecto: HTML, CSS y JS planos en `index.html`, sin frameworks ni paso de build, funcionamiento sin conexión.
- **Compatibilidad de datos:** el formato de las páginas en IndexedDB y el de los trazos (`encStroke`/`decStroke`) no cambian. Las copias de seguridad exportadas antes de este cambio se restauran sin conversión.
- **Motor de dibujo:** solo se toca la rama `draw` de `finishAct`, con un único punto de enganche. No cambian `penPath`, `addPoint`, los gestos, el render ni el formato de los puntos.
- Al publicar, hay que subir `VERSION` en `sw.js` (`v1` → `v2`) para que el iPad reciba la versión nueva.

## Parte 1 · Carpetas

### Modelo de datos (enfoque A: dentro del perfil)

```js
profile = {
  v: 1,
  notebooks: [{ id, title, cover, paper, paperColor, pages, created, updated, lastPage, folder? }],
  folders:   [{ id, name, created }],   // nuevo; opcional en perfiles antiguos
  prefs: { ... }
}
```

- `notebook.folder`: id de una carpeta, o ausente para los cuadernos de la raíz.
- Al cargar un perfil (en `init` y al restaurar una copia): `profile.folders = Array.isArray(profile.folders) ? profile.folders : []`.
- Si un cuaderno apunta a una carpeta que no existe, se trata como si estuviera en la raíz al mostrarlo. El dato no se reescribe al cargar.
- `profile.v` sigue en 1: el cambio solo añade campos, así que una copia antigua es un perfil válido sin carpetas.

### Estado de la interfaz

- Variable nueva `curFolder` (id o `null`): la carpeta que se está viendo en la biblioteca. No se guarda; al arrancar, la app abre siempre la raíz.
- `closeNotebook()` vuelve a la vista de biblioteca que estaba abierta, porque `curFolder` no cambia al abrir un cuaderno.

### Biblioteca: vista raíz (`curFolder === null`)

Orden de la rejilla:
1. Tarjeta «Nuevo cuaderno», como ahora.
2. Tarjeta **«Nueva carpeta»**, con el mismo estilo de borde discontinuo y un icono de carpeta.
3. Las carpetas, ordenadas alfabéticamente por nombre (`localeCompare` en `es`).
4. Los cuadernos sin carpeta, ordenados por `updated` descendente, como ahora.

**Tarjeta de carpeta:**
- Un botón con forma de carpeta (pestaña superior, color neutro de la paleta: `--line` o `--card` con borde), con el mismo `aspect-ratio` que las portadas, para que la rejilla quede alineada.
- Debajo, en `.meta`: el nombre, «N cuadernos», y un botón `⋯` para sus opciones.
- Al tocarla: `curFolder = id` y se vuelve a pintar la biblioteca.

El texto de ayuda `#empty` se muestra cuando no hay ni cuadernos ni carpetas.

### Biblioteca: vista de carpeta (`curFolder !== null`)

- **Cabecera:** delante del título, un botón `‹ Cuadernos` (con el icono `back`) que hace `curFolder = null`. El `<h1>` muestra el nombre de la carpeta. El texto `#store-mode` y los botones de copia se mantienen igual.
- **Rejilla:**
  - «Nuevo cuaderno», que crea el cuaderno con `folder: curFolder`.
  - Los cuadernos de la carpeta, ordenados por `updated` descendente.
  - No aparece «Nueva carpeta».
- **Carpeta vacía:** el texto dice «Esta carpeta está vacía. Crea un cuaderno aquí o mueve uno desde el menú ⋯ de cualquier cuaderno.».
- Si `curFolder` deja de existir (por ejemplo, después de restaurar una copia), se vuelve a la raíz.

### Acciones

- **Nueva carpeta:** `askText('Nueva carpeta', '', 'Crear')`. Si el nombre queda vacío, se cancela. Si no, se añade `{ id: uid(), name, created: Date.now() }`, se llama a `saveProfile()` y se pinta de nuevo la biblioteca. El nombre tiene un máximo de 80 caracteres, el límite actual de `askText`.
- **Menú `⋯` de una carpeta:**
  - **«Cambiar nombre»**: `askText` con el nombre actual.
  - **«Eliminar carpeta»** (en rojo): pide confirmación con el texto «¿Eliminar la carpeta «X»? Los N cuadernos que contiene pasarán a la biblioteca. No se borra ningún cuaderno.». Al confirmar, se quita `folder` de esos cuadernos y la carpeta de `profile.folders`, y se llama a `saveProfile()`.
- **Menú `⋯` de un cuaderno:** se añade **«Mover a carpeta»** entre «Cambiar nombre» y «Eliminar cuaderno». Solo aparece si existe al menos una carpeta, o si el cuaderno está dentro de una.
  - Abre un diálogo con la lista: «Sin carpeta (biblioteca)» y luego cada carpeta. La opción actual se marca con `aria-pressed="true"`.
  - Al elegir una, se asigna o se quita `notebook.folder`, se llama a `saveProfile()` y se pinta de nuevo la biblioteca. `updated` no cambia, porque mover no es editar.
- Crear un cuaderno desde la vista de una carpeta lo deja dentro de esa carpeta. `newNotebookFlow` recibe la carpeta destino.

### Copia de seguridad

- **Exportar:** no hay cambios de código. `profile` ya incluye `folders` y los campos `folder`.
- **Restaurar:** `readBackup` sigue aceptando perfiles sin `folders`. Después de restaurar, se aplica la normalización de `folders` y se pone `curFolder = null`.

### Fuera de alcance

Subcarpetas, arrastrar y soltar, colores o iconos de carpeta, orden manual y buscar.

## Parte 2 · Garabatear para borrar

### Cuándo se evalúa

En `finishAct`, rama `kind === 'draw'`, antes de simplificar y añadir el trazo. Solo si se cumple todo esto:

- `cur.t === 'pen'`. El fosforito nunca se evalúa.
- `prefs().scribbleErase !== false`. Si no está definido, se considera activado.
- El trazo tiene al menos `SCRIBBLE_MIN_PTS` puntos.

Funciona con cualquier puntero: lápiz, dedo o ratón.

### Reconocimiento: `isScribble(P)`

`P` son los puntos en bruto de `cur.pts` (formato `[x, y, p, …]`). Es un garabato si se cumplen las tres condiciones:

1. **Ida y vuelta sobre el eje principal.**
   - Se calcula el eje principal por PCA: la dirección del vector propio mayor de la covarianza de (x, y).
   - Se proyecta cada punto sobre ese eje.
   - Se recorren las proyecciones contando los **cambios de sentido con histéresis**: un cambio solo cuenta cuando, desde el último extremo, el retroceso supera `max(SCRIBBLE_MIN_SWING, extensión × SCRIBBLE_SWING_FRAC)`.
   - Hacen falta `≥ SCRIBBLE_MIN_REVERSALS` cambios.
2. **Densidad:** la longitud del trazo es al menos `SCRIBBLE_MIN_DENSITY` veces la diagonal de su caja.
3. **Tamaño mínimo:** la extensión sobre el eje principal es al menos `SCRIBBLE_MIN_SWING × 2`. Así se ignoran los tics.

La escritura normal («mmm», «www», cursiva) avanza de forma monótona sobre su eje principal, así que no cumple la condición 1.

**Riesgo aceptado:** una letra aislada y casi cuadrada (una «m» suelta) no tiene un eje claro, y podría pasar el filtro. En ese caso solo borra algo si escribes **encima** de trazos existentes que la letra cubre en un 60 % o más. Sobre papel vacío se queda siempre como tinta. Si en el iPad molesta, se puede subir `SCRIBBLE_MIN_REVERSALS` o desactivar la función con el interruptor.

### Qué se borra: `scribbleTargets(P, strokes)`

- **Zona:** el contorno convexo de los puntos del garabato (monotone chain), ampliado `SCRIBBLE_PAD` unidades de página desde el centroide.
- Para cada trazo de `page.strokes`:
  - Descarte rápido si su `bb` no corta la caja de la zona.
  - Si no se descarta, se mide la **fracción de su longitud** dentro de la zona. Se recorre cada segmento de sus puntos, dividido en tramos de `≤ 4` unidades. Cada tramo cuenta con su longitud si su punto medio cae dentro, comprobado con `pointInPoly`, que ya existe.
  - Un trazo de un solo punto cuenta como 100 % si ese punto está dentro.
- Se borra si la fracción es `≥ SCRIBBLE_COVER`. Los fosforitos también se pueden borrar con un garabato de pluma.

### Efecto

- **Si hay objetivos:**
  - `prev = page.strokes`.
  - `page.strokes = prev.filter(s => !targets.has(s.id))`.
  - El garabato **no** se añade.
  - `clearSelection()`, `renderInk()`, `commit(prev)`.
  - Todo esto es un único paso de deshacer.
- **Si no hay objetivos:** el flujo sigue igual que hoy y el garabato se guarda como tinta.
- **Primera vez:** si `!prefs().scribbleSeen`, se pone a `true`, se llama a `saveProfileSoon()` y se muestra el aviso «Garabato: borrado. Deshaz para recuperarlo.».

### Interruptor

En `editorMenu()`, dentro de «Acciones», se añade un botón de alternar **«Garabatear para borrar: Sí/No»** con `aria-pressed`. Escribe `prefs().scribbleErase` y llama a `saveProfileSoon()`. Es un ajuste global, no de cada cuaderno.

### Constantes (en unidades de página; la página mide 1000 × 1414)

```js
const SCRIBBLE_MIN_PTS = 12;
const SCRIBBLE_MIN_REVERSALS = 4;
const SCRIBBLE_MIN_SWING = 8;
const SCRIBBLE_SWING_FRAC = 0.35;
const SCRIBBLE_MIN_DENSITY = 2.5;
const SCRIBBLE_PAD = 4;
const SCRIBBLE_COVER = 0.6;
```

Van juntas, con un comentario, para ajustarlas después de probar en el iPad.

### Cambio en el motor (completo)

En la rama `draw` de `finishAct`, dentro de `if(cur.pts.length){ … }`, antes de `simplify`:

```js
if(tryScribbleErase(cur)){ cur = null; requestLive(); return; }
```

Ojo: la comprobación de `hasPressure` que está al principio de la rama debe ejecutarse antes, como ahora. Todo lo demás vive en funciones nuevas: `isScribble`, `scribbleTargets`, `convexHull`, `coverFraction` y `tryScribbleErase`.

## Pruebas

Se hacen con el mismo método que se usó en la PWA: servidor local, navegador de la app y Edge sin interfaz por CDP para lo que lo requiera.

**Carpetas**
1. Crear una carpeta, crear un cuaderno dentro, recargar: el cuaderno sigue dentro de la carpeta.
2. Mover un cuaderno de la raíz a la carpeta y de vuelta.
3. Eliminar una carpeta con 2 cuadernos: los dos aparecen en la raíz y sus páginas siguen intactas.
4. Restaurar una copia **antigua**, sin `folders` (la de la sesión anterior): la biblioteca carga sin errores y todos los cuadernos están en la raíz.
5. Exportar una copia con carpetas, restaurarla y comparar: perfil y páginas idénticos.

**Garabato** (trazos sintéticos inyectados con `makeStroke` y llamadas directas a `tryScribbleErase`)
1. Un garabato horizontal encima de una palabra (varios trazos cortos) los borra todos y el garabato no queda.
2. Un garabato sobre papel vacío no borra nada y queda como tinta.
3. «mmmm», «wwww» y una línea en cursiva no se detectan como garabato.
4. Un subrayado largo que solo cruza el borde de la zona no se borra (cubierto < 60 %).
5. Después del borrado, `undo()` devuelve exactamente los trazos borrados.
6. Con `prefs.scribbleErase = false`, el caso 1 deja los trazos y añade el garabato.
7. Un garabato hecho con el fosforito no borra nada.
8. Un trazo dibujado a mano en la interfaz (arrastrando con el ratón) sigue guardándose igual que antes. Comprueba que no hay regresión en el dibujo.

**Pendiente de verificar en un iPad real:** los umbrales con escritura real a lápiz.

## Publicación

Subir `VERSION` en `sw.js` a `v2`, commit y push a `main`, y comprobar que el sitio publicado sirve la versión nueva.
