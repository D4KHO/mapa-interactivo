// script-mapa.js
// Todos los scripts extraídos desde index.html para mantener el HTML limpio.

// Precarga de imágenes para evitar demoras en el renderizado
const imageCache = {};
const preloadImages = ['ETAPA GENERAL.webp', 'ETAPA 1 img.webp', 'ETAPA 2 img.webp'];
function preloadImage(src) {
  if (!imageCache[src]) {
    const img = new Image();
    img.onload = () => { imageCache[src] = true; };
    img.src = src;
  }
}
preloadImages.forEach(preloadImage);

const sectorSizes = {
  'etapa-1': { width: 2300, height: 3898 },
  'etapa-2': { width: 2000, height: 5457 },
  'completo': { width: 3500, height: 3848 }
};

function makeBounds(width, height) {
  return [[0, 0], [height, width]];
}

let currentSector = 'completo';
let bounds = makeBounds(sectorSizes[currentSector].width, sectorSizes[currentSector].height);

const map = L.map('map', {
  crs: L.CRS.Simple,
  minZoom: -3,
  maxZoom: 0.7,
  zoomControl: false,
  attributionControl: false,
  maxBounds: bounds,
  maxBoundsViscosity: 1.0,
  keyboard: false,
  preferCanvas: true,
  zoomAnimation: false,
  fadeAnimation: false,
  markerZoomAnimation: false
});

map.fitBounds(bounds);
map.scrollWheelZoom.enable();

const overlayCache = {};
let currentOverlay = null;
function setOverlay(imageSrc, dims) {
  if (currentOverlay) {
    try { map.removeLayer(currentOverlay); } catch (e) { console.warn('No se pudo eliminar overlay previo', e); }
    currentOverlay = null;
  }
  if (imageSrc) {
    if (dims && dims.width && dims.height) {
      bounds = makeBounds(dims.width, dims.height);
      try { map.setMaxBounds(bounds); } catch (e) { }
      try { map.fitBounds(bounds); } catch (e) { }
    }
    if (overlayCache[imageSrc]) {
      currentOverlay = overlayCache[imageSrc];
    } else {
      currentOverlay = L.imageOverlay(imageSrc, bounds);
      overlayCache[imageSrc] = currentOverlay;
    }
    currentOverlay.addTo(map);
  }
}

if (imageCache['ETAPA GENERAL.webp']) {
  // Solo aplicar el overlay si el sector actual es 'completo'
  if (currentSector === 'completo') {
    setOverlay('ETAPA GENERAL.webp', sectorSizes['completo']);
  }
} else {
  const img = new Image();
  img.onload = () => {
    // Solo aplicar el overlay si el sector actual sigue siendo 'completo'
    if (currentSector === 'completo') {
      setOverlay('ETAPA GENERAL.webp', sectorSizes['completo']);
    }
  };
  img.src = 'ETAPA GENERAL.webp';
}

const polygons = [];
let activo = 0;
const canvasRenderer = L.canvas({ padding: 0.5 });

function getSqDist(p1, p2) {
  const dx = p1[0] - p2[0];
  const dy = p1[1] - p2[1];
  return dx * dx + dy * dy;
}

function getSqSegDist(p, p1, p2) {
  let x = p1[0], y = p1[1], dx = p2[0] - x, dy = p2[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = p2[0]; y = p2[1]; }
    else if (t > 0) { x += dx * t; y += dy * t; }
  }
  return getSqDist(p, [x, y]);
}

function simplifyDP(points, first, last, sqTolerance, simplified) {
  let maxSqDist = sqTolerance, index;
  for (let i = first + 1; i < last; i++) {
    const sqDist = getSqSegDist(points[i], points[first], points[last]);
    if (sqDist > maxSqDist) {
      index = i; maxSqDist = sqDist;
    }
  }
  if (maxSqDist > sqTolerance) {
    if (index - first > 1) simplifyDP(points, first, index, sqTolerance, simplified);
    simplified.push(points[index]);
    if (last - index > 1) simplifyDP(points, index, last, sqTolerance, simplified);
  }
}

function simplify(points, tolerance) {
  if (!points || points.length <= 4) return points.slice();
  const sqTolerance = (tolerance || 1) * (tolerance || 1);
  const last = points.length - 1;
  const simplified = [points[0]];
  simplifyDP(points, 0, last, sqTolerance, simplified);
  simplified.push(points[last]);
  return simplified;
}

