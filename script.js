// CONFIGURACIÓN INICIAL
mapboxgl.accessToken = CONFIG.MAPBOX_TOKEN;

const TEMAS = [
    { style: 'mapbox://styles/mapbox/light-v11',   oscuro: false, icono: 'moon'  },
    { style: 'mapbox://styles/mapbox/dark-v11',    oscuro: true,  icono: 'map'   },
    { style: 'mapbox://styles/mapbox/streets-v12', oscuro: false, icono: 'sun'   },
];
let temaIdx   = parseInt(localStorage.getItem('temaIdx'), 10);
if (![0, 1, 2].includes(temaIdx)) temaIdx = 0;
let modoOscuro = TEMAS[temaIdx].oscuro;

const map = new mapboxgl.Map({
    container: 'map',
    style: TEMAS[temaIdx].style,
    center: [-99.1332, 19.4326],
    zoom: 4.5,
    pitch: 45,
    bearing: -10
});

// NavigationControl removido — controles centralizados en menú derecho

// VARIABLES GLOBALES
let datosHospitales = {};
let datosMedicamentos = {};
let datosExistencias = [];
let datosEstadosGeo = null;
let hoveredEstadoId      = null;
let selectedEstadoIds    = new Set();
let estadosSeleccionados = [];
let lineaSeleccionadaId  = null;
let lineaPopup           = null;
let redCercanaActiva     = false;
let datosPinesRed        = [];
let datosListos = false;
let listenersCapasConfigurados = false;

// Pins DOM
let marcadoresPines = [];
let pinPopup = null;

// Routing
let modoRuta = false;
let origenRuta = null;    // { clues, nombre, coords: [lon, lat] }
let destinoRuta = null;
let marcadorOrigen = null;
let marcadorDestino = null;
let rutaDebounceTimer = null;
let contadorPeticionesRuta = 0;
const MAX_PETICIONES_RUTA = 50;

// Isócronas
let modoIsocronas = false;

// Unidades visibles (filtradas por estado actual) — usadas por herramienta de cercanía
let unidadesVisibles = [];
let pinOrigenCercanas = null;   // elemento DOM del pin resaltado como origen
let tipoIsocronaEstandar = true;  // true = estándar (15/30/59), false = manual
let isocrona_debounceTimer = null;

// ─── CARGA INICIAL DE DATOS ───────────────────────────────────────────────────

map.on('load', async () => {
    try {
        console.log("Iniciando carga de datos...");

        const [resHosp, resMed, resExis, resEdo] = await Promise.all([
            fetch('./data/hospitales.json'),
            fetch('./data/medicamentos.json'),
            fetch('./data/existencias.json'),
            fetch('./data/ESTADOS_IMSB.json')
        ]);

        datosHospitales = await resHosp.json();
        datosMedicamentos = await resMed.json();
        datosExistencias = await resExis.json();
        datosEstadosGeo = await resEdo.json();

        // 1. Llenar el selector de medicamentos
        const selectorMed = document.getElementById('selector-medicamento');
        const clavesOrdenadas = Object.keys(datosMedicamentos).sort((a, b) =>
            datosMedicamentos[a].localeCompare(datosMedicamentos[b])
        );

        const todasLasOpciones = clavesOrdenadas.map(clave => ({
            value: clave,
            desc: datosMedicamentos[clave],
            searchStr: `${datosMedicamentos[clave]} ${clave}`.toLowerCase()
        }));

        clavesOrdenadas.forEach(clave => {
            const opt = document.createElement('option');
            opt.value = clave;
            selectorMed.appendChild(opt);
        });

        const inputBusqueda   = document.getElementById('busqueda-med');
        const listaMed        = document.getElementById('lista-med');
        const medSeleccionado = document.getElementById('med-seleccionado');
        const medTexto        = document.getElementById('med-seleccionado-texto');
        const btnLimpiar      = document.getElementById('btn-limpiar-med');

        function mostrarSugerencias(termino) {
            const t = termino.toLowerCase().trim();
            if (!t) { listaMed.style.display = 'none'; return; }
            const coincidencias = todasLasOpciones.filter(op => op.searchStr.includes(t)).slice(0, 10);
            if (!coincidencias.length) { listaMed.style.display = 'none'; return; }
            listaMed.innerHTML = '';
            coincidencias.forEach(op => {
                const item = document.createElement('div');
                item.className = 'sugerencia-item';
                item.innerHTML = `<span class="clave-tag">${op.value}</span>${op.desc}`;
                item.addEventListener('mousedown', () => seleccionarMed(op));
                item.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); seleccionarMed(op); });
                listaMed.appendChild(item);
            });
            listaMed.style.display = 'block';
        }

        function seleccionarMed(op) {
            if (redCercanaActiva) desactivarModoCercanas();
            selectorMed.value = op.value;
            inputBusqueda.value = '';
            listaMed.style.display = 'none';
            medTexto.textContent = `${op.value} — ${op.desc}`;
            medSeleccionado.style.display = 'flex';
            actualizarSelectorEstados(op.value);
            aplicarFiltros();
        }

        function limpiarMed() {
            if (redCercanaActiva) desactivarModoCercanas();
            selectorMed.value = '';
            inputBusqueda.value = '';
            listaMed.style.display = 'none';
            medSeleccionado.style.display = 'none';
            actualizarSelectorEstados('');
            aplicarFiltros();
        }

        inputBusqueda.addEventListener('input', (e) => mostrarSugerencias(e.target.value));
        inputBusqueda.addEventListener('blur', () => setTimeout(() => { listaMed.style.display = 'none'; }, 150));
        inputBusqueda.addEventListener('focus', (e) => { if (e.target.value) mostrarSugerencias(e.target.value); });
        // Evita que Mapbox capture los eventos táctiles del input en móvil
        inputBusqueda.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
        inputBusqueda.addEventListener('click',      (e) => e.stopPropagation());
        btnLimpiar.addEventListener('click', limpiarMed);

        document.getElementById('btn-restablecer').addEventListener('click', () => {
            selectorMed.value = '';
            inputBusqueda.value = '';
            listaMed.style.display = 'none';
            medSeleccionado.style.display = 'none';
            actualizarSelectorEstados('');
            estadosSeleccionados = [];
            document.getElementById('selector-estado').value = '';
            aplicarFiltros();
            actualizarUIEstados();
            map.flyTo({ center: [-99.1332, 19.4326], zoom: 4.5, pitch: 0, bearing: 0, duration: 1000 });
        });

        // Toggle panel izquierdo
        document.getElementById('btn-toggle-panel').addEventListener('click', () => {
            const oculto = document.getElementById('console').classList.toggle('oculto');
            document.getElementById('btn-toggle-panel').textContent = oculto ? '▶' : '◀';
        });

        // Menú derecho: abrir/cerrar
        document.getElementById('btn-menu-derecho').addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('panel-menu-derecho').classList.toggle('visible');
        });
        // Cerrar menú al hacer clic fuera
        document.addEventListener('click', () => {
            document.getElementById('panel-menu-derecho').classList.remove('visible');
        });

        // Panel de resultados: colapsar
        document.getElementById('btn-toggle-resultados').addEventListener('click', () => {
            const colapsado = document.getElementById('panel-resultados').classList.toggle('colapsado');
            document.getElementById('btn-toggle-resultados').textContent = colapsado ? '▼' : '▲';
        });

        document.getElementById('btn-modo').addEventListener('click', toggleModo);
        document.getElementById('btn-ruta').addEventListener('click', toggleModoRuta);
        document.getElementById('btn-limpiar-ruta').addEventListener('click', () => limpiarRuta(true));
        document.getElementById('btn-isocronas').addEventListener('click', toggleModoIsocronas);
        document.getElementById('btn-limpiar-isocrona').addEventListener('click', desactivarModoIsocronas);
        document.getElementById('btn-cercanas').addEventListener('click', toggleModoCercanas);
        document.getElementById('btn-limpiar-cercanas').addEventListener('click', desactivarModoCercanas);
        document.getElementById('btn-tipo-estandar').addEventListener('click', () => setTipoIsocrona(true));
        document.getElementById('btn-tipo-manual').addEventListener('click', () => setTipoIsocrona(false));
        document.getElementById('selector-estado').addEventListener('change', (e) => {
            const val = e.target.value;
            estadosSeleccionados = val ? [val] : [];
            aplicarFiltros();
            actualizarUIEstados();
        });
        document.getElementById('selector-medicamento').addEventListener('change', aplicarFiltros);

        document.getElementById('btn-todos-estados').addEventListener('click', () => {
            estadosSeleccionados = [];
            document.getElementById('selector-estado').value = '';
            aplicarFiltros();
            actualizarUIEstados();
            map.flyTo({ center: [-99.1332, 19.4326], zoom: 4.5, pitch: 0, bearing: 0, duration: 1000 });
        });

        // 2. Llenar el selector de estados
        actualizarSelectorEstados('');

        // 3. Marcar datos listos e inicializar capas
        datosListos = true;
        inicializarCapas();
        actualizarContador(-1);
        actualizarBtnModo();

        // Tour de bienvenida
        setTimeout(iniciarTour, 800);

        console.log("Sistema listo.");

    } catch (error) {
        console.error("Error cargando los archivos JSON. Revisa la carpeta /data", error);
    }
});

