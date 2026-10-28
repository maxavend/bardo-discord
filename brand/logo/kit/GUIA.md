# Bardo — Guía de uso del logo

> Una página para quien tenga que usar el logo sin ser diseñador. Ante la duda, usa los archivos de `maestros/` tal cual.

## 1. El logo

**Idea:** la voz se calma, se asienta en un renglón y cierra con punto final. Lo que se conversa en el canal queda escrito, y punto. La onda es la conversación, el renglón es el documento y el punto violeta es el acuerdo cerrado.

**Versiones**

| Versión | Úsala para | Archivo |
|---|---|---|
| Horizontal (principal) | cabeceras, README, documentos, web | `maestros/bardo-horizontal-color.svg` |
| Apilada | espacios cuadrados o verticales, portadas | `maestros/bardo-apilado-color.svg` |
| Símbolo | avatar, ícono, marca de agua | `maestros/bardo-simbolo-color.svg` |
| Símbolo pequeño | de 16 a 32 px: favicon, listas, menús | `maestros/bardo-simbolo-pequeno-color.svg` |
| Ícono de app | ícono de la Activity en Discord, tiendas | `variantes/bardo-simbolo-app-icon.svg` · `-1024.png` |
| Wordmark solo | cuando el símbolo ya aparece cerca | `maestros/bardo-wordmark-color.svg` |

Cada versión existe en **color** (tinta + punto violeta), **oscuro** (blanco + punto violeta claro), **violeta** (una tinta) y en negro y blanco puros (`variantes/`).

## 2. Espacio de respeto

Deja alrededor del logo un margen libre igual a **1 × el diámetro del punto final** en la versión que estés usando. El margen crece y se achica con el logo; nunca es una medida fija.

## 3. Tamaño mínimo

| Versión | Pantalla | Impresión |
|---|---|---|
| Horizontal | 120 px de ancho | 30 mm de ancho |
| Apilada | 80 px de ancho | 20 mm de ancho |
| Símbolo | 40 px de ancho | 10 mm |
| Símbolo pequeño | 16 px (favicon) | 5 mm |

Por debajo de 40 px usa siempre el **símbolo pequeño**: tiene el trazo más grueso y el punto más grande para que no se empaste.

## 4. Color

Los colores salen de los tokens de la app (`activity-app/src/styles.source.css`), así que el logo y la interfaz comparten violeta.

| Nombre | Uso | HEX | RGB | CMYK (aprox.) | Origen en la app |
|---|---|---|---|---|---|
| Violeta Bardo | punto final, placa del ícono | `#8200DB` | 130 0 219 | 41 100 0 14 | `--primary` (claro) |
| Violeta noche | acentos en modo oscuro | `#6E11B0` | 110 17 176 | 38 90 0 31 | `--primary` (oscuro) |
| Violeta claro | punto final sobre fondos oscuros | `#C27AFF` | 194 122 255 | 24 52 0 0 | familia `purple-400` |
| Tinta | onda, renglón y wordmark | `#0A0A0A` | 10 10 10 | 0 0 0 96 | `--foreground` |
| Lavanda | fondo claro de marca | `#FAF5FF` | 250 245 255 | 2 4 0 0 | `--primary-foreground` |

Pantone: el violeta de pantalla está fuera de la gama de impresión. Elige el spot con una guía física; los candidatos son Pantone 2592 C y 266 C.

**Combinaciones aprobadas (contraste medido):**
- Color sobre blanco o lavanda: tinta 19,8:1 · punto violeta 7,1:1.
- Blanco sobre violeta (ícono de app): 7,1:1.
- Oscuro sobre `#0A0A0A` o sobre el fondo de Discord (`#313338`): blanco 12,6:1 o más · punto violeta claro 4,5:1 o más.
- **No** pongas el violeta `#8200DB` sobre fondos oscuros: queda en 1,8–2,8:1 y se pierde.

En fotos, usa la versión blanca o negra sobre una zona tranquila, o el símbolo dentro de la placa violeta.

## 5. Tipografía

- El wordmark **no es una fuente**: está dibujado con el mismo trazo y los mismos remates redondos que el símbolo. No lo reemplaces escribiendo «bardo» con un teclado.
- Para textos que acompañan al logo, usa la fuente de la app: **Inter** (licencia SIL Open Font). Sistema de respaldo: `system-ui, sans-serif`.

## 6. Lo que no hay que hacer

- Estirar, aplastar, rotar o inclinar el logo.
- Cambiar el color del punto final por otro que no sea de la paleta, o pintar la onda de violeta y el punto de tinta.
- Mover, separar o cambiar el tamaño de las partes de una versión horizontal o apilada.
- Agregar sombras, contornos, degradados o brillos.
- Usar el símbolo grande por debajo de 40 px en lugar del símbolo pequeño.
- Poner el logo sobre fondos cargados sin una placa.

## 7. Archivos

```
brand/logo/kit/
  maestros/       SVG originales (color, oscuro, violeta) de cada versión
  variantes/      negro, blanco, violeta, cuadrado, favicon e ícono de app (SVG + PNG)
  web/            favicon.ico/.svg, PNG 16–512, apple-touch, maskable, site.webmanifest, head-snippet.html
  presentacion/   lámina con mockups (HTML + PNG por diapositiva)
  construccion/   láminas de construcción del símbolo
  apple/          ícono para iOS, iPadOS, macOS y watchOS (Icon Composer) y sus renders
```

## 8. Ícono para plataformas Apple

- **Archivo fuente:** `apple/Bardo.icon` (documento de Icon Composer). Arrástralo a un proyecto de Xcode como ícono de la app.
- **Capas planas, sin efectos dibujados.** Fondo con degradado violeta de arriba (más claro) hacia abajo, en Display P3 para conservar el violeta real de la app. Al frente van dos grupos: «Voz y renglón» y «Punto», este último delante. El brillo especular, la translucidez y la sombra los agrega Liquid Glass, como pide la guía de Apple.
- **Apariencias:** la predeterminada y la oscura están diseñadas (fondo sólido casi negro y punto en violeta claro). La tintada y la transparente las genera el sistema; el renglón queda un poco más translúcido para mantener la jerarquía.
- **watchOS:** con la máscara circular, el contenido se reduce al 84 % para no tocar el borde.
- **Para editar:** abre `Bardo.icon` en Icon Composer. Las capas fuente son `apple/Bardo.icon/Assets/*.svg`.

`web/favicon.svg` cambia solo entre modo claro y oscuro. Los PNG y el `.ico` van en violeta para leerse en ambos.
