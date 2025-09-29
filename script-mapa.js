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
    .then(lotes => {
      const batchSize = 50;
      let currentBatch = 0;
      function processBatch() {
        const start = currentBatch * batchSize;
        const end = Math.min(start + batchSize, lotes.length);
        for (let i = start; i < end; i++) {
          const lote = lotes[i];
          const colors = {
            "Disponible": { fill: "#ffffff", stroke: "#111827" },
            "Reservado": { fill: "#f97316", stroke: "#ea580c" },
            "Vendido": { fill: "#16a34a", stroke: "#15803d" },
            "Bloqueado": { fill: "#dc2626", stroke: "#b91c1c" }
          };
          const colorConfig = colors[lote.estado] || colors["Bloqueado"];
          const simplifiedCoords = simplify(lote.coords, 0.5);
          const poly = L.polygon(simplifiedCoords, {
            renderer: canvasRenderer,
            className: 'hover-lote',
            fillColor: colorConfig.fill,
            color: colorConfig.stroke,
            weight: 1,
            opacity: 0.8,
            fillOpacity: 0.4,
            interactive: true,
            bubblingMouseEvents: false
          }).addTo(map);
          const popupContent = `<b>${lote.id}</b><br>Área: ${lote.area}<br>Precio: ${lote.precio}<br>Estado: ${lote.estado}`;
          const originalStyle = {
            fillOpacity: poly.options.fillOpacity,
            weight: poly.options.weight,
            fillColor: poly.options.fillColor,
            color: poly.options.color
          };
          poly.on('mouseover', function(e) {
            if (polygonsInteractiveDisabled) return;
            try { this.setStyle({ fillOpacity: Math.max(0.55, originalStyle.fillOpacity), weight: 2 }); } catch (err) {}
          });
          poly.on('mouseout', function(e) {
            try { this.setStyle({ fillOpacity: originalStyle.fillOpacity, weight: originalStyle.weight }); } catch (err) {}
          });
          let touchHighlighted = false;
          poly.on('click', function(e) {
            if (polygonsInteractiveDisabled) return;
            try {
              if (!touchHighlighted) {
                this.setStyle({ fillOpacity: Math.max(0.55, originalStyle.fillOpacity), weight: 2 });
              } else {
                this.setStyle({ fillOpacity: originalStyle.fillOpacity, weight: originalStyle.weight });
              }
              touchHighlighted = !touchHighlighted;
            } catch (err) {}
          });
          polygons.push({ poly, coords: lote.coords, loteData: lote, popupContent, popupBound: false, originalStyle });
        }
        currentBatch++;
        if (currentBatch * batchSize < lotes.length) requestAnimationFrame(processBatch);
      }
      processBatch();
    });
}

function getActivo() { return polygons[activo]; }

const lotesDisponibles = [
  {
    x: 9.15, y: 0.50, z: 15.28,
    manzana: 'K1', lote: '21',
    estado: 'Disponible',
    precioFinanciado: '$ 7,300.00',
    precioContado: '$ 6,600.00',
    tipo: 'Residencial',
    area: '116.56 m²',
    dimensiones: { izquierda: '19.43 ML', derecha: '19.43 ML', frente: '6.00 ML', fondo: '6.00 ML' },
    whatsappLink: 'https://wa.me/1234567890?text=Hola,%20estoy%20interesado%20en%20el%20lote%20K1-21'
  }
];

const areasComunes = [
  { nombre: 'Piscina', coords: { x: 0, y: 0, z: 0 } },
  { nombre: 'Cancha de Tenis', coords: { x: 10, y: 0, z: 10 } },
  { nombre: 'Parque Infantil', coords: { x: -10, y: 0, z: -10 } }
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
  const priceMin = document.getElementById('price-min');
  const priceMax = document.getElementById('price-max');
  areaMin.value = areaMin.min; areaMax.value = areaMax.max; priceMin.value = priceMin.min; priceMax.value = priceMax.max;
  document.getElementById('sort-by-select').selectedIndex = 0;
  setupDualRangeSliders(); filterAndRenderLotes();
}