// Re-inicializar capas cada vez que cambia el estilo (incluyendo toggle modo)
map.on('style.load', () => {
    if (datosListos) {
        hoveredEstadoId = null;
        // Limpiar marcadores DOM (pines y ruta) — el style.load destruye los sources WebGL
        limpiarPines();
        origenRuta = null;
        destinoRuta = null;
        if (marcadorOrigen) { marcadorOrigen.remove(); marcadorOrigen = null; }
        if (marcadorDestino) { marcadorDestino.remove(); marcadorDestino = null; }
        const infoEl = document.getElementById('ruta-info');
        if (infoEl) infoEl.style.display = 'none';
        if (modoRuta) actualizarPanelRuta();
        clearTimeout(isocrona_debounceTimer);
        if (modoIsocronas) {
            const isoStyleEl = document.getElementById('isocrona-estado');
            isoStyleEl.textContent = 'Haz clic en una unidad médica.';
            isoStyleEl.classList.add('waiting-click');
        }
        inicializarCapas();
    }
});

// ─── INICIALIZACIÓN DE CAPAS (se ejecuta en cada cambio de estilo) ────────────

function inicializarCapas() {
    // --- TERRENO 3D ---
    map.addSource('mapbox-dem', {
        'type': 'raster-dem',
        'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
        'tileSize': 512,
        'maxzoom': 14
    });
    map.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 3 });

    map.addLayer({
        'id': 'hillshade',
        'type': 'hillshade',
        'source': 'mapbox-dem',
        'paint': {
            'hillshade-exaggeration': 0.5,
            'hillshade-shadow-color': modoOscuro ? '#000000' : '#473B24',
            'hillshade-highlight-color': modoOscuro ? '#555555' : '#ffffff',
            'hillshade-illumination-direction': 335
        }
    });

    map.addLayer({
        'id': 'sky',
        'type': 'sky',
        'paint': {
            'sky-type': 'atmosphere',
            'sky-atmosphere-sun': [0.0, 0.0],
            'sky-atmosphere-sun-intensity': 15
        }
    });

    // --- CAPA DE ESTADOS ---
    map.addSource('estados-src', {
        type: 'geojson',
        data: datosEstadosGeo,
        promoteId: 'fid'
    });

    const colorLinea = modoOscuro ? '#aaaaaa' : '#6366f1';

    map.addLayer({
        id: 'estados-fill',
        type: 'fill',
        source: 'estados-src',
        paint: {
            'fill-color': colorLinea,
            'fill-opacity': ['case',
                ['boolean', ['feature-state', 'select'], false], 0.3,
                ['boolean', ['feature-state', 'hover'],  false], 0.15,
                0
            ]
        }
    });

    map.addLayer({
        id: 'estados-line',
        type: 'line',
        source: 'estados-src',
        paint: {
            'line-color': colorLinea,
            'line-width': ['case',
                ['boolean', ['feature-state', 'select'], false], 3,
                ['boolean', ['feature-state', 'hover'],  false], 2.5,
                0.8
            ],
            'line-opacity': ['case',
                ['boolean', ['feature-state', 'select'], false], 1,
                ['boolean', ['feature-state', 'hover'],  false], 0.9,
                0.25
            ]
        }
    });

    // --- CAPA DE ISÓCRONAS ---
    map.addSource('isocrona-src', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
    });
    // Orden: mayor al fondo, menor encima
    map.addLayer({
        id: 'isocrona-layer-180',
        type: 'fill',
        source: 'isocrona-src',
        filter: ['==', ['get', 'contour'], 59],
        paint: { 'fill-color': '#b4f8f8', 'fill-opacity': 0.25, 'fill-outline-color': 'rgba(0,0,0,1)' }
    });
    map.addLayer({
        id: 'isocrona-layer-120',
        type: 'fill',
        source: 'isocrona-src',
        filter: ['==', ['get', 'contour'], 30],
        paint: { 'fill-color': '#76e2e2', 'fill-opacity': 0.15, 'fill-outline-color': 'rgba(0,0,0,1)' }
    });
    map.addLayer({
        id: 'isocrona-layer-60',
        type: 'fill',
        source: 'isocrona-src',
        filter: ['==', ['get', 'contour'], 15],
        paint: { 'fill-color': '#50b0b0', 'fill-opacity': 0.15, 'fill-outline-color': 'rgba(0,0,0,1)' }
    });
    // Capa manual: cualquier contorno que no sea 15/30/59
    map.addLayer({
        id: 'isocrona-layer-manual',
        type: 'fill',
        source: 'isocrona-src',
        filter: ['!', ['any',
            ['==', ['get', 'contour'], 15],
            ['==', ['get', 'contour'], 30],
            ['==', ['get', 'contour'], 59]
        ]],
        paint: { 'fill-color': '#aa84d1', 'fill-opacity': 0.5, 'fill-outline-color': 'rgba(0,0,0,0)' }
    });

    // --- CAPA DE RUTA ---
    map.addSource('ruta-src', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
    });
    map.addLayer({
        id: 'ruta-layer',
        type: 'line',
        source: 'ruta-src',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#00d4ff', 'line-width': 6, 'line-opacity': 0.9 }
    });

    // --- CAPAS DE CONEXIONES (Unidades Cercanas) ---
    map.addSource('lineas-cercanas-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
    });
    // Brillo exterior
    map.addLayer({
        id: 'lineas-cercanas-glow',
        type: 'line',
        source: 'lineas-cercanas-source',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#00ffff', 'line-width': 7, 'line-opacity': 0.1 }
    });
    // Neón intermedio
    map.addLayer({
        id: 'lineas-cercanas-neon',
        type: 'line',
        source: 'lineas-cercanas-source',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#00ffff', 'line-width': 3, 'line-opacity': 0.4 }
    });
    // Línea principal (interior)
    map.addLayer({
        id: 'lineas-cercanas-main',
        type: 'line',
        source: 'lineas-cercanas-source',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#e0ffff', 'line-width': 1, 'line-opacity': 0.9 }
    });
    // Resaltado al seleccionar (controlado por feature-state)
    map.addLayer({
        id: 'lineas-cercanas-highlight',
        type: 'line',
        source: 'lineas-cercanas-source',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
            'line-color': '#ffffff',
            'line-width': 4,
            'line-opacity': ['case', ['boolean', ['feature-state', 'seleccionada'], false], 1, 0]
        }
    });
    // Hitbox invisible para facilitar el clic en líneas delgadas
    map.addLayer({
        id: 'lineas-cercanas-hitbox',
        type: 'line',
        source: 'lineas-cercanas-source',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-width': 15, 'line-opacity': 0 }
    });

    // --- ETIQUETAS DE TIEMPO (Unidades Cercanas) ---
    map.addSource('puntos-cercanos-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
    });
    map.addLayer({
        id: 'tiempo-viaje-labels',
        type: 'symbol',
        source: 'puntos-cercanos-source',
        layout: {
            'text-field': ['get', 'tiempoFormateado'],
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-size': 12,
            'text-anchor': 'top',
            'text-offset': [0, 0.6],
            'text-allow-overlap': false,
            'visibility': 'none'
        },
        paint: {
            'text-color': '#00ffff',
            'text-halo-color': 'rgba(0,0,0,0.8)',
            'text-halo-width': 1.5
        }
    });

    // --- CAPA DE ETIQUETAS DE HOSPITALES ---
    map.addSource('pines-labels-src', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
    });
    map.addLayer({
        id: 'pines-labels',
        type: 'symbol',
        source: 'pines-labels-src',
        layout: {
            'text-field': ['get', 'nombre'],
            'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
            'text-size': 12,
            'text-anchor': 'bottom',
            'text-offset': [0, -5],
            'text-allow-overlap': false,
            'visibility': 'none'
        },
        paint: {
            'text-color': '#1a202c',
            'text-halo-color': 'rgba(255,255,255,0.9)',
            'text-halo-width': 2
        }
    });

    // Los hospitales se renderizan como DOM pins en renderizarPines()
    // Event listeners de estados — solo se registran una vez
    if (!listenersCapasConfigurados) {
        map.on('mousemove', 'estados-fill', (e) => {
            map.getCanvas().style.cursor = 'pointer';
            if (e.features.length > 0) {
                if (hoveredEstadoId !== null) {
                    map.setFeatureState({ source: 'estados-src', id: hoveredEstadoId }, { hover: false });
                }
                hoveredEstadoId = e.features[0].id;
                map.setFeatureState({ source: 'estados-src', id: hoveredEstadoId }, { hover: true });
            }
        });

        map.on('mouseleave', 'estados-fill', () => {
            map.getCanvas().style.cursor = '';
            if (hoveredEstadoId !== null) {
                map.setFeatureState({ source: 'estados-src', id: hoveredEstadoId }, { hover: false });
                hoveredEstadoId = null;
            }
        });

        map.on('click', 'estados-fill', (e) => {
            if (!e.features.length) return;
            const nomgeo     = e.features[0].properties.NOMGEO;
            const normNomgeo = normalizarEstado(nomgeo);
            const selectorEdo = document.getElementById('selector-estado');
            const opcion = Array.from(selectorEdo.options).find(opt =>
                normalizarEstado(opt.value) === normNomgeo
            );
            if (!opcion || !opcion.value) return;
            const nombreEstado = opcion.value;

            if (e.originalEvent.ctrlKey) {
                const idx = estadosSeleccionados.indexOf(nombreEstado);
                if (idx === -1) estadosSeleccionados.push(nombreEstado);
                else            estadosSeleccionados.splice(idx, 1);
            } else {
                estadosSeleccionados = [nombreEstado];
            }
            aplicarFiltros();
            actualizarUIEstados();
        });

        // --- CLICK EN LÍNEAS DE CONEXIÓN ---
        map.on('click', 'lineas-cercanas-hitbox', (e) => {
            e.stopPropagation();
            if (!e.features.length) return;

            const feat   = e.features[0];
            const featId = feat.id;
            const prop   = feat.properties;

            // Quitar resaltado anterior
            if (lineaSeleccionadaId !== null) {
                map.setFeatureState({ source: 'lineas-cercanas-source', id: lineaSeleccionadaId }, { seleccionada: false });
            }

            // Si es la misma línea → deseleccionar y cerrar popup
            if (lineaSeleccionadaId === featId) {
                lineaSeleccionadaId = null;
                if (lineaPopup) { lineaPopup.remove(); lineaPopup = null; }
                return;
            }

            // Nueva línea seleccionada
            lineaSeleccionadaId = featId;
            map.setFeatureState({ source: 'lineas-cercanas-source', id: lineaSeleccionadaId }, { seleccionada: true });

            const html = `<div style="font-family:'Segoe UI',sans-serif;padding:10px 12px;min-width:200px;">
                <div style="font-size:0.75rem;color:#718096;margin-bottom:4px;">ORIGEN</div>
                <div style="font-size:0.9rem;font-weight:bold;color:#1a202c;margin-bottom:8px;">${prop.origenNombre}</div>
                <div style="font-size:0.75rem;color:#718096;margin-bottom:4px;">DESTINO</div>
                <div style="font-size:0.9rem;font-weight:bold;color:#1a202c;margin-bottom:6px;">${prop.destinoNombre}</div>
                <div style="font-size:0.85rem;color:#718096;">Estado: ${prop.destinoEstado}</div>
                <div style="font-size:1rem;font-weight:bold;color:#6366f1;margin-top:6px;">${prop.tiempo}</div>
            </div>`;

            if (!lineaPopup) lineaPopup = new mapboxgl.Popup({ closeButton: true, closeOnClick: false, offset: 10 });
            lineaPopup.setLngLat(e.lngLat).setHTML(html).addTo(map);
            lineaPopup.once('close', () => {
                if (lineaSeleccionadaId !== null) {
                    map.setFeatureState({ source: 'lineas-cercanas-source', id: lineaSeleccionadaId }, { seleccionada: false });
                    lineaSeleccionadaId = null;
                }
            });
        });

        map.on('mouseenter', 'lineas-cercanas-hitbox', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'lineas-cercanas-hitbox', () => { map.getCanvas().style.cursor = '';        });

        listenersCapasConfigurados = true;
    }

    // Restaurar los puntos visibles con los filtros activos
    aplicarFiltros();
}

