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
    - Eliminado `if (modoUnidadesCercanas) return;` del handler `click, estados-fill` — ahora el clic en polígono funciona mientras la herramienta está activa.
    - `activarModoRuta()` y `activarModoIsocronas()` desactivan `modoUnidadesCercanas` si está activo.

- **Turno 4 (24/03/2026):**
  - [x] Mejora 3: Visualización de Conexiones en "Unidades Cercanas".
    - Fuente `lineas-cercanas-source` + 4 capas (`glow`, `neon`, `main`, `highlight`) añadidas en `inicializarCapas()`.
    - `mostrarResultadosCercanas` genera FeatureCollection LineString con propiedades de origen/destino/tiempo.
    - `limpiarLineasCercanas()` creada y llamada desde `desactivarModoCercanas()`.
    - Click handler en `lineas-cercanas-main` con toggle, feature-state `seleccionada` y popup de información.