function cargarLotes(archivo) {
  fetch(archivo)
    .then(res => res.json())
    .then(lotes => 
    {

      const batchSize = 50;
      let currentBatch = 0;
      
      // Verificar si estamos cargando amenidades (images.json)
      const isAmenidades = archivo.includes('images.json');
      
      function processBatch() {
        const start = currentBatch * batchSize;
        const end = Math.min(start + batchSize, lotes.length);
        for (let i = start; i < end; i++) {
          const lote = lotes[i];
          
          let colors, popupContent, clickHandler;
          
          if (isAmenidades) {
            // Configuración para amenidades
            colors = {
              fill: "#f3eac6d2", // Verde claro para amenidades
              stroke: "#d7d7d775"
            };
            popupContent = `<b>${lote.nombre}</b><br>Tipo: ${lote.tipo}<br>Click para ver imagen`;
            
            // Función para abrir modal al hacer click
            clickHandler = function(e) {
              if (polygonsInteractiveDisabled) return;
              openImageModal(lote.id, lote.nombre);
            };
          } else {
            // Configuración para lotes normales
            const colorMap = {
              "Disponible": { fill: "#ffffff", stroke: "#111827" },
              "Reservado": { fill: "#f97316", stroke: "#ea580c" },
              "Vendido": { fill: "#16a34a", stroke: "#15803d" },
              "Bloqueado": { fill: "#dc2626", stroke: "#b91c1c" }
            };
            colors = colorMap[lote.estado] || colorMap["Bloqueado"];
            popupContent = `<b>${lote.id}</b><br>Área: ${lote.area}<br><br>Estado: ${lote.estado}`;
            
            // Función de click para lotes normales (destacar y mostrar info)
            let touchHighlighted = false;
            clickHandler = function(e) {
              if (polygonsInteractiveDisabled) return;
              try {
                // Usar la información del lote directamente desde el polígono
                // para evitar conflictos con lotes del mismo número en diferentes etapas
                const infoLote = parsearLoteId(lote.id, archivo);
                const loteCompleto = {
                  ...lote,
                  manzana: infoLote.manzana,
                  loteNumero: infoLote.lote,
                  tipo: 'Residencial',
                  dimensiones: {
                    izquierda: '8.00 ML',
                    derecha: '8.00 ML', 
                    frente: '15.00 ML',
                    fondo: '15.00 ML'
                  },
                  whatsappLink: `https://wa.me/51946552086?text=Hola,%20estoy%20interesado%20en%20el%20lote%20${lote.id.replace('Lote ', '')}`
                };
                
                // Guardar qué panel estaba activo antes de abrir el panel de información
                if (searchPanel.classList.contains('visible')) {
                  previousPanel = 'search';
                } else if (areasPanel.classList.contains('visible')) {
                  previousPanel = 'areas';
                } else {
                  previousPanel = null;
                }
                
                hideAllPanels();
                updatePanelInfo(loteCompleto);
                sidePanel.classList.add('visible');
                
                if (!touchHighlighted) {
                  this.setStyle({ fillOpacity: Math.max(0.55, originalStyle.fillOpacity), weight: 2 });
                } else {
                  this.setStyle({ fillOpacity: originalStyle.fillOpacity, weight: originalStyle.weight });
                }
                touchHighlighted = !touchHighlighted;
              } catch (err) {
                console.warn('Error al procesar click en lote:', err);
              }
            };
          }
          
          const simplifiedCoords = simplify(lote.coords, 2.0); // Menos detalle = más rápido
          const poly = L.polygon(simplifiedCoords, {
            renderer: canvasRenderer,
            className: isAmenidades ? 'hover-amenidad' : 'hover-lote',
            fillColor: colors.fill,
            color: colors.stroke,
            weight: isAmenidades ? 2 : 1,
            opacity: 0.8,
            fillOpacity: isAmenidades ? 0.6 : 0.4,
            interactive: true,
            bubblingMouseEvents: false
          }).addTo(map);
          
          const originalStyle = {
            fillOpacity: poly.options.fillOpacity,
            weight: poly.options.weight,
            fillColor: poly.options.fillColor,
            color: poly.options.color
          };
          
          // Eventos hover para todos los polígonos
          poly.on('mouseover', function(e) {
            if (polygonsInteractiveDisabled) return;
            try { 
              this.setStyle({ 
                fillOpacity: Math.max(0.7, originalStyle.fillOpacity), 
                weight: originalStyle.weight + 1 
              }); 
            } catch (err) {}
          });
          
          poly.on('mouseout', function(e) {
            try { 
              this.setStyle({ 
                fillOpacity: originalStyle.fillOpacity, 
                weight: originalStyle.weight 
              }); 
            } catch (err) {}
          });
          
          // Asignar el evento click correspondiente
          poly.on('click', clickHandler);
          
          polygons.push({ 
            poly, 
            coords: lote.coords, 
            loteData: lote, 
            popupContent, 
            popupBound: false, 
            originalStyle,
            isAmenidad: isAmenidades,  // Marcar si es amenidad para evitar popups
            archivo: archivo  // Añadir información del archivo para distinguir etapas
          });
        }
        currentBatch++;
        if (currentBatch * batchSize < lotes.length) requestAnimationFrame(processBatch);
      }
      processBatch();
    });
}

function getActivo() { return polygons[activo]; }

// Variable global para almacenar todos los lotes cargados
let todosLosLotes = [];

// Función para extraer información de la manzana y lote del ID
function parsearLoteId(id, archivo = '') {
  // Formato esperado: "Lote A1", "Lote B2", etc.
  const match = id.match(/Lote ([A-Z]+)(\d+)/);
  if (match) {
    let manzana = match[1];
    
    // Si es manzana D y viene del archivo de etapa 2, agregar "2"
    if (manzana === 'D' && archivo.includes('D2.json')) {
      manzana = 'D2';
    }
    // Similar para otras manzanas de etapa 2
    else if (manzana === 'E' && archivo.includes('E2.json')) {
      manzana = 'E2';
    }
    else if (manzana === 'F' && archivo.includes('F2.json')) {
      manzana = 'F2';
    }
    else if (manzana === 'G' && archivo.includes('G2.json')) {
      manzana = 'G2';
    }
    
    return {
      manzana: manzana,
      lote: match[2],
      id: id
    };
  }
  return {
    manzana: '',
    lote: '',
    id: id
  };
}