function filterAndRenderLotes() {
  const areaMin = parseInt(document.getElementById('area-min').value);
  const areaMax = parseInt(document.getElementById('area-max').value);
  const priceMin = parseInt(document.getElementById('price-min').value);
  const priceMax = parseInt(document.getElementById('price-max').value);
  const sortBy = document.getElementById('sort-by-select').value;
  const resultsContainer = document.querySelector('#search-panel .panel-content');
  resultsContainer.querySelectorAll('.lote-result-card').forEach(card => card.remove());
  let filteredLotes = lotesDisponibles.filter(lote => {
    const area = parseFloat(lote.area.replace(/[^0-9.]/g, ''));
    const price = parseFloat(lote.precioContado.replace(/[^0-9.]/g, ''));
    return area >= areaMin && area <= areaMax && price >= priceMin && price <= priceMax;
  });
  filteredLotes.sort((a, b) => {
    const areaA = parseFloat(a.area.replace(/[^0-9.]/g, ''));
    const areaB = parseFloat(b.area.replace(/[^0-9.]/g, ''));
    const priceA = parseFloat(a.precioContado.replace(/[^0-9.]/g, ''));
    const priceB = parseFloat(b.precioContado.replace(/[^0-9.]/g, ''));
    switch (sortBy) {
      case 'area-asc': return areaA - areaB;
      case 'area-desc': return areaB - areaA;
      case 'price-asc': return priceA - priceB;
      case 'price-desc': return priceB - priceA;
      default: return 0;
    }
  });
  const countDisplay = document.getElementById('results-count-display');
  countDisplay.textContent = `Mostrando ${filteredLotes.length} lote(s)`;
  filteredLotes.forEach(lote => {
    const card = document.createElement('div');
    card.className = 'lote-result-card';
    card.innerHTML = `
      <h4>Mz. ${lote.manzana} - Lote ${lote.lote}</h4>
      <div class="card-info-grid">
        <div><span class="label">Estado</span><span class="value available">${lote.estado}</span></div>
        <div><span class="label">Área</span><span class="value">${lote.area}</span></div>
        <div><span class="label">Precio</span><span class="value">${lote.precioContado}</span></div>
      </div>
      <button class="ver-mas-btn">Ver más</button>
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
    item.textContent = area.nombre;
    item.onclick = () => { alert(`Has hecho clic en ${area.nombre}`); };
    areasList.appendChild(item);
  }
}

function updatePanelInfo(lote) {
  if (!lote) return;
  document.getElementById('lote-id').textContent = `Mz. ${lote.manzana} - Lote ${lote.lote}`;
  document.getElementById('lote-estado').textContent = lote.estado || '-';
  document.getElementById('lote-precio-financiado').textContent = lote.precioFinanciado || '-';
  document.getElementById('lote-precio-contado').textContent = lote.precioContado || '-';
  document.getElementById('lote-tipo').textContent = lote.tipo || '-';
  document.getElementById('lote-area').textContent = lote.area || '-';
  document.getElementById('dim-izquierda').textContent = lote.dimensiones.izquierda || '-';
  document.getElementById('dim-derecha').textContent = lote.dimensiones.derecha || '-';
  document.getElementById('dim-frente').textContent = lote.dimensiones.frente || '-';
  document.getElementById('dim-fondo').textContent = lote.dimensiones.fondo || '-';
  document.getElementById('whatsapp-link').href = lote.whatsappLink || '#';
}

document.addEventListener('DOMContentLoaded', function() {
  console.log('Inicializando controles...');
  setupDualRangeSliders();
  filterAndRenderLotes();
  document.getElementById('sort-by-select').addEventListener('change', filterAndRenderLotes);
  document.querySelector('.clear-filters').addEventListener('click', (e) => { e.preventDefault(); resetFilters(); });
  btnLotes.addEventListener('click', () => { hideAllPanels(); searchPanel.classList.add('visible'); btnLotes.classList.add('active'); });
  btnAreas.addEventListener('click', () => { hideAllPanels(); areasPanel.classList.add('visible'); btnAreas.classList.add('active'); renderAreasComunes(); });
  closePanelButton.addEventListener('click', () => { hideAllPanels(); });
  closeSearchPanelButton.addEventListener('click', () => { hideAllPanels(); });
  closeAreasPanelButton.addEventListener('click', () => { hideAllPanels(); });
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
      if (shouldBind && !obj.popupBound) { obj.poly.bindPopup(obj.popupContent); obj.popupBound = true; }
      else if (!shouldBind && obj.popupBound) { obj.poly.unbindPopup(); obj.popupBound = false; }
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