// ─── MODO OSCURO / CLARO ──────────────────────────────────────────────────────

function toggleModo() {
    temaIdx    = (temaIdx + 1) % TEMAS.length;
    modoOscuro = TEMAS[temaIdx].oscuro;
    localStorage.setItem('temaIdx', temaIdx);
    map.setStyle(TEMAS[temaIdx].style);
    document.body.classList.toggle('modo-oscuro', modoOscuro);
    actualizarBtnModo();
}

function actualizarBtnTodosEstados() {
    const btn = document.getElementById('btn-todos-estados');
    if (!btn) return;
    btn.style.display = estadosSeleccionados.length > 0 ? 'block' : 'none';
}

function actualizarBtnModo() {
    const icon = document.querySelector('#btn-modo .menu-icono i');
    if (!icon) return;
    icon.setAttribute('data-lucide', TEMAS[temaIdx].icono);
    if (window.lucide) lucide.createIcons();
}

// Aplicar preferencia guardada al ícono y clase body al cargar la página
document.body.classList.toggle('modo-oscuro', modoOscuro);
// Renderizar íconos Lucide una vez que el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (window.lucide) lucide.createIcons();
        actualizarBtnModo();
    });
} else {
    if (window.lucide) lucide.createIcons();
    actualizarBtnModo();
}

// ─── FUNCIONES DE APOYO ───────────────────────────────────────────────────────

function generarFeatures(nodos) {
    return Object.keys(nodos).map(clues => ({
        'type': 'Feature',
        'geometry': { 'type': 'Point', 'coordinates': [nodos[clues].lon, nodos[clues].lat] },
        'properties': {
            'clues': clues,
            'nombre': nodos[clues].hospital,
            'estado': nodos[clues].estado
        }
    }));
}

function enriquecerFeaturesConStock(features) {
    const claveMed = document.getElementById('selector-medicamento').value;
    if (!claveMed) return features;
    const conStock = datosExistencias.filter(ex => ex.clave_cnis === claveMed);
    const mapaStock = {};
    conStock.forEach(ex => { mapaStock[ex.clues] = { existencia: ex.existencia, cobertura: ex.cobertura }; });
    return features
        .filter(f => mapaStock[f.properties.clues] !== undefined)
        .map(f => {
            f.properties.stockActual = mapaStock[f.properties.clues].existencia;
            f.properties.cobertura   = mapaStock[f.properties.clues].cobertura;
            f.properties.medNombre   = datosMedicamentos[claveMed];
            return f;
        });
}