// Función para cargar todos los lotes desde los archivos JSON
function cargarTodosLosLotes() {
  const archivosLotes = [
    'Coord/lotes_A.json',
    'Coord/lotes_B.json', 
    'Coord/lotes_C.json',
    'Coord/lotes_D.json',
    'Coord/lotes_D2.json',
    'Coord/lotes_E.json',
    'Coord/lotes_E2.json',
    'Coord/lotes_F.json',
    'Coord/lotes_F2.json',
    'Coord/lotes_G.json',
    'Coord/lotes_G2.json',
    'Coord/lotes_H.json',
    'Coord/lotes_I.json',
    'Coord/lotes_J.json'
  ];

  Promise.all(archivosLotes.map(archivo => 
    fetch(archivo)
      .then(res => res.json())
      .then(lotes => ({ archivo, lotes })) // Incluir el nombre del archivo
      .catch(err => {
        console.warn(`No se pudo cargar ${archivo}:`, err);
        return { archivo, lotes: [] };
      })
  ))
  .then(resultados => {
    // Combinar todos los lotes en una sola lista
    todosLosLotes = [];
    resultados.forEach(({ archivo, lotes }) => {
      lotes.forEach(lote => {
        const infoLote = parsearLoteId(lote.id, archivo); // Pasar el archivo
        const loteCompleto = {
          ...lote,
          manzana: infoLote.manzana,
          loteNumero: infoLote.lote,
          tipo: 'Residencial',
          dimensiones: {
            izquierda: '8.00 ML',
            derecha: '8.00 ML', 
            frente: '15.00 ML',
            fondo: '15.00 ML'
          },
          whatsappLink: `https://wa.me/51946552086?text=Hola,%20estoy%20interesado%20en%20el%20lote%20${lote.id.replace('Lote ', '')}`
        };
        todosLosLotes.push(loteCompleto);
      });
    });
    
    console.log(`Cargados ${todosLosLotes.length} lotes en total`);
    
    // Actualizar los filtros con los nuevos rangos
    actualizarRangosFiltros();
    
    // Renderizar los lotes inicialmente
    filterAndRenderLotes();
  })
  .catch(err => {
    console.error('Error cargando lotes:', err);
  });
}

// Función para actualizar los rangos de los filtros basado en los datos cargados
function actualizarRangosFiltros() {
  if (todosLosLotes.length === 0) return;
  
  // Calcular rangos de área
  const areas = todosLosLotes.map(lote => parseFloat(lote.area.replace(/[^0-9.]/g, ''))).filter(area => !isNaN(area));
  const areaMin = Math.floor(Math.min(...areas));
  const areaMax = Math.ceil(Math.max(...areas));
  
  // Actualizar sliders de área
  const areaMinSlider = document.getElementById('area-min');
  const areaMaxSlider = document.getElementById('area-max');
  if (areaMinSlider && areaMaxSlider) {
    areaMinSlider.min = areaMin;
    areaMinSlider.max = areaMax;
    areaMinSlider.value = areaMin;
    areaMaxSlider.min = areaMin;
    areaMaxSlider.max = areaMax;
    areaMaxSlider.value = areaMax;
  }
  
}

const areasComunes = [
  { id: 'club-house', nombre: 'Club House', tipo: 'Recreación' },
  { id: 'clinica-casa-bonita', nombre: 'Clínica Casa Bonita', tipo: 'Salud' },
  { id: 'iglesia', nombre: 'Iglesia', tipo: 'Religión' },
  { id: 'instituto', nombre: 'Instituto', tipo: 'Educación' },
  { id: 'ciclovia-abajo-derecha', nombre: 'Ciclovía', tipo: 'Recreación' },
  { id: 'gimnasio-etapa2', nombre: 'Gimnasio Etapa 2', tipo: 'Deportes' },
  { id: 'parque-sostenible-etapa2', nombre: 'Parque Sostenible', tipo: 'Ecología' },
  { id: 'parque-amarillo-meditacion', nombre: 'Parque de Meditación', tipo: 'Bienestar' },
  { id: 'parque-animales', nombre: 'Parque de Animales', tipo: 'Entretenimiento' },
  { id: 'parque-cultural', nombre: 'Parque Cultural', tipo: 'Cultura' },
  { id: 'parque-running', nombre: 'Parque Running', tipo: 'Deportes' },
  { id: 'parque-general', nombre: 'Parque General', tipo: 'Recreación' },
  { id: 'parque-infantil', nombre: 'Parque Infantil', tipo: 'Niños' }
];

const sidePanel = document.getElementById('side-panel');
const searchPanel = document.getElementById('search-panel');
const areasPanel = document.getElementById('areas-panel');
const closePanelButton = document.getElementById('close-panel');
const closeSearchPanelButton = document.getElementById('close-search-panel');
const closeAreasPanelButton = document.getElementById('close-areas-panel');
const btnAreas = document.getElementById('btn-areas');
const btnLotes = document.getElementById('btn-lotes');
const areasList = document.getElementById('areas-list');
let selectedLote = null;

