# Progreso del Proyecto (Progress)

- **Turno 1 (24/03/2026):**
  - Creación de la estructura de carpetas y archivos del Memory Bank (`.context/`).
  - Análisis inicial del código y documentación en los archivos de contexto.

- **Turno 2 (24/03/2026):**
  - [x] Tarea: Resaltado Fijo de Estado Seleccionado.
    - Variable global `selectedEstadoId` añadida.
    - Expresiones `paint` de `estados-fill` y `estados-line` actualizadas con estado `select` prioritario sobre `hover`.
    - Helpers `encontrarIdEstado()` y `seleccionarEstado()` creados para centralizar la lógica.
    - `aplicarFiltros()` gestiona selección/deselección automáticamente para clic, dropdown y reset.

- **Turno 3 (24/03/2026):**
  - [x] Mejora 2: Exclusividad y Consistencia de Herramientas.
    - Eliminado `if (modoUnidadesCercanas) return;` del handler `click, estados-fill`.
    - `activarModoRuta()` y `activarModoIsocronas()` desactivan `modoUnidadesCercanas` si está activo.

- **Turno 4 (24/03/2026):**
  - [x] Mejora 3: Visualización de Conexiones en "Unidades Cercanas".
    - Fuente `lineas-cercanas-source` + capas de estilo neón y resaltado.
    - Lógica de `mostrarResultadosCercanas` y `limpiarLineasCercanas` implementada.
    - Click handler en líneas con popup de información.

- **Turno 5 (24/03/2026):**
  - [x] Mejora 4: Corrección de Interacciones y Persistencia de Red.
    - Capa `lineas-cercanas-hitbox` para facilitar clics.
    - Aislamiento de etiquetas de tiempo en `puntos-cercanos-source`.
    - Lógica de persistencia de red (`redCercanaActiva`, `datosPinesRed`) y fusión de pines en `aplicarFiltros`.

- **Turno 6 (24/03/2026):**
  - [x] Mejora 5: Selección Múltiple de Estados + Semaforización Consistente.
    - `estadosSeleccionados[]` + `selectedEstadoIds` (Set) reemplazan `selectedEstadoId` (scalar).
    - `sincronizarResaltadosEstados(nombres[])` + `fitBoundsEstados(nombres[])` + `actualizarUIEstados()` creadas.
    - Ctrl+clic en polígono = selección múltiple; clic normal = selección única.
    - Etiquetas visuales por estado en `#etiquetas-estados-seleccionados` con botón de cierre.
    - `enriquecerFeaturesConStock(features)` centraliza enriquecimiento de stock.
    - `unidadesVisibles` y `datosPinesRed` ahora incluyen datos de stock/cobertura.

- **Cierre de rama `detalles_y_multiagentes` (24/03/2026):**
  - Merge a `main` completado. Conflicto de `config.js` resuelto a favor de `main`.
  - Jerarquía de clics operativa: hitbox de líneas > pines DOM > polígonos de estado.
  - Estado de la herramienta Unidades Cercanas persiste correctamente al filtrar estados.
