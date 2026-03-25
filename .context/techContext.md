# Contexto Técnico (Tech Context)

## Stack Tecnológico Actual
- **Frontend:** HTML5, CSS3, JavaScript (ES6+).
- **Librería de Mapa:** Mapbox GL JS v2.14.1.
- **APIs de Mapbox:**
  - `Directions API`: para el cálculo de rutas punto a punto.
  - `Isochrone API`: para la generación de polígonos de tiempo de viaje.
  - `Matrix API`: para el cálculo rápido de tiempos de viaje a múltiples destinos (herramienta "Unidades Cercanas").
- **Estilo:** CSS personalizado. No se utilizan frameworks de UI (como Bootstrap o Tailwind).
- **Iconografía:** Lucide Icons.
- **Gestión de Datos:** Carga inicial desde archivos JSON estáticos locales (`/data`). No hay una base de datos ni un backend de servidor dinámico.
- **Manejo de Estado:** Variables globales de JavaScript. No se utiliza un framework de estado (como Redux o Vuex).