// Variable para rastrear desde qué panel se abrió el panel de información
let previousPanel = null;

// Función para manejar el botón "Volver"
function volverAlPanelAnterior() {
  if (previousPanel === 'search') {
    hideAllPanels();
    searchPanel.classList.add('visible');
    btnLotes.classList.add('active');
  } else if (previousPanel === 'areas') {
    hideAllPanels();
    areasPanel.classList.add('visible');
    btnAreas.classList.add('active');
  } else {
    // Si no hay panel anterior, simplemente cerrar
    hideAllPanels();
  }
  previousPanel = null;
}

function setupDualRangeSliders() {
  const sliders = document.querySelectorAll('.dual-range-slider');
  sliders.forEach(slider => {
    const minInput = slider.querySelector('input[type=range]:first-of-type');
    const maxInput = slider.querySelector('input[type=range]:last-of-type');
    const label = document.getElementById(`${minInput.id.split('-')[0]}-range-label`);
    const updateLabel = () => {
      const minVal = parseInt(minInput.value);
      const maxVal = parseInt(maxInput.value);
      if (label.id.includes('area')) {
        label.textContent = `${minVal} m² - ${maxVal} m²`;
      } else {
        label.textContent = `$${minVal.toLocaleString()} - $${maxVal.toLocaleString()}`;
      }
    };
    const filterOnChange = () => { filterAndRenderLotes(); };
    minInput.addEventListener('input', () => {
      if (parseInt(minInput.value) > parseInt(maxInput.value)) minInput.value = maxInput.value;
      updateLabel(); filterOnChange();
    });
    maxInput.addEventListener('input', () => {
      if (parseInt(maxInput.value) < parseInt(minInput.value)) maxInput.value = minInput.value;
      updateLabel(); filterOnChange();
    });
    updateLabel();
  });
}

function resetFilters() {
  const areaMin = document.getElementById('area-min');
  const areaMax = document.getElementById('area-max');
  const searchText = document.getElementById('search-text');
  
  areaMin.value = areaMin.min; 
  areaMax.value = areaMax.max; 
  searchText.value = '';
  
  document.getElementById('sort-by-select').selectedIndex = 0;
  document.getElementById('status-filter-select').selectedIndex = 0;
  setupDualRangeSliders(); 
  filterAndRenderLotes();
}

function filterAndRenderLotes() {
  const areaMin = parseInt(document.getElementById('area-min').value);
  const areaMax = parseInt(document.getElementById('area-max').value);
  const sortBy = document.getElementById('sort-by-select').value;
  const statusFilter = document.getElementById('status-filter-select').value;
  const searchText = document.getElementById('search-text').value;
  
  const resultsContainer = document.querySelector('#search-panel .panel-content');
  resultsContainer.querySelectorAll('.lote-result-card').forEach(card => card.remove());
  
  // Filtrar por texto de búsqueda (ya incluye filtro por etapa)
  let filteredLotes = buscarLotesPorTexto(searchText);
  
  // Aplicar filtros de área y estado
  filteredLotes = filteredLotes.filter(lote => {
    const area = parseFloat(lote.area.replace(/[^0-9.]/g, ''));
    const estadoMatch = !statusFilter || lote.estado.toLowerCase() === statusFilter.toLowerCase();
    return area >= areaMin && area <= areaMax && estadoMatch;
  });
  
  // Ordenar los lotes
  filteredLotes.sort((a, b) => {
    const areaA = parseFloat(a.area.replace(/[^0-9.]/g, ''));
    const areaB = parseFloat(b.area.replace(/[^0-9.]/g, ''));
    
    switch (sortBy) {
      case 'area-asc': return areaA - areaB;
      case 'area-desc': return areaB - areaA;
      default: return 0;
    }
  });
  
  const countDisplay = document.getElementById('results-count-display');
  countDisplay.textContent = `Mostrando ${filteredLotes.length} lote(s)`;
  
  // Renderizar cada lote
  filteredLotes.forEach(lote => {
    const card = document.createElement('div');
    card.className = 'lote-result-card';
    
    // Obtener clase de color basada en estado
    const estadoClass = lote.estado.toLowerCase().replace(/[^a-z]/g, '');
    
    card.innerHTML = `
      <h4>Mz. ${lote.manzana} - Lote ${lote.loteNumero}</h4>
      <div class="card-info-grid">
        <div><span class="label">Estado</span><span class="value status-${estadoClass}">${lote.estado}</span></div>
        <div><span class="label">Área</span><span class="value">${lote.area}</span></div>
      </div>
      <button class="ver-mas-btn" onclick="verDetalleLote('${lote.id}')">Ver más</button>
    `;
    
    resultsContainer.appendChild(card);
  });
}

function hideAllPanels() {
  sidePanel.classList.remove('visible');
  searchPanel.classList.remove('visible');
  areasPanel.classList.remove('visible');
  btnLotes.classList.remove('active');
  btnAreas.classList.remove('active');
}

