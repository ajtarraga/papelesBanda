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

1. **Cargar y revisar**: arrastra las obras o pulsa «Elegir carpeta». Se admiten:
   - **Una carpeta por obra** con un PDF por papel (`clte-1.pdf`, `tpa-1-f.pdf`, `BAJOS.pdf`, `guion.pdf`…).
     El papel se reconoce por el **nombre del archivo** (abreviaturas habituales: `clte`, `tpa`, `tpta`, `tbon`,
     `bdino`, `sax-a`, `sax-t`, `flis`…; `tpa-1-e` = trompa en Mi♭, `tpa-1-f` = en Fa, `bdino-1-c` = bombardino en Do,
     `bdino-1-b` = en Si♭). Si el nombre no dice nada (`7.pdf`), se lee el contenido.
   - **Un PDF con todos los papeles** de una obra: se lee la cabecera de cada página (con **OCR** si está escaneado).
   - **Una carpeta con varias obras** (subcarpetas y PDF sueltos): cada subcarpeta y cada PDF suelto es una obra.
   La portada «Conductor» y la **partitura general** se reconocen solas y van al **guion del director**.
   Las copias repetidas del mismo papel dentro de un PDF se descartan («No es copia» si se equivoca).
   Revisa las miniaturas (clic para ampliar) y corrige lo necesario.
2. **Reparto**: tabla con todas las carpetas y lo que recibe cada una en cada obra. Cualquier casilla se
   puede cambiar a mano. Debajo se avisa de los papeles que no van a ninguna carpeta.
3. **Exportar**: descarga un ZIP con una carpeta por sección de la banda, la carpeta **Guiones**, un informe
   `Informe.csv` y, en cada carpeta, un **único PDF con todas las obras** (`00 Cl 1 - Todas las obras.pdf`, con un
   marcador por obra; se puede desactivar).

En Exportar se puede poner un **prefijo** (p. ej. «SC»): las carpetas se llaman «SC Cl 1», «SC Guiones»… y el PDF
con todas las obras de cada carpeta «SC Cl 1.pdf». Si una obra trae el guion en A4 y en A3, se usa el A4.

Los nombres de instrumento se reconocen en español, inglés, catalán, italiano, francés, alemán y neerlandés
(«Fluit», «Saxofoon», «Trombó», «Fiscorn», «Guió»…), con abreviaturas y números de orden en el nombre del archivo
(«18 Intermedio - Trombón 2.pdf»).

**Los PDF no se modifican**: un papel que es un archivo entero se copia tal cual (mismos bytes y nombre; si dos obras
tienen el mismo nombre de archivo se añade el nombre de la obra). De un PDF con todos los papeles solo se extraen las
páginas de cada instrumento, **todas** (un papel de varias páginas sale completo) a un PDF con el nombre de la obra.

## Mi banda (carpetas)

La pestaña **Mi banda** define las carpetas del ZIP. Por defecto: Fl, Ob, Cl 1, Cl 2, Cl B, SA, ST, Trp (trompa),
Trpt (trompeta), Tbn, Bno, Tb y Per. Cada carpeta recibe un instrumento y una voz (Cl 2 = clarinete 2º, que también
cubre un papel «2º y 3º»); **Per** tiene marcado «Todos los papeles» y recibe toda la percusión (caja, pandereta,
timbales, láminas…) con todas sus páginas. **Añadir también** mete papeles relacionados en la misma carpeta
cuando la obra los tiene (por defecto, el flautín va con la flauta en Fl). Se pueden añadir, quitar y renombrar carpetas. En «Reparto» se puede
cambiar al modo **automático** (una carpeta por voz, hasta el máximo de voces entre todas las obras).

## Transportar papeles

La página **Transportar** (`transportar.html`, enlazada desde la principal) transporta papeles en **MusicXML**
(`.musicxml`, `.xml` o `.mxl`, exportados desde MuseScore, Finale, Sibelius, Dorico…):

- Eliges el instrumento para el que está escrito y el de destino (p. ej. Bombardino en Do → Bombardino en Si♭):
  se calcula el intervalo (aquí, 9ª mayor), la nueva armadura y las alteraciones accidentales de cada compás.
  Si una armadura quedaría con más de 7 alteraciones, se escribe la enarmónica.
- La **clave** pasa a la del instrumento de destino, o a la que elijas (Sol, Fa, Do en 1ª/3ª/4ª…), y se puede
  subir o bajar una octava. Eligiendo el mismo instrumento se cambia solo la clave, sin cambiar el sonido.
- Se cambian solo las alturas (notas, armaduras, alteraciones, cifrados), la clave y el nombre del instrumento.
  **Matices, articulaciones, ligaduras, reguladores, textos, repeticiones, segno/coda, ensayos y demás señales se
  conservan** tal cual.
- Vista previa del original y del transportado, y descarga en **PDF** y **MusicXML** (o un ZIP con todos).

### Reconocer PDF con Audiveris

Un PDF es una imagen: antes de transportarlo hay que reconocer la música (OMR). Para hacerlo desde la página:

1. Instala [Audiveris](https://github.com/Audiveris/audiveris/releases) (gratuito): en Windows el
   `…-windows-x86_64.msi`, en Mac el `.dmg` (arrástralo a Aplicaciones), en Linux el `.deb` o Flatpak.
2. Abre la aplicación con **«Iniciar (Windows).bat»** o **«Iniciar (Mac-Linux).command»**: el servidor local
   busca Audiveris solo (`C:\Program Files\Audiveris`, `/Applications/Audiveris.app`, `/opt/audiveris`, Flatpak…).
   Si está en otra carpeta, indica la ruta del programa en la variable de entorno `AUDIVERIS`.
3. En «Transportar», carga el PDF y pulsa **Reconocer PDF**. El resultado se carga como MusicXML marcado como
   «reconocido automáticamente».

El reconocimiento comete errores (más en escaneos): compara la vista previa con el PDF y, si hace falta, descarga
el «MusicXML reconocido», corrígelo en MuseScore y vuelve a cargarlo. Esto no funciona en la versión publicada en
GitHub Pages (necesita Audiveris en tu ordenador). Alternativa sin Audiveris: MuseScore → Archivo → Importar PDF. Las percusiones sin altura no se transportan y
las alteraciones de los ornamentos (trinos) no se recalculan.

El grabado de la partitura lo hace [Verovio](https://www.verovio.org) (LGPL) y el PDF, jsPDF + svg2pdf.

## Reglas del reparto

- En modo automático, para cada instrumento se busca el **máximo número de voces entre todas las obras**: si
  alguna obra tiene Clarinete 4º, se crean las carpetas Clarinete 1º a 4º.
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