function aplicarFiltros() {
    const claveMed = document.getElementById('selector-medicamento').value;

    if (!claveMed && estadosSeleccionados.length === 0) {
        sincronizarResaltadosEstados([]);
        limpiarPines();
        unidadesVisibles = [];
        document.getElementById('leyenda-semaforo').style.display = 'none';
        actualizarContador(-1);
        actualizarBtnTodosEstados();
        // Sincronizar dropdown
        document.getElementById('selector-estado').value = '';
        return;
    }

    let resultantes = generarFeatures(datosHospitales);
    resultantes = enriquecerFeaturesConStock(resultantes);

    if (estadosSeleccionados.length > 0) {
        resultantes = resultantes.filter(f => estadosSeleccionados.includes(f.properties.estado));
        fitBoundsEstados(estadosSeleccionados);
        sincronizarResaltadosEstados(estadosSeleccionados);
    } else {
        sincronizarResaltadosEstados([]);
        map.flyTo({ center: [-99.1332, 19.4326], zoom: 4.5, duration: 800 });
    }

    // Actualizar arreglo de unidades visibles para herramienta de cercanía
    unidadesVisibles = resultantes.map(f => ({
        clues:       f.properties.clues,
        nombre:      f.properties.nombre,
        estado:      f.properties.estado,
        coords:      f.geometry.coordinates,
        stockActual: f.properties.stockActual,
        cobertura:   f.properties.cobertura,
        medNombre:   f.properties.medNombre
    }));

    // Fusionar pines de la red activa con los del filtro de estado
    if (redCercanaActiva) {
        const cluesEnRed = new Set(datosPinesRed.map(p => p.properties.clues));
        const resultantesSinDuplicados = resultantes.filter(r => !cluesEnRed.has(r.properties.clues));
        resultantes = [...datosPinesRed, ...resultantesSinDuplicados];
    }

    renderizarPines(resultantes);

    if (map.getLayer('pines-labels')) {
        map.setLayoutProperty('pines-labels', 'visibility', estadosSeleccionados.length > 0 ? 'visible' : 'none');
    }

    document.getElementById('leyenda-semaforo').style.display = claveMed ? 'block' : 'none';
    actualizarContador(resultantes.length);
    // Sincronizar dropdown con la selección
    const selectorEdo = document.getElementById('selector-estado');
    selectorEdo.value = estadosSeleccionados.length === 1 ? estadosSeleccionados[0] : '';
    actualizarBtnTodosEstados();
}

// ─── PIN MARKERS ──────────────────────────────────────────────────────────────

function colorSemaforoPins(cobertura) {
    if (cobertura === undefined || cobertura === null) return '#007cbf';
    if (cobertura < 0)    return '#4a5568';
    if (cobertura < 0.50) return '#e53e3e';
    if (cobertura < 0.75) return '#ecc94b';
    return '#38a169';
}

function crearPinSVG(colorBase, stock) {
    const stockTexto = stock !== undefined && stock !== null ? String(stock) : '';
    const fontSize   = stockTexto.length > 2 ? '22' : '28';
    return `<svg viewBox="0 0 100 120" width="52" height="65" style="display:block;cursor:pointer;">
      <path d="M50 5 C28 5 10 23 10 45 C10 72 50 115 50 115 L50 45 C50 23 50 5 50 5 Z" fill="${colorBase}" opacity="0.85"/>
      <path d="M50 5 C72 5 90 23 90 45 C90 72 50 115 50 115 L50 45 C50 23 50 5 50 5 Z" fill="${colorBase}"/>
      <circle cx="50" cy="45" r="25" fill="white"/>
      ${stockTexto ? `<text x="50" y="48" text-anchor="middle" dominant-baseline="middle" font-size="${fontSize}" font-family="Arial" font-weight="bold" fill="black">${stockTexto}</text>` : ''}
    </svg>`;
}

function limpiarPines() {
    marcadoresPines.forEach(m => m.remove());
    marcadoresPines = [];
    if (pinPopup) { pinPopup.remove(); }
    if (map.getSource('pines-labels-src')) {
        map.getSource('pines-labels-src').setData({ type: 'FeatureCollection', features: [] });
    }
}

function renderizarPines(features) {
    limpiarPines();
    if (map.getSource('pines-labels-src')) {
        map.getSource('pines-labels-src').setData({ type: 'FeatureCollection', features });
    }
    if (!pinPopup) pinPopup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true, offset: [0, -50] });

    features.forEach(feature => {
        const prop   = feature.properties;
        const coords = feature.geometry.coordinates;
        const color  = colorSemaforoPins(prop.cobertura);

        const el = document.createElement('div');
        el.style.zIndex = '2';
        el.innerHTML = crearPinSVG(color, prop.stockActual);

        // Click para modo ruta / isócronas / unidades cercanas o para mostrar popup
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (modoRuta) { seleccionarHospitalRuta({ clues: prop.clues, nombre: prop.nombre, coords }); return; }
            if (modoIsocronas) { manejarClickIsocronas(coords, prop.nombre); return; }
            if (modoUnidadesCercanas) {
                limpiarResaltadoOrigen();
                el.classList.add('pin-origen-cercanas');
                pinOrigenCercanas = el;
                calcularUnidadesCercanas(coords, prop.clues);
                return;
            }

            let stockHtml = '';
            if (prop.stockActual !== undefined && prop.stockActual !== null) {
                const coberturaTexto = prop.cobertura < 0 ? 'Sin demanda' : `${prop.cobertura} meses`;
                stockHtml = `<div style="border-top:1px solid #e2e8f0;margin-top:8px;padding-top:8px;">
                    <div style="font-size:0.8rem;color:#718096;margin-bottom:2px;">${prop.medNombre || ''}</div>
                    <div style="font-size:0.9rem;color:#2d3748;margin-bottom:2px;">Existencias: <strong>${prop.stockActual}</strong></div>
                    <div style="font-size:0.9rem;color:#2d3748;">Cobertura: <strong>${coberturaTexto}</strong></div>
                </div>`;
            }
            const html = `<div style="font-family:'Segoe UI',sans-serif;padding:10px 12px;min-width:220px;">
                <div style="font-size:1rem;font-weight:bold;color:#1a202c;margin-bottom:6px;line-height:1.3;">${prop.nombre}</div>
                <div style="font-size:0.85rem;color:#718096;">CLUES: ${prop.clues}</div>
                <div style="font-size:0.85rem;color:#718096;">Estado: ${prop.estado}</div>
                ${stockHtml}
            </div>`;
            pinPopup.setLngLat(coords).setHTML(html).addTo(map);
        });

        const marker = new mapboxgl.Marker(el, { anchor: 'bottom' })
            .setLngLat(coords)
            .addTo(map);
        marcadoresPines.push(marker);
    });
}

function actualizarContador(n) {
    const el = document.getElementById('contador');
    if (!el) return;
    el.innerText = n === -1 ? 'Selecciona un medicamento o estado' : `Unidades encontradas: ${n}`;
}

function actualizarSelectorEstados(claveMed) {
    const selectorEdo = document.getElementById('selector-estado');
    const seleccionActual = selectorEdo.value;

    let estadosFiltrados;
    if (claveMed) {
        const cluesConMed = new Set(
            datosExistencias.filter(ex => ex.clave_cnis === claveMed).map(ex => ex.clues)
        );
        estadosFiltrados = [...new Set(
            Object.entries(datosHospitales)
                .filter(([clues]) => cluesConMed.has(clues))
                .map(([, h]) => h.estado)
        )].sort();
    } else {
        estadosFiltrados = [...new Set(Object.values(datosHospitales).map(h => h.estado))].sort();
    }

    selectorEdo.innerHTML = '<option value="">Todos los estados</option>';
    estadosFiltrados.forEach(estado => {
        const option = document.createElement('option');
        option.value = estado;
        option.textContent = estado;
        if (estado === seleccionActual) option.selected = true;
        selectorEdo.appendChild(option);
    });

    if (seleccionActual && !estadosFiltrados.includes(seleccionActual)) {
        selectorEdo.value = '';
    }
}

function encontrarIdEstado(nombreEdo) {
    if (!datosEstadosGeo || !nombreEdo) return null;
    const norm = normalizarEstado(nombreEdo);
    const feature = datosEstadosGeo.features.find(f =>
        normalizarEstado(f.properties.NOMGEO) === norm
    );
    return feature ? feature.properties.fid : null;
}

function sincronizarResaltadosEstados(nombres) {
    selectedEstadoIds.forEach(id => {
        map.setFeatureState({ source: 'estados-src', id }, { select: false });
    });
    selectedEstadoIds = new Set();
    nombres.forEach(nombre => {
        const id = encontrarIdEstado(nombre);
        if (id !== null) {
            map.setFeatureState({ source: 'estados-src', id }, { select: true });
            selectedEstadoIds.add(id);
        }
    });
}

function fitBoundsEstados(nombres) {
    if (nombres.length === 0) return;
    if (nombres.length === 1) { fitBoundsEstado(nombres[0]); return; }
    if (!datosEstadosGeo) return;
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    nombres.forEach(nombre => {
        const norm = normalizarEstado(nombre);
        const feat = datosEstadosGeo.features.find(f => normalizarEstado(f.properties.NOMGEO) === norm);
        if (!feat) return;
        const procesarAnillo = ring => ring.forEach(([lng, lat]) => {
            if (lng < minLng) minLng = lng; if (lat < minLat) minLat = lat;
            if (lng > maxLng) maxLng = lng; if (lat > maxLat) maxLat = lat;
        });
        if (feat.geometry.type === 'MultiPolygon') feat.geometry.coordinates.forEach(p => p.forEach(procesarAnillo));
        else feat.geometry.coordinates.forEach(procesarAnillo);
    });
    if (minLng !== Infinity) map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 60, pitch: 50, duration: 1000 });
}

function actualizarUIEstados() {
    const contenedor = document.getElementById('etiquetas-estados-seleccionados');
    if (!contenedor) return;
    contenedor.innerHTML = '';
    estadosSeleccionados.forEach(nombre => {
        const tag = document.createElement('span');
        tag.className = 'etiqueta-estado';
        tag.innerHTML = `${nombre} <button class="etiqueta-cerrar" title="Quitar">&times;</button>`;
        tag.querySelector('.etiqueta-cerrar').addEventListener('click', () => {
            estadosSeleccionados = estadosSeleccionados.filter(e => e !== nombre);
            aplicarFiltros();
            actualizarUIEstados();
        });
        contenedor.appendChild(tag);
    });
}

function normalizarEstado(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

function fitBoundsEstado(nombreEstado) {
    if (!datosEstadosGeo) return;
    const norm = normalizarEstado(nombreEstado);
    const feature = datosEstadosGeo.features.find(f =>
        normalizarEstado(f.properties.NOMGEO) === norm
    );
    if (!feature) return;

    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    const procesarAnillo = (ring) => {
        ring.forEach(([lng, lat]) => {
            if (lng < minLng) minLng = lng;
            if (lat < minLat) minLat = lat;
            if (lng > maxLng) maxLng = lng;
            if (lat > maxLat) maxLat = lat;
        });
    };

    if (feature.geometry.type === 'MultiPolygon') {
        feature.geometry.coordinates.forEach(polygon => polygon.forEach(procesarAnillo));
    } else if (feature.geometry.type === 'Polygon') {
        feature.geometry.coordinates.forEach(procesarAnillo);
    }

    map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 60, pitch: 50, duration: 1000 });
}

// ─── ROUTING ──────────────────────────────────────────────────────────────────

function toggleModoRuta() {
    if (modoRuta) desactivarModoRuta();
    else activarModoRuta();
}

function activarModoRuta() {
    if (modoIsocronas)       desactivarModoIsocronas();
    if (modoUnidadesCercanas) desactivarModoCercanas();
    modoRuta = true;
    limpiarRuta(false);
    document.getElementById('panel-ruta').style.display = 'block';
    document.getElementById('btn-ruta').classList.add('activo');
    document.getElementById('panel-menu-derecho').classList.remove('visible');
    expandirResultados();
    actualizarPanelRuta();
}

function desactivarModoRuta() {
    modoRuta = false;
    limpiarRuta(false);
    document.getElementById('panel-ruta').style.display = 'none';
    document.getElementById('btn-ruta').classList.remove('activo');
    document.getElementById('ruta-estado').classList.remove('waiting-click');
}

function seleccionarHospitalRuta(hospital) {
    if (!origenRuta) {
        origenRuta = hospital;
        if (marcadorOrigen) marcadorOrigen.remove();
        marcadorOrigen = new mapboxgl.Marker({ color: '#48bb78' })
            .setLngLat(hospital.coords).addTo(map);
        marcadorOrigen.getElement().style.zIndex = '1';
    } else if (!destinoRuta) {
        // Validar que origen y destino sean distintos
        if (hospital.clues === origenRuta.clues) {
            const elErr = document.getElementById('ruta-estado');
            elErr.textContent = 'El origen y el destino no pueden ser el mismo hospital.';
            elErr.classList.remove('waiting-click');
            return;
        }
        destinoRuta = hospital;
        if (marcadorDestino) marcadorDestino.remove();
        marcadorDestino = new mapboxgl.Marker({ color: '#fc8181' })
            .setLngLat(hospital.coords).addTo(map);
        marcadorDestino.getElement().style.zIndex = '1';
        // Debounce: esperar 500ms antes de disparar la petición
        clearTimeout(rutaDebounceTimer);
        rutaDebounceTimer = setTimeout(calcularRuta, 500);
    } else {
        // Tercer clic: reinicia selección con nuevo origen
        limpiarRuta(false);
        origenRuta = hospital;
        marcadorOrigen = new mapboxgl.Marker({ color: '#48bb78' })
            .setLngLat(hospital.coords).addTo(map);
        marcadorOrigen.getElement().style.zIndex = '1';
    }
    actualizarPanelRuta();
}

async function calcularRuta() {
    if (!origenRuta || !destinoRuta) return;

    // Límite de peticiones por sesión
    if (contadorPeticionesRuta >= MAX_PETICIONES_RUTA) {
        const elLim = document.getElementById('ruta-estado');
        elLim.textContent = `Límite de ${MAX_PETICIONES_RUTA} cálculos por sesión alcanzado. Recarga la página para continuar.`;
        elLim.classList.remove('waiting-click');
        return;
    }
    contadorPeticionesRuta++;

    const [lon1, lat1] = origenRuta.coords;
    const [lon2, lat2] = destinoRuta.coords;
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${lon1},${lat1};${lon2},${lat2}?geometries=geojson&language=es&access_token=${mapboxgl.accessToken}`;

    const elRuta = document.getElementById('ruta-estado');
    elRuta.textContent = 'Calculando ruta...';
    elRuta.classList.remove('waiting-click');

    try {
        const res  = await fetch(url);
        const data = await res.json();

        if (!data.routes || !data.routes.length) {
            document.getElementById('ruta-estado').textContent = 'No se encontró ruta entre estos puntos.';
            document.getElementById('ruta-estado').classList.remove('waiting-click');
            return;
        }

        const ruta = data.routes[0];
        const distanciaKm = (ruta.distance / 1000).toFixed(1);
        const totalMin    = Math.round(ruta.duration / 60);
        const horas       = Math.floor(totalMin / 60);
        const minutos     = totalMin % 60;
        const tiempoTexto = horas > 0 ? `${horas}h ${minutos}min` : `${minutos} min`;

        map.getSource('ruta-src').setData({ type: 'Feature', geometry: ruta.geometry });

        document.getElementById('ruta-distancia').textContent = `${distanciaKm} km`;
        document.getElementById('ruta-tiempo').textContent    = tiempoTexto;
        document.getElementById('ruta-info').style.display    = 'block';
        actualizarPanelRuta();

        // Ajustar vista para mostrar toda la ruta
        const coords  = ruta.geometry.coordinates;
        const bounds  = coords.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(coords[0], coords[0]));
        map.fitBounds(bounds, { padding: 80, pitch: 30, duration: 1000 });

    } catch (err) {
        console.error('Error calculando ruta:', err);
        document.getElementById('ruta-estado').textContent = 'Error al calcular la ruta.';
        document.getElementById('ruta-estado').classList.remove('waiting-click');
    }
}

function limpiarRuta(ocultarPanel = false) {
    clearTimeout(rutaDebounceTimer);
    origenRuta  = null;
    destinoRuta = null;
    if (marcadorOrigen)  { marcadorOrigen.remove();  marcadorOrigen  = null; }
    if (marcadorDestino) { marcadorDestino.remove(); marcadorDestino = null; }
    const src = map.getSource('ruta-src');
    if (src) src.setData({ type: 'FeatureCollection', features: [] });
    document.getElementById('ruta-info').style.display = 'none';
    if (ocultarPanel) {
        modoRuta = false;
        document.getElementById('panel-ruta').style.display = 'none';
        document.getElementById('btn-ruta').classList.remove('activo');
    } else if (modoRuta) {
        actualizarPanelRuta();
    }
}

function actualizarPanelRuta() {
    const el = document.getElementById('ruta-estado');
    if (!el) return;
    if (!origenRuta) {
        el.textContent = 'Haz clic en un hospital de origen.';
        el.classList.add('waiting-click');
    } else if (!destinoRuta) {
        el.textContent = `Origen: ${origenRuta.nombre}. Ahora selecciona el destino.`;
        el.classList.add('waiting-click');
    } else {
        el.textContent = `${origenRuta.nombre} → ${destinoRuta.nombre}`;
        el.classList.remove('waiting-click');
    }
}

// ─── ISÓCRONAS ────────────────────────────────────────────────────────────────

function toggleModoIsocronas() {
    if (modoIsocronas) desactivarModoIsocronas();
    else activarModoIsocronas();
}

function activarModoIsocronas() {
    if (modoRuta)            desactivarModoRuta();
    if (modoUnidadesCercanas) desactivarModoCercanas();
    modoIsocronas = true;
    document.getElementById('panel-isocronas').style.display = 'block';
    document.getElementById('btn-isocronas').classList.add('activo');
    document.getElementById('panel-menu-derecho').classList.remove('visible');
    expandirResultados();
    const isoEl = document.getElementById('isocrona-estado');
    isoEl.textContent = 'Haz clic en una unidad médica.';
    isoEl.classList.add('waiting-click');
}

function expandirResultados() {
    const panel = document.getElementById('panel-resultados');
    if (panel.classList.contains('colapsado')) {
        panel.classList.remove('colapsado');
        document.getElementById('btn-toggle-resultados').textContent = '▲';
    }
}

function desactivarModoIsocronas() {
    modoIsocronas = false;
    limpiarIsocronas();
    document.getElementById('panel-isocronas').style.display = 'none';
    document.getElementById('btn-isocronas').classList.remove('activo');
    document.getElementById('isocrona-estado').classList.remove('waiting-click');
}

function setTipoIsocrona(esEstandar) {
    tipoIsocronaEstandar = esEstandar;
    document.getElementById('btn-tipo-estandar').classList.toggle('activo', esEstandar);
    document.getElementById('btn-tipo-manual').classList.toggle('activo', !esEstandar);
    document.getElementById('input-tiempo-manual').style.display = esEstandar ? 'none' : 'block';
    document.getElementById('isocrona-leyenda').style.display = esEstandar ? 'flex' : 'none';
    const isoTipoEl = document.getElementById('isocrona-estado');
    isoTipoEl.textContent = 'Haz clic en una unidad médica.';
    isoTipoEl.classList.add('waiting-click');
    limpiarIsocronas();
}

function manejarClickIsocronas(coords, nombreHospital) {
    if (!tipoIsocronaEstandar) {
        const tiempo = parseInt(document.getElementById('tiempo-manual').value);
        if (!tiempo || tiempo < 5) {
            const elV = document.getElementById('isocrona-estado');
            elV.textContent = 'Debe establecer el tiempo de traslado antes de seleccionar una unidad.';
            elV.classList.remove('waiting-click');
            return;
        }
        if (tiempo > 60) {
            const elV = document.getElementById('isocrona-estado');
            elV.textContent = 'Para traslados mayores a 60 min, use la herramienta de cálculo de ruta punto a punto.';
            elV.classList.remove('waiting-click');
            return;
        }
    }
    clearTimeout(isocrona_debounceTimer);
    isocrona_debounceTimer = setTimeout(() => calcularIsocronas(coords, nombreHospital), 500);
}

async function calcularIsocronas(coords, nombreHospital) {
    if (contadorPeticionesRuta >= MAX_PETICIONES_RUTA) {
        const elLimIso = document.getElementById('isocrona-estado');
        elLimIso.textContent = `Límite de ${MAX_PETICIONES_RUTA} peticiones por sesión alcanzado.`;
        elLimIso.classList.remove('waiting-click');
        return;
    }
    contadorPeticionesRuta++;

    const [lon, lat] = coords;
    const tiempos = tipoIsocronaEstandar
        ? '15,30,59'
        : document.getElementById('tiempo-manual').value;

    const isoCalcEl = document.getElementById('isocrona-estado');
    isoCalcEl.textContent = 'Generando isócronas...';
    isoCalcEl.classList.remove('waiting-click');

    const url = `https://api.mapbox.com/isochrone/v1/mapbox/driving/${lon},${lat}` +
                `?contours_minutes=${tiempos}&polygons=true&access_token=${mapboxgl.accessToken}`;
    try {
        const res  = await fetch(url);
        const data = await res.json();

        if (!data.features || !data.features.length) {
            document.getElementById('isocrona-estado').textContent = 'No se pudo generar la isócrona.';
            document.getElementById('isocrona-estado').classList.remove('waiting-click');
            return;
        }

        map.getSource('isocrona-src').setData(data);
        const isoResEl = document.getElementById('isocrona-estado');
        isoResEl.textContent = tipoIsocronaEstandar
            ? `Isócronas desde: ${nombreHospital}`
            : `${tiempos} min desde: ${nombreHospital}`;
        isoResEl.classList.remove('waiting-click');

        // Zoom al área cubierta por las isócronas
        const allCoords = data.features.flatMap(f => f.geometry.coordinates[0]);
        const isoBounds = allCoords.reduce(
            (b, c) => b.extend(c),
            new mapboxgl.LngLatBounds(allCoords[0], allCoords[0])
        );
        map.fitBounds(isoBounds, { padding: 60, pitch: 30, duration: 1000 });

    } catch (err) {
        console.error('Error generando isócronas:', err);
        document.getElementById('isocrona-estado').textContent = 'Error al generar la isócrona.';
        document.getElementById('isocrona-estado').classList.remove('waiting-click');
    }
}

function limpiarIsocronas() {
    clearTimeout(isocrona_debounceTimer);
    const src = map.getSource('isocrona-src');
    if (src) src.setData({ type: 'FeatureCollection', features: [] });
    if (modoIsocronas) {
        const isoLimpEl = document.getElementById('isocrona-estado');
        isoLimpEl.textContent = 'Haz clic en una unidad médica.';
        isoLimpEl.classList.add('waiting-click');
    }
}

// ─── HERRAMIENTA: UNIDADES CERCANAS (Matrix API) ──────────────────────────────