function renderAreasComunes() {
  areasList.innerHTML = '';
  for (const area of areasComunes) {
    const item = document.createElement('div');
    item.className = 'area-item';
    item.innerHTML = `
      <div class="area-info">
        <h4 class="area-name">${area.nombre}</h4>
        <span class="area-type">${area.tipo}</span>
      </div>
      <button class="area-view-btn">Ver imagen</button>
    `;
    
    // Al hacer click en el item o botón, abrir modal con imagen
    const viewButton = item.querySelector('.area-view-btn');
    viewButton.onclick = (e) => {
      e.stopPropagation();
      openImageModal(area.id, area.nombre);
    };
    
    item.onclick = () => {
      openImageModal(area.id, area.nombre);
    };
    
    areasList.appendChild(item);
  }
}

// Global functions to be accessible from HTML onclick attributes
window.verDetalleLote = verDetalleLote;

// Función para buscar lotes por texto (ID, manzana, etc.)
function buscarLotesPorTexto(texto) {
  if (!texto || texto.trim() === '') {
    // Si no hay texto, devolver todos los lotes filtrados por etapa actual
    return todosLosLotes.filter(lote => {
      if (currentSector === 'etapa-1') {
        return !lote.manzana.includes('2');
      } else if (currentSector === 'etapa-2') {
        return lote.manzana.includes('2');
      }
      return true; // Para 'completo' mostrar todos
    });
  }

  const q = String(texto).toLowerCase().replace(/\blote\b/g, '').replace(/[^a-z0-9\s]/g, ' ').trim();
  const parts = q.split(/\s+/).filter(Boolean);
  const num = parts.find(p => /^\d+$/.test(p));
  
  // Mejorar la detección de manzana para incluir números (D2, E2, etc.)
  const manPart = parts.find(p => /[a-z]/.test(p)) || '';
  
  return todosLosLotes.filter(l => {
    if (!l) return false;
    
    // Filtrar por etapa actual primero
    if (currentSector === 'etapa-1' && l.manzana.includes('2')) return false;
    if (currentSector === 'etapa-2' && !l.manzana.includes('2')) return false;
    
    const id = (l.id||'').toString().toLowerCase();
    const m = (l.manzana||'').toString().toLowerCase();
    const n = (l.loteNumero||'').toString().toLowerCase();

    // Búsqueda exacta por manzana y número
    if (manPart && num) {
      return m === manPart && n === num;
    }
    
    // Búsqueda solo por número
    if (num && parts.length === 1) return n.includes(num);
    
    // Búsqueda general
    const qfull = q;
    return id.includes(qfull) || m.includes(qfull) || n.includes(qfull) || (m+n).includes(qfull);
  });
}

// Función para mostrar detalles de un lote específico
function verDetalleLote(loteId) {
  // Buscar el lote respetando la etapa actual
  let lote;
  
  if (currentSector === 'etapa-1') {
    // En etapa 1, buscar solo lotes que NO tengan manzanas con '2'
    lote = todosLosLotes.find(l => l.id === loteId && !l.manzana.includes('2'));
  } else if (currentSector === 'etapa-2') {
    // En etapa 2, buscar solo lotes que SÍ tengan manzanas con '2'
    lote = todosLosLotes.find(l => l.id === loteId && l.manzana.includes('2'));
  } else {
    // En vista completa, dar prioridad a etapa 2 si hay duplicados
    lote = todosLosLotes.find(l => l.id === loteId && (l.manzana.includes('2')));
    if (!lote) {
      lote = todosLosLotes.find(l => l.id === loteId);
    }
  }
  
  if (lote) {
    // Guardar qué panel estaba activo antes de abrir el panel de información
    if (searchPanel.classList.contains('visible')) {
      previousPanel = 'search';
    } else if (areasPanel.classList.contains('visible')) {
      previousPanel = 'areas';
    } else {
      previousPanel = null;
    }
    
    // Cerrar todos los paneles y abrir el panel de información
    hideAllPanels();
    updatePanelInfo(lote);
    sidePanel.classList.add('visible');
    
    // Buscar y resaltar el polígono correspondiente en el mapa
    // Buscar polígono respetando la etapa actual
    let poligonoObj;
    
    if (currentSector === 'etapa-1') {
      // En etapa 1, buscar solo polígonos que NO sean de archivos con '2.json'
      poligonoObj = polygons.find(p => p.loteData && p.loteData.id === loteId && !p.archivo.includes('2.json'));
    } else if (currentSector === 'etapa-2') {
      // En etapa 2, buscar solo polígonos de archivos con '2.json'
      poligonoObj = polygons.find(p => p.loteData && p.loteData.id === loteId && p.archivo.includes('2.json'));
    } else {
      // En vista completa, priorizar etapa 2 si hay duplicados
      if (lote.manzana && lote.manzana.includes('2')) {
        poligonoObj = polygons.find(p => p.loteData && p.loteData.id === loteId && p.archivo.includes('2.json'));
      }
      if (!poligonoObj) {
        poligonoObj = polygons.find(p => p.loteData && p.loteData.id === loteId);
      }
    }
    if (poligonoObj && poligonoObj.poly) {
      try {
        // Centrar el mapa en el lote
        const bounds = L.latLngBounds(lote.coords);
        map.fitBounds(bounds, { padding: [50, 50] });
        
        // Resaltar temporalmente el polígono
        const originalStyle = poligonoObj.originalStyle;
        poligonoObj.poly.setStyle({ 
          fillOpacity: 0.8, 
          weight: 3,
          color: '#2563eb' // Color azul para resaltar
        });
        
        // Restaurar estilo después de 3 segundos
        setTimeout(() => {
          if (poligonoObj.poly) {
            poligonoObj.poly.setStyle(originalStyle);
          }
        }, 3000);
        
      } catch (e) {
        console.warn('No se pudo centrar o resaltar el lote en el mapa:', e);
      }
    }
  }
}

function updatePanelInfo(lote) {
  if (!lote) return;
  
  // Actualizar información básica
  document.getElementById('lote-id').textContent = `Mz. ${lote.manzana} - Lote ${lote.loteNumero}`;
  document.getElementById('lote-estado').textContent = lote.estado || '-';
  document.getElementById('lote-estado').className = `status-tag status-${lote.estado.toLowerCase().replace(/[^a-z]/g, '')}`;
  
  // Información adicional
  document.getElementById('lote-tipo').textContent = lote.tipo || 'Residencial';
  document.getElementById('lote-area').textContent = lote.area || '-';
  
  // Dimensiones (usar valores por defecto si no están disponibles)
  const dimensiones = lote.dimensiones || {
    izquierda: '8.00 ML',
    derecha: '8.00 ML', 
    frente: '15.00 ML',
    fondo: '15.00 ML'
  };
  
  document.getElementById('dim-izquierda').textContent = dimensiones.izquierda || '-';
  document.getElementById('dim-derecha').textContent = dimensiones.derecha || '-';
  document.getElementById('dim-frente').textContent = dimensiones.frente || '-';
  document.getElementById('dim-fondo').textContent = dimensiones.fondo || '-';
  
  // Link de WhatsApp
  document.getElementById('whatsapp-link').href = lote.whatsappLink || 
    `https://wa.me/51946552086?text=Hola,%20estoy%20interesado%20en%20el%20lote%20${lote.id.replace('Lote ', '')}`;
}

document.addEventListener('DOMContentLoaded', function() {
  console.log('Inicializando controles...');
  
  // Cargar todos los lotes desde los archivos JSON
  cargarTodosLosLotes();
  
  setupDualRangeSliders();
  filterAndRenderLotes();
  
  // Event listeners para filtros
  document.getElementById('sort-by-select').addEventListener('change', filterAndRenderLotes);
  document.getElementById('status-filter-select').addEventListener('change', filterAndRenderLotes);
  document.getElementById('search-text').addEventListener('input', filterAndRenderLotes);
  document.querySelector('.clear-filters').addEventListener('click', (e) => { e.preventDefault(); resetFilters(); });
  btnLotes.addEventListener('click', () => { hideAllPanels(); searchPanel.classList.add('visible'); btnLotes.classList.add('active'); });
  btnAreas.addEventListener('click', () => { hideAllPanels(); areasPanel.classList.add('visible'); btnAreas.classList.add('active'); renderAreasComunes(); });
  closePanelButton.addEventListener('click', () => { hideAllPanels(); });
  closeSearchPanelButton.addEventListener('click', () => { hideAllPanels(); });
  closeAreasPanelButton.addEventListener('click', () => { hideAllPanels(); });
  
  // Event listener para el botón "Volver"
  const backButton = document.querySelector('.back-button');
  if (backButton) {
    backButton.addEventListener('click', (e) => {
      e.preventDefault();
      volverAlPanelAnterior();
    });
  }
  document.getElementById('btn-zoom-in').addEventListener('click', () => { map.zoomIn(); });
  document.getElementById('btn-zoom-out').addEventListener('click', () => { map.zoomOut(); });
  document.getElementById('btn-cam-up').addEventListener('click', () => { map.panBy([0, -50]); });
  document.getElementById('btn-cam-down').addEventListener('click', () => { map.panBy([0, 50]); });
  document.getElementById('btn-home').addEventListener('click', () => { map.fitBounds(bounds); });

  // Funcionalidad del botón de colapsar controles móvil
  const collapseButton = document.getElementById('btn-collapse');
  const controlsContainer = document.querySelector('.bottom-center-controls');
  let isCollapsed = false;

  collapseButton.addEventListener('click', () => {
    isCollapsed = !isCollapsed;
    
    if (isCollapsed) {
      controlsContainer.classList.add('collapsed');
    } else {
      controlsContainer.classList.remove('collapsed');
    }
    
    // Guardar estado en localStorage para persistencia
    localStorage.setItem('controlsCollapsed', isCollapsed);
  });

  // Restaurar estado previo al cargar la página
  const savedCollapsedState = localStorage.getItem('controlsCollapsed');
  if (savedCollapsedState === 'true') {
    isCollapsed = true;
    controlsContainer.classList.add('collapsed');
  }

  const projectSelect = document.getElementById('project-select');
  const sectores = {
    'etapa-1': { bounds: makeBounds(sectorSizes['etapa-1'].width, sectorSizes['etapa-1'].height), files: ['Coord/lotes_A.json','Coord/lotes_B.json','Coord/lotes_C.json','Coord/lotes_D.json','Coord/lotes_E.json','Coord/lotes_F.json','Coord/lotes_G.json','Coord/lotes_H.json','Coord/lotes_I.json','Coord/lotes_J.json']},
    'etapa-2': { bounds: makeBounds(sectorSizes['etapa-2'].width, sectorSizes['etapa-2'].height), files: ['Coord/lotes_D2.json','Coord/lotes_E2.json','Coord/lotes_F2.json','Coord/lotes_G2.json'] },
    'completo': { bounds: makeBounds(sectorSizes['completo'].width, sectorSizes['completo'].height), files: ['Coord/images.json'] }
  };

  projectSelect.addEventListener('change', function() {
    const selectedSector = this.value;
    if (selectedSector && sectores[selectedSector]) {
      currentSector = selectedSector;
      const dims = sectorSizes[selectedSector] || sectorSizes['completo'];
      const newBounds = makeBounds(dims.width, dims.height);
      if (polygons.length > 0) { polygons.forEach(pol => { if (pol.poly) map.removeLayer(pol.poly); }); polygons.length = 0; }
      map.setMaxBounds(newBounds);
      map.fitBounds(newBounds);
      let imageName;
      if (selectedSector === 'etapa-2') imageName = 'ETAPA 2 img.webp';
      else if (selectedSector === 'etapa-1') imageName = 'ETAPA 1 img.webp';
      else imageName = 'ETAPA GENERAL.webp';
      setOverlay(imageName, dims);
      sectores[selectedSector].files.forEach(file => { cargarLotes(file); });
      
      // Actualizar resultados de búsqueda cuando se cambie de etapa
      filterAndRenderLotes();
    } else if (selectedSector === '') {
      map.fitBounds(bounds);
    }
  });

  projectSelect.value = 'completo';
  projectSelect.dispatchEvent(new Event('change'));
  console.log('Controles inicializados correctamente');
});

let polygonsInteractiveDisabled = false;
function setPolygonsInteractive(enabled) { polygons.forEach(p => { try { p.poly.options.interactive = enabled; } catch (e) {} }); }
map.on('movestart zoomstart', () => { if (!polygonsInteractiveDisabled) { polygonsInteractiveDisabled = true; setPolygonsInteractive(false); if (canvasRenderer && canvasRenderer._container) canvasRenderer._container.style.pointerEvents = 'none'; } });
map.on('moveend zoomend', () => { if (polygonsInteractiveDisabled) { polygonsInteractiveDisabled = false; setPolygonsInteractive(true); if (canvasRenderer && canvasRenderer._container) canvasRenderer._container.style.pointerEvents = ''; } });

function throttle(fn, wait) { let last = 0; return function(...args) { const now = Date.now(); if (now - last >= wait) { last = now; fn.apply(this, args); } } }

const POPUP_ZOOM_THRESHOLD = -1;
const updatePopupsBasedOnZoom = throttle(() => {
  const z = map.getZoom();
  const shouldBind = z >= POPUP_ZOOM_THRESHOLD;
  polygons.forEach(obj => {
    try {
      // Solo vincular popups si NO es una amenidad
      if (shouldBind && !obj.popupBound && !obj.isAmenidad) { 
        obj.poly.bindPopup(obj.popupContent); 
        obj.popupBound = true; 
      }
      else if (!shouldBind && obj.popupBound) { 
        obj.poly.unbindPopup(); 
        obj.popupBound = false; 
      }
    } catch (e) {}
  });
}, 250);

map.on('zoomend', updatePopupsBasedOnZoom);

// --- Mobile nav, stage buttons and WhatsApp functions moved from inline scripts ---

