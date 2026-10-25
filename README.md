# Networking CPII 2026 · FAO Perú

App web estática (HTML + CSS + JS, sin instalación ni servidor) con identidad visual FAO.

## Qué incluye
- **Resumen**: KPIs, seguimiento por estado, prioridades, reglas de oro y alertas.
- **Organizaciones / Personas**: tarjetas con estado de contacto (Pendiente → Cerrado), filtros y ficha completa. Buscador global arriba (nombre de persona u organización).
- **Agenda**: quién está cuándo (extraída del Excel; contrastar con la agenda oficial).
- **Red de actores**: mapa interactivo, capas de relación, métricas (conexiones, brokers, cercanía, influencia, cohesión, grupos, puntos de articulación), hallazgos y camino desde FAO.
- **Alianzas**, **Leyenda y alertas** (supuestos y trazabilidad).

## Publicar en GitHub Pages (para abrir con wifi)
1. Crea un repositorio nuevo en github.com (por ejemplo `networking-cpii2026`). Si contiene datos internos, usa repositorio **privado** (GitHub Pages en privado requiere un plan de pago); en uno público cualquiera con el enlace podrá verlo.
2. Sube **el contenido** de esta carpeta (index.html, css/, js/, assets/) a la raíz: *Add file → Upload files*.
3. *Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: main / (root) → Save*.
4. En 1–2 minutos aparece la URL `https://TU-USUARIO.github.io/networking-cpii2026/`. Ábrela en el celular y agrégala a la pantalla de inicio.

## Notas importantes
- Los estados, notas y fechas se guardan **en el navegador de cada dispositivo** (localStorage). Para pasarlos entre dispositivos usa «Exportar respaldo» e «Importar respaldo» (pie de página). «Exportar seguimiento (.csv)» abre en Excel.
- Para actualizar datos: edita `js/data.js` (se generó desde el Excel y la búsqueda web del 23-oct-2026).
- La fuente Montserrat se carga desde Google Fonts (requiere internet); sin conexión se usa una fuente del sistema.
- Datos con etiqueta **web** provienen de la búsqueda web con fuente enlazada; no equivalen a [V] del Excel. Confirmar cifras antes de citarlas.
