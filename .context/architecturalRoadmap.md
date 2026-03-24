# Hoja de Ruta Arquitectónica (Architectural Roadmap)

Este documento registra las mejoras técnicas y arquitectónicas propuestas para la evolución del proyecto. No son tareas activas, sino una lista de ideas priorizadas para futuros ciclos de desarrollo.

---

### 1. Implementar un Framework de UI
- **Propuesta:** Introducir un framework de CSS como **Tailwind CSS**.
- **Problema Actual:** El archivo `estilos.css` es personalizado y funcional, pero puede volverse difícil de mantener y escalar. La consistencia visual depende de la disciplina manual.
- **Beneficios:**
  - **Desarrollo Rápido:** Acelera la maquetación de componentes y la aplicación de estilos.
  - **Consistencia:** Asegura un sistema de diseño coherente (espaciado, colores, tipografía).
  - **Mantenimiento:** Reduce la necesidad de escribir CSS personalizado y evita la duplicación de estilos.

---

### 2. Centralizar el Manejo de Estado
- **Propuesta:** Adoptar una librería ligera para el manejo de estado, como **Zustand** o **Redux Toolkit**.
- **Problema Actual:** El estado se gestiona a través de variables globales (`modoRuta`, `origenRuta`, `unidadesVisibles`, etc.), lo cual puede generar efectos secundarios inesperados, dificulta la depuración y complica la escalabilidad (como discutido previamente).
- **Beneficios:**
  - **Fuente Única de Verdad:** El estado de la aplicación se almacena en un solo lugar, haciéndolo predecible.
  - **Trazabilidad:** Facilita el seguimiento de cambios en el estado y la depuración de errores.
  - **Escalabilidad:** Permite añadir nuevas funcionalidades complejas sin aumentar exponencialmente la complejidad de la gestión de estados.
- **Recomendación:** **Zustand** es una excelente primera opción por su simplicidad y mínima sobrecarga, encajando bien con la naturaleza actual del proyecto.