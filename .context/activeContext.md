# Contexto Activo (Active Context)

## Tarea Actual: Mejoras de Visualización

**Estado:** Completado.

**Descripción:** Implementar la visualización de conexiones directas en la herramienta "Unidades Cercanas".

---

### Mejora 3: Visualización de Conexiones en "Unidades Cercanas"

**Plan de Ejecución:**
1.  **`script.js` - Crear Fuente de Datos para Líneas:** ✅
2.  **`script.js` - Estilo de Líneas Neón:** ✅
3.  **`script.js` - Generar y Dibujar Líneas:** ✅
4.  **`script.js` - Interactividad (Click y Resaltado):** ✅

---

## Notas Técnicas (para revisión del Arquitecto)

- Se añadieron `lineaSeleccionadaId` y `lineaPopup` como variables globales.
- Fuente `lineas-cercanas-source` añadida en `inicializarCapas()`, entre `ruta-layer` y `pines-labels` para que las líneas queden debajo de las etiquetas.
- `mostrarResultadosCercanas` ahora recibe `(resultados, origenCoords, origenClues)`. La firma se actualizó en la función y en la llamada desde `calcularUnidadesCercanas`.
- `limpiarLineasCercanas()` vacía la fuente, limpia el popup y resetea `lineaSeleccionadaId`. Se llama desde `desactivarModoCercanas()`.
- El click handler en `lineas-cercanas-main` maneja toggle (misma línea = deseleccionar), limpieza de estado previo y cierre del popup vía `lineaPopup.once('close', ...)`.
- **Posible residuo:** Si el usuario cambia de tema (toggle de estilo), `style.load` recrea las capas. `limpiarLineasCercanas()` no se llama en ese evento, por lo que los datos de la fuente se perderán pero el estado visual quedará limpio al recrear la fuente vacía. El `lineaSeleccionadaId` podría quedar con un valor obsoleto — el Arquitecto puede evaluar si se necesita un reset en el handler de `style.load`.

**Próxima Acción para Claude Code:** Ninguna. Esperando el siguiente plan del Arquitecto.