// Mobile navigation: inject hamburger button and overlay, handle toggle
document.addEventListener('DOMContentLoaded', function () {
  const headerContent = document.querySelector('.header-content');
  if (!headerContent) return;
  const mobileBtn = document.createElement('button');
  mobileBtn.className = 'mobile-menu-btn';
  mobileBtn.setAttribute('aria-label', 'Abrir menú');
  mobileBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>
  `;
  const cta = headerContent.querySelector('.cta-button');
  if (cta) headerContent.insertBefore(mobileBtn, cta); else headerContent.appendChild(mobileBtn);
  const mobileNav = document.createElement('div');
  mobileNav.className = 'mobile-nav';
  mobileNav.innerHTML = `
    <div class="mobile-panel" role="dialog" aria-modal="true">
      <button class="mobile-close" aria-label="Cerrar menú" style="align-self:flex-end;background:none;border:none;font-size:1.6rem;">&times;</button>
      <nav class="desktop-nav" role="navigation"></nav>
      <div class="mobile-logo-container">
        <img src="LOGO WEBP NEGRO.webp" alt="Casa Bonita Logo" class="mobile-logo">
      </div>
    </div>
  `;
  document.body.appendChild(mobileNav);
  const desktopNav = document.querySelector('.desktop-nav');
  const mobilePanelNav = mobileNav.querySelector('.desktop-nav');
  if (desktopNav && mobilePanelNav) mobilePanelNav.innerHTML = desktopNav.innerHTML;
  const openMenu = () => { mobileNav.classList.add('open'); document.documentElement.classList.add('no-scroll'); document.body.classList.add('no-scroll'); mobileBtn.setAttribute('aria-expanded', 'true'); };
  const closeMenu = () => { mobileNav.classList.remove('open'); document.documentElement.classList.remove('no-scroll'); document.body.classList.remove('no-scroll'); mobileBtn.setAttribute('aria-expanded', 'false'); };
  mobileBtn.addEventListener('click', openMenu);
  mobileNav.querySelector('.mobile-close').addEventListener('click', closeMenu);
  mobileNav.addEventListener('click', (e) => { if (e.target === mobileNav) closeMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && mobileNav.classList.contains('open')) closeMenu(); });
  mobileNav.addEventListener('click', (e) => { const link = e.target.closest('a'); if (!link) return; setTimeout(closeMenu, 150); });
});

// Sincronizar control visual de etapas con el select existente
document.addEventListener('DOMContentLoaded', function() {
  const select = document.getElementById('project-select');
  const buttons = document.querySelectorAll('.stage-btn');
  function updateButtonsFromSelect() { buttons.forEach(btn => { const v = btn.dataset.value; const pressed = (select.value === v); btn.setAttribute('aria-pressed', String(pressed)); }); }
  buttons.forEach(btn => { btn.addEventListener('click', () => { const v = btn.dataset.value; if (select.value === v) return; select.value = v; select.dispatchEvent(new Event('change')); updateButtonsFromSelect(); }); });
  select.addEventListener('change', updateButtonsFromSelect);
  updateButtonsFromSelect();
});

// Global WhatsApp click tracker and opener
window.lastWhatsAppClick = { source: null, timestamp: null };
window.openWhatsApp = function(source) {
  try {
    window.lastWhatsAppClick.source = source || 'unknown';
    window.lastWhatsAppClick.timestamp = Date.now();
    const url = 'https://wa.me/51946552086?text=Hola,%20quiero%20información%20sobre%20Casa%20Bonita%20Residencial.';
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch (err) { console.error('No se pudo abrir WhatsApp', err); }
};

// =============================================
// MODAL PARA MOSTRAR IMÁGENES DE AMENIDADES
// =============================================

// Mapeo de IDs de amenidades a nombres de archivos de imagen
const amenidadImageMap = {
  'club-house': 'Club House Casa Bonita Residencial Casa Bonita Grau Piura.webp',
  'clinica-casa-bonita': 'Clinica_Casa Bonita Residencial Casa Bonita Grau Piura.webp',
  'iglesia': 'iglesia.webp',
  'instituto': 'Instituto en la colina_Casa Bonita Residencial Casa Bonita Grau Piura.webp',
  'ciclovia-abajo-derecha': 'Ciclovía entre Árboles y Viviendas_Casa Bonita Residencial Casa Bonita Grau Piura.webp',
  'gimnasio-etapa2': 'GYMNASIO_Casa Bonita Residencial Casa Bonita Grau Piura.webp',
  'parque-sostenible-etapa2': 'PARQUE SOSTENIBLE_Casa Bonita Residencial Casa Bonita Grau Piura.webp',
  'parque-amarillo-meditacion': 'Parque Amarillo Meditacion Casa Bonita Residencial Casa Bonita Grau Piura.webp',
  'parque-animales': 'PARQUE ANIMALES_Casa Bonita Residencial Casa Bonita Grau Piura.webp',
  'parque-cultural': 'PARQUE CULTURAL_Casa Bonita Residencial Casa Bonita Grau Piura.webp',
  'parque-running': 'PARQUE F2 RUNNING_Casa Bonita Residencial Casa Bonita Grau Piura.webp',
  'parque-general': 'PARQUE GENERAL_Casa Bonita Residencial Casa Bonita Grau Piura.webp',
  'parque-infantil': 'PARQUE INFANTIL_Casa Bonita Residencial Casa Bonita Grau Piura.webp'
};

function openImageModal(amenidadId, amenidadNombre) {
  const modal = document.getElementById('imageModal');
  const modalImage = document.getElementById('modalImage');
  const modalTitle = document.getElementById('modalTitle');
  
  // Obtener el nombre del archivo de imagen
  const imageName = amenidadImageMap[amenidadId];
  if (!imageName) {
    console.warn(`No se encontró imagen para la amenidad: ${amenidadId}`);
    return;
  }
  
  // Configurar la imagen y título
  modalImage.src = `images/${imageName}`;
  modalImage.alt = amenidadNombre;
  modalTitle.textContent = amenidadNombre;
  
  // Mostrar el modal y bloquear scroll
  modal.classList.add('show');
  document.body.classList.add('no-scroll');
  document.documentElement.classList.add('no-scroll');
}

function closeImageModal() {
  const modal = document.getElementById('imageModal');
  modal.classList.remove('show');
  document.body.classList.remove('no-scroll');
  document.documentElement.classList.remove('no-scroll');
}

// Configurar eventos del modal cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
  const modal = document.getElementById('imageModal');
  const closeButton = modal.querySelector('.modal-close');
  
  // Cerrar modal al hacer click en X
  closeButton.addEventListener('click', closeImageModal);
  
  // Cerrar modal al hacer click en el overlay (fondo)
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      closeImageModal();
    }
  });
  
  // Cerrar modal con tecla Escape
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && modal.classList.contains('show')) {   
      closeImageModal();
    }
  });
});