let modoUnidadesCercanas = false;

function toggleModoCercanas() {
    if (modoUnidadesCercanas) desactivarModoCercanas();
    else activarModoCercanas();
}

function activarModoCercanas() {
    if (modoRuta) desactivarModoRuta();
    if (modoIsocronas) desactivarModoIsocronas();
    modoUnidadesCercanas = true;
    // Limpiar resultados del ciclo anterior
    document.getElementById('cercanas-lista').innerHTML = '';
    document.getElementById('panel-cercanas').style.display = 'block';
    document.getElementById('btn-cercanas').classList.add('activo');
    document.getElementById('panel-menu-derecho').classList.remove('visible');
    expandirResultados();
    const el = document.getElementById('cercanas-estado');
    el.textContent = 'Haz clic en una unidad médica como origen.';
    el.classList.add('waiting-click');
}

function limpiarResaltadoOrigen() {
    if (pinOrigenCercanas) {
        pinOrigenCercanas.classList.remove('pin-origen-cercanas');
        pinOrigenCercanas = null;
    }
}

function limpiarLineasCercanas() {
    if (lineaPopup) { lineaPopup.remove(); lineaPopup = null; }
    if (lineaSeleccionadaId !== null) {
        if (map.getSource('lineas-cercanas-source')) {
            map.setFeatureState({ source: 'lineas-cercanas-source', id: lineaSeleccionadaId }, { seleccionada: false });
        }
        lineaSeleccionadaId = null;
    }
    if (map.getSource('lineas-cercanas-source')) {
        map.getSource('lineas-cercanas-source').setData({ type: 'FeatureCollection', features: [] });
    }
}

function desactivarModoCercanas() {
    modoUnidadesCercanas = false;
    limpiarLineasCercanas();
    limpiarResaltadoOrigen();
    document.getElementById('panel-cercanas').style.display = 'none';
    document.getElementById('btn-cercanas').classList.remove('activo');
    document.getElementById('cercanas-estado').classList.remove('waiting-click');
    document.getElementById('cercanas-lista').innerHTML = '';
    redCercanaActiva = false;
    datosPinesRed    = [];
    // Limpiar etiquetas de tiempo
    if (map.getSource('puntos-cercanos-source')) {
        map.getSource('puntos-cercanos-source').setData({ type: 'FeatureCollection', features: [] });
    }
    if (map.getLayer('tiempo-viaje-labels')) {
        map.setLayoutProperty('tiempo-viaje-labels', 'visibility', 'none');
    }
}
let contadorPeticionesMatrix = 0;
const MAX_PETICIONES_MATRIX = 30;
const MAX_DESTINOS_MATRIX   = 24;   // límite de la Matrix API (1 origen + 24 destinos = 25 coords)

function distanciaEuclidea([lon1, lat1], [lon2, lat2]) {
    const dx = lon1 - lon2;
    const dy = lat1 - lat2;
    return Math.sqrt(dx * dx + dy * dy);
}

async function calcularUnidadesCercanas(clickCoords, origenClues) {
    if (!unidadesVisibles.length) return;

    if (contadorPeticionesMatrix >= MAX_PETICIONES_MATRIX) {
        const el = document.getElementById('cercanas-estado');
        if (el) {
            el.textContent = `Límite de ${MAX_PETICIONES_MATRIX} consultas por sesión alcanzado. Recarga la página para continuar.`;
            el.classList.remove('waiting-click');
        }
        return;
    }

    // 1. Excluir origen, ordenar por distancia euclídea y tomar las más cercanas
    const candidatas = unidadesVisibles
        .filter(u => u.clues !== origenClues)
        .map(u => ({ ...u, distEuclid: distanciaEuclidea(clickCoords, u.coords) }))
        .sort((a, b) => a.distEuclid - b.distEuclid)
        .slice(0, MAX_DESTINOS_MATRIX);

    // 2. Construir string de coordenadas: punto de clic + candidatas
    const coordsStr = [clickCoords, ...candidatas.map(u => u.coords)]
        .map(([lon, lat]) => `${lon},${lat}`)
        .join(';');

    const elEstado = document.getElementById('cercanas-estado');
    if (elEstado) {
        elEstado.textContent = `Calculando rutas para ${candidatas.length} unidades...`;
        elEstado.classList.add('waiting-click');
    }

    contadorPeticionesMatrix++;

    // 3. Llamar a la Matrix API — sources=0 (el clic), destinations=resto
    const destinosIdx = candidatas.map((_, i) => i + 1).join(';');
    const url = `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coordsStr}` +
                `?sources=0&destinations=${destinosIdx}&annotations=duration&access_token=${mapboxgl.accessToken}`;

    try {
        const res  = await fetch(url);
        const data = await res.json();

        if (!data.durations || !data.durations[0]) {
            if (elEstado) {
                elEstado.textContent = 'No se pudo obtener los tiempos de conducción.';
                elEstado.classList.remove('waiting-click');
            }
            return;
        }

        // 4. Combinar resultados: agregar duración real a cada candidata, ordenar por tiempo
        const resultados = candidatas
            .map((u, i) => ({ ...u, duracionSeg: data.durations[0][i] }))
            .filter(u => u.duracionSeg !== null)
            .sort((a, b) => a.duracionSeg - b.duracionSeg);

        mostrarResultadosCercanas(resultados, clickCoords, origenClues);

    } catch (err) {
        console.error('Error en Matrix API:', err);
        if (elEstado) {
            elEstado.textContent = 'Error al consultar la Matrix API.';
            elEstado.classList.remove('waiting-click');
        }
    }
}

function formatearTiempo(seg) {
    const min = Math.round(seg / 60);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function mostrarResultadosCercanas(resultados, origenCoords, origenClues) {
    const elEstado = document.getElementById('cercanas-estado');
    const elLista  = document.getElementById('cercanas-lista');

    // 1. Desactivar modo de escucha — los clics en pines vuelven al popup normal
    modoUnidadesCercanas = false;
    document.getElementById('btn-cercanas').classList.remove('activo');

    // 2. Actualizar mensaje de estado
    elEstado.textContent = `${resultados.length} unidades encontradas. Presiona el botón para un nuevo cálculo.`;
    elEstado.classList.remove('waiting-click');

    // 2. Etiquetas de tiempo sobre los pines destino (capa dedicada)
    if (map.getSource('puntos-cercanos-source')) {
        const puntosConTiempo = resultados.map(u => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: u.coords },
            properties: { clues: u.clues, tiempoFormateado: formatearTiempo(u.duracionSeg) }
        }));
        map.getSource('puntos-cercanos-source').setData({ type: 'FeatureCollection', features: puntosConTiempo });
        if (map.getLayer('tiempo-viaje-labels')) {
            map.setLayoutProperty('tiempo-viaje-labels', 'visibility', 'visible');
        }
    }

    // 3. Persistir estado de la red para fusión con futuros filtros de estado
    redCercanaActiva = true;
    const origenInfo = unidadesVisibles.find(u => u.clues === origenClues) || { nombre: 'Origen', clues: origenClues, estado: '' };
    datosPinesRed = [
        { type: 'Feature', geometry: { type: 'Point', coordinates: origenCoords },
          properties: { clues: origenClues, nombre: origenInfo.nombre, estado: origenInfo.estado,
                        stockActual: origenInfo.stockActual, cobertura: origenInfo.cobertura, medNombre: origenInfo.medNombre } },
        ...resultados.map(u => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: u.coords },
            properties: { clues: u.clues, nombre: u.nombre, estado: u.estado,
                          stockActual: u.stockActual, cobertura: u.cobertura, medNombre: u.medNombre }
        }))
    ];

    // 4. Dibujar líneas de conexión origen → destinos
    if (map.getSource('lineas-cercanas-source') && origenCoords) {
        limpiarLineasCercanas();
        const lineas = resultados.map((u, i) => ({
            type: 'Feature',
            id: i,
            geometry: { type: 'LineString', coordinates: [origenCoords, u.coords] },
            properties: {
                origenNombre:  origenInfo.nombre,
                origenClues:   origenInfo.clues,
                destinoNombre: u.nombre,
                destinoClues:  u.clues,
                destinoEstado: u.estado,
                tiempo:        formatearTiempo(u.duracionSeg)
            }
        }));
        map.getSource('lineas-cercanas-source').setData({ type: 'FeatureCollection', features: lineas });
    }

    // 4. Renderizar lista ordenada en el panel
    elLista.innerHTML = '';
    resultados.forEach(u => {
        const item = document.createElement('div');
        item.className = 'cercanas-item';
        item.innerHTML = `<span class="cercanas-item-nombre" title="${u.nombre}">${u.nombre}</span>
                          <span class="cercanas-item-tiempo">${formatearTiempo(u.duracionSeg)}</span>`;
        elLista.appendChild(item);
    });
}

