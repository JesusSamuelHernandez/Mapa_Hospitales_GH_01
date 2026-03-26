# Contexto Activo (Active Context)

## Misión Actual (Turno 10): Auditoría de Código y Refactorización

**Rama de Trabajo:** `feature/auditoria-y-ia`

**Objetivo:** Preparar el código de `script.js` para la integración de funcionalidades de IA, mejorando su legibilidad, mantenibilidad y escalabilidad.

### Plan de Acción para Claude Code

#### Fase 1: Limpieza de Código Muerto y Obsoleto

1.  **Eliminar Variables Globales no Utilizadas:**
    *   Revisar `script.js` en busca de variables declaradas a nivel global que ya no se usen.
    *   Ejemplo potencial: `lineaSeleccionadaId` (verificar si aún es necesario tras las últimas refactorizaciones).

2.  **Identificar Funciones Obsoletas:**
    *   Buscar funciones que pudieron quedar en desuso tras la centralización de lógica.
    *   Analizar helpers de estado (`encontrarIdEstado`), de filtros o de UI que ya no se invoquen.

3.  **Consolidar Lógica Redundante:**
    *   Revisar los listeners de eventos (`click`, `change`) para encontrar bloques de código repetidos que puedan ser extraídos a funciones.

#### Fase 2: Refactorización para Escalabilidad

1.  **Modularización del Estado de la Aplicación:**
    *   Agrupar variables globales relacionadas en un único objeto de estado (ej. `appState`). Esto facilitará el seguimiento de los cambios y la depuración.
    *   Ejemplo:
        ```javascript
        const appState = {
            modoOscuro: false,
            redCercanaActiva: false,
            modoRuta: false,
            // ... etc.
        };
        ```

2.  **Abstracción de Módulos de Herramientas:**
    *   Reorganizar el código agrupando las funciones y variables de cada herramienta (Rutas, Isócronas, Unidades Cercanas) en objetos o módulos cohesivos.
    *   Esto desacoplará la lógica de cada herramienta del scope global y facilitará añadir nuevas herramientas en el futuro.
    *   Ejemplo de estructura para el módulo de rutas:
        ```javascript
        const RoutingTool = {
            activo: false,
            origen: null,
            destino: null,
            marcadorOrigen: null,
            marcadorDestino: null,
            
            activar() { /* ... */ },
            desactivar() { /* ... */ },
            seleccionarPunto(hospital) { /* ... */ },
            calcular() { /* ... */ },
            limpiar() { /* ... */ }
        };
        ```

3.  **Centralización de la Gestión de Paneles UI:**
    *   Crear una función `gestionarPaneles(panelActivo)` que se encargue de mostrar/ocultar los diferentes paneles de herramientas (`#panel-ruta`, `#panel-isocronas`, `#panel-cercanas`) para evitar la lógica repetida en las funciones `activar`/`desactivar` de cada modo.

**Próxima Acción para Claude Code:** Iniciar la Fase 1 (Limpieza de Código) según el plan.

---

## Tareas Anteriores (Completadas)

- **Turno 9:** `btn-restablecer` como comando global de limpieza para todas las herramientas activas.
- **Turno 8:** Correcciones de comportamiento en Unidades Cercanas (reset completo y semaforización dinámica).
- **Turno 6:** Selección Múltiple de Estados y Semaforización Consistente.
- **Turno 5:** Corrección de Interacciones y Persistencia de Red.
- **Turno 4:** Visualización de Conexiones en "Unidades Cercanas".
- **Turno 3:** Exclusividad y Consistencia de Herramientas.
- **Turno 2:** Resaltado Fijo de Estado Seleccionado.
- **Turno 1:** Creación de la estructura de Memory Bank.
