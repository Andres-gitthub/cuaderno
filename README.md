# Cuaderno

App para escribir a mano en el iPad con el Apple Pencil. Funciona sin conexión y guarda los cuadernos en el propio iPad.

Organiza los cuadernos en carpetas (una por asignatura) y tacha con la pluma encima de algo para borrarlo.
Importa diapositivas en PDF y escribe encima.

## Publicar en GitHub Pages

1. Crea un repositorio en GitHub y sube el contenido de esta carpeta (`index.html`, `manifest.webmanifest`, `sw.js`, `icons/`, `vendor/`).
2. En el repositorio, ve a **Settings → Pages**, elige **Deploy from a branch**, la rama `main` y la carpeta `/ (root)`.
3. La app quedará en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`.

Cuando publiques cambios, sube la constante `VERSION` de `sw.js` (por ejemplo, de `v7` a `v8`). Así el iPad descarga la versión nueva.

## Instalar en el iPad

1. Abre la dirección anterior en **Safari**.
2. Toca **Compartir → «Añadir a pantalla de inicio»** y confirma.
3. Abre Cuaderno desde el icono. A partir de ahí funciona sin conexión.

## Copias de seguridad

Los cuadernos viven solo en el iPad. Usa **«Exportar copia»** en la biblioteca de vez en cuando y guarda el `.json` en Archivos o iCloud Drive. Con **«Restaurar copia»** se recuperan. Si borras la app de la pantalla de inicio, se borran también sus cuadernos.

## Probar en local

```bash
python3 -m http.server 8000
```

Después abre `http://localhost:8000/`.