// ─── TOUR DE BIENVENIDA (implementación propia, sin librerías) ─────────────────

function iniciarTour() {
    const STEPS = [
        {
            icon: '🗺️',
            title: 'Sistema de Abasto',
            body: '(LOS DATOS CONTENIDOS EN ESTE MAPA SON MERAMENTE DE EJEMPLO NO REPRESENTAN LA REALIDAD DE LA UNIDADES MÉDICAS)Este mapa te permite consultar las existencias de medicamentos en las unidades médicas. Te mostramos cómo usarlo en 4 pasos.',
            selector: null
        },
        {
            icon: '💊',
            title: '1. Buscar Medicamento',
            body: 'Escribe la <strong>clave CNIS</strong> o parte del nombre. Al seleccionarlo, el mapa colorea cada unidad según su cobertura de abasto.',
            selector: '.autocomplete-wrapper',
            images: ['docs/images/medicamento.png']
        },
        {
            icon: '📍',
            title: '2. Filtrar por Estado',
            body: 'Acota los resultados a una <strong>entidad federativa</strong>. El mapa hará zoom automático a la región seleccionada.',
            selector: '#selector-estado',
            images: ['docs/images/selector entidad.png']
        },
        {
            icon: '🔧',
            title: '3. Panel de Herramientas',
            body: 'Al presionar este botón se despliega el menú de herramientas: cambia el tema del mapa, calcula <strong>rutas</strong> entre unidades o genera <strong>isócronas</strong> para logística de traslados.',
            selector: '#btn-menu-derecho',
            images: ['docs/images/rutas.png', 'docs/images/isocrona.png']
        },
        {
            icon: '📊',
            title: '4. Panel de Resultados',
            body: 'Aquí verás el número de unidades encontradas, la leyenda de cobertura semafórica y los detalles de rutas o isócronas activas.',
            selector: '#panel-resultados'
        }
    ];

    const overlay    = document.getElementById('ob-overlay');
    const highlight  = document.getElementById('ob-highlight');
    const card       = document.getElementById('ob-card');
    const iconEl     = document.getElementById('ob-icon');
    const titleEl    = document.getElementById('ob-title');
    const bodyEl     = document.getElementById('ob-body');
    const imagesEl   = document.getElementById('ob-images');
    const progressEl = document.getElementById('ob-progress');
    const btnSkip    = document.getElementById('ob-skip');
    const btnNext    = document.getElementById('ob-next');

    let step = 0;

    let pasoAnterior = -1;

    function mostrarPaso(i) {
        // Ejecutar onHide del paso anterior
        if (pasoAnterior >= 0 && STEPS[pasoAnterior].onHide) {
            STEPS[pasoAnterior].onHide();
        }
        pasoAnterior = i;

        const s = STEPS[i];

        // Ejecutar onShow del paso actual antes de calcular el bounding rect
        if (s.onShow) s.onShow();

        iconEl.textContent     = s.icon;
        titleEl.textContent    = s.title;
        bodyEl.innerHTML       = s.body;
        progressEl.textContent = `${i + 1} / ${STEPS.length}`;
        btnNext.textContent    = (i === STEPS.length - 1) ? 'Entendido ✓' : 'Siguiente →';

        // Renderizar imágenes y ajustar ancho de tarjeta
        if (s.images && s.images.length) {
            imagesEl.innerHTML = s.images.map(src =>
                `<img src="${src}" alt="" class="ob-img">`
            ).join('');
            imagesEl.style.display = 'flex';
            card.style.width = s.images.length >= 2 ? '480px' : '360px';
        } else {
            imagesEl.innerHTML = '';
            imagesEl.style.display = 'none';
            card.style.width = '360px';
        }

        // Con imágenes: centrar la tarjeta y resaltar el elemento sin mover la card
        const tieneImagenes = s.images && s.images.length > 0;

        if (s.selector) {
            const el = document.querySelector(s.selector);
            if (el) {
                const r   = el.getBoundingClientRect();
                const pad = 10;
                overlay.style.background = 'transparent';
                highlight.style.display  = 'block';
                highlight.style.top      = (r.top    - pad) + 'px';
                highlight.style.left     = (r.left   - pad) + 'px';
                highlight.style.width    = (r.width  + pad * 2) + 'px';
                highlight.style.height   = (r.height + pad * 2) + 'px';
                if (tieneImagenes) {
                    card.style.top       = '50%';
                    card.style.left      = '50%';
                    card.style.transform = 'translate(-50%, -50%)';
                } else {
                    posicionarCard(r, pad);
                }
            }
        } else {
            overlay.style.background = 'rgba(0, 0, 0, 0.55)';
            highlight.style.display  = 'none';
            card.style.top       = '50%';
            card.style.left      = '50%';
            card.style.transform = 'translate(-50%, -50%)';
        }
    }

    function posicionarCard(r, pad) {
        const imgCount = s.images ? s.images.length : 0;
        const cardW  = imgCount >= 2 ? 480 : 360;
        const cardH  = imgCount > 0  ? 340 : 240;
        const margin = 16;
        const vw     = window.innerWidth;
        const vh     = window.innerHeight;
        card.style.transform = '';

        const clampTop  = (t) => Math.max(margin, Math.min(t, vh - cardH - margin));
        const clampLeft = (l) => Math.max(margin, Math.min(l, vw - cardW - margin));

        if (r.right + pad + margin + cardW <= vw) {
            // Derecha
            card.style.left = (r.right + pad + margin) + 'px';
            card.style.top  = clampTop(r.top - pad) + 'px';
        } else if (r.left - pad - margin - cardW >= 0) {
            // Izquierda
            card.style.left = (r.left - pad - margin - cardW) + 'px';
            card.style.top  = clampTop(r.top - pad) + 'px';
        } else if (r.top - pad - margin - cardH >= 0) {
            // Arriba
            card.style.top  = (r.top - pad - margin - cardH) + 'px';
            card.style.left = clampLeft(r.left - pad) + 'px';
        } else {
            // Abajo
            card.style.top  = (r.bottom + pad + margin) + 'px';
            card.style.left = clampLeft(r.left - pad) + 'px';
        }
    }

    function cerrar() {
        if (pasoAnterior >= 0 && STEPS[pasoAnterior].onHide) {
            STEPS[pasoAnterior].onHide();
        }
        overlay.style.opacity   = '0';
        highlight.style.opacity = '0';
        card.style.opacity      = '0';
        setTimeout(() => {
            overlay.style.display   = 'none';
            highlight.style.display = 'none';
            card.style.display      = 'none';
            overlay.style.opacity   = '1';
            highlight.style.opacity = '1';
            card.style.opacity      = '1';
        }, 300);
    }

    btnNext.addEventListener('click', () => {
        if (step < STEPS.length - 1) {
            step++;
            mostrarPaso(step);
        } else {
            cerrar();
        }
    });

    btnSkip.addEventListener('click', cerrar);

    // Mostrar tour
    overlay.style.display  = 'block';
    card.style.display     = 'block';
    mostrarPaso(0);
}
