# Papeles de Banda

Aplicación web para dividir guiones de partituras (un PDF por obra con los papeles seguidos)
en **una carpeta por instrumento y voz**, completando automáticamente las voces que faltan.

Funciona entera en el navegador: los PDF **no se suben a ningún servidor**.

## Cómo abrirla

- **Windows**: doble clic en `Iniciar (Windows).bat`. **Mac/Linux**: doble clic en `Iniciar (Mac-Linux).command`.
  Se abre el navegador con la aplicación; funciona sin conexión, OCR incluido. Deja abierta la ventana negra
  mientras la uses.
- También puedes abrir `index.html` directamente, pero entonces el OCR de PDF escaneados necesita internet.
- O publícala en GitHub Pages (Settings → Pages → Deploy from branch) y úsala desde cualquier ordenador o tablet.

## Cómo usarla

1. **Cargar y revisar**: arrastra los PDF. Cada página se asigna a un instrumento y voz:
   - Si el PDF tiene texto, se lee la cabecera (p. ej. «Clarinete 2º en Sib»).
   - Si es **escaneado**, se reconoce el texto con **OCR** (español e inglés).
   - La **portada** («Conductor», «Guion»…) y la **partitura general del director** se ignoran solas
     (se reconoce por la densidad de pentagramas).
   - Las **copias repetidas** del mismo papel se detectan comparando la imagen y se descartan
     («Copia de la pág. N»; botón «No es copia» si se equivoca).
   - Los papeles **solistas** («Solo Flute», «Trompeta solista») van a su propia carpeta.
   - Las páginas sin cabecera heredan la asignación de la anterior (segundas páginas de un papel). Si una
     página tiene el título de la obra pero no se lee el instrumento, queda «sin reconocer» para que la asignes.
   Revisa las miniaturas (clic para ampliar) y corrige lo necesario.
2. **Reparto**: tabla con todas las carpetas y lo que recibe cada una en cada obra. Cualquier casilla se
   puede cambiar a mano.
3. **Exportar**: descarga un ZIP con las carpetas (`01 Flauta/Obra A.pdf`, `05 Clarinete 3º/Obra B.pdf`…),
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
- Los instrumentos marcados como **graves** (clarinete bajo, saxo barítono, tuba…) toman la voz más grave
  del sustituto (Clarinete bajo ← Clarinete 3º).
- Los papeles solistas no se sustituyen: si una obra no tiene solista, esa carpeta se queda sin papel.
- Los papeles sustituidos llevan una nota en el pie: «Fliscorno 2º: se toca el papel de Trompeta 2º».

La pestaña **Instrumentos** permite editar nombres, familias, afinaciones, los textos que se buscan en las
cabeceras y la lista de sustitutos. Los cambios se guardan en el navegador.

## Limitaciones

- Los PDF deben tener los papeles separados por páginas (no sirve la partitura general con todos los
  instrumentos en la misma página).
- El OCR puede fallar con escaneos de mala calidad o cabeceras manuscritas: esas páginas quedan sin asignar o
  mal asignadas y hay que corregirlas a mano (basta con la primera página de cada papel).

## Desarrollo

Sin dependencias de compilación. Las librerías están en `vendor/`
([pdf.js](https://mozilla.github.io/pdf.js/), [pdf-lib](https://pdf-lib.js.org/), [JSZip](https://stuk.github.io/jszip/),
[tesseract.js](https://tesseract.projectnaptha.com/) con los idiomas inglés y español).

- `js/instruments.js`: catálogo de instrumentos y detección de instrumento/voz.
- `js/distribute.js`: algoritmo de reparto.
- `js/app.js`: interfaz.

Pruebas: `npm test` (Node 18 o superior).
