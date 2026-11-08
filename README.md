# Papeles de Banda

Aplicación web para dividir guiones de partituras (un PDF por obra con los papeles seguidos)
en **una carpeta por instrumento y voz**, completando automáticamente las voces que faltan.

Funciona entera en el navegador: los PDF **no se suben a ningún servidor**.

## Cómo usarla

1. Abre `index.html` con doble clic en Chrome, Edge o Firefox. También se puede publicar en GitHub Pages
   (Settings → Pages → Deploy from branch) y usarla desde cualquier ordenador o tablet.
2. **Cargar y revisar**: arrastra los PDF. Cada página se asigna a un instrumento y voz leyendo el texto
   de su cabecera (p. ej. «Clarinete 2º en Sib»). Las páginas sin cabecera heredan la asignación de la
   anterior. Revisa las miniaturas y corrige lo necesario; usa «Ignorar» para portadas o el guion del director.
3. **Reparto**: tabla con todas las carpetas y lo que recibe cada una en cada obra. Cualquier casilla se
   puede cambiar a mano.
4. **Exportar**: descarga un ZIP con las carpetas (`01 Flauta/Obra A.pdf`, `05 Clarinete 3º/Obra B.pdf`…),
   un informe `Informe.csv` y, si quieres, un cuadernillo con todas las obras por carpeta.

## Reglas del reparto

- Para cada instrumento se busca el **máximo número de voces entre todas las obras**: si alguna obra
  tiene Clarinete 4º, se crean las carpetas Clarinete 1º a 4º.
- Si una obra **no tiene una voz** (p. ej. Clarinete 3º), se le da otra voz del mismo instrumento,
  repartida de forma **equilibrada**: dentro de la obra no se carga dos veces la misma voz mientras haya
  otra libre, y entre obras se **rota** (en una obra el 3º recibe el 2º, en la siguiente el 1º…).
- Si una obra **no tiene el instrumento**, se usa el primer sustituto de su lista que sí esté:
  instrumentos de la **misma familia y afinación**, para poder tocar sin transportar
  (Fliscorno ↔ Trompeta en Si♭, Saxo barítono ↔ Saxo alto en Mi♭, Bombardino ↔ Trombón en Do…).
  Se empareja la misma voz cuando existe (Fliscorno 2º ← Trompeta 2º).
- Un papel sin número (p. ej. «Trompa») vale para todas las voces de ese instrumento, y un papel
  combinado («Trompeta 2º y 3º») cubre ambas voces.
- Los papeles sustituidos llevan una nota en el pie: «Fliscorno 2º: se toca el papel de Trompeta 2º».

La pestaña **Instrumentos** permite editar nombres, familias, afinaciones, los textos que se buscan en las
cabeceras y la lista de sustitutos. Los cambios se guardan en el navegador.

## Limitaciones

- Los PDF deben tener los papeles separados por páginas (no sirve la partitura general con todos los
  instrumentos en la misma página).
- En PDF escaneados (sin texto) no se puede leer la cabecera: hay que asignar las páginas a mano. Basta con
  marcar la primera página de cada papel, las siguientes heredan la asignación.
- Si un PDF trae varias copias seguidas del mismo papel, marca las copias sobrantes como «Ignorar».

## Desarrollo

Sin dependencias de compilación. Las librerías están en `vendor/`
([pdf.js](https://mozilla.github.io/pdf.js/), [pdf-lib](https://pdf-lib.js.org/), [JSZip](https://stuk.github.io/jszip/)).

- `js/instruments.js`: catálogo de instrumentos y detección de instrumento/voz.
- `js/distribute.js`: algoritmo de reparto.
- `js/app.js`: interfaz.

Pruebas: `npm test` (Node 18 o superior).
