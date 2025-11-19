// script-mapa.js
// Todos los scripts extraídos desde index.html para mantener el HTML limpio.

// API Configuration
const API_CONFIG = {
  // Cambiar por tu dominio de producción
  baseUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3002/api/units/stock' // Desarrollo local
    : 'https://proxy.casabonita.pe/api/units/stock', // CAMBIAR por tu URL de producción
  
  authUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3002/auth/external/token' // Desarrollo local
    : 'https://proxy.casabonita.pe/auth/external/token', // CAMBIAR por tu URL de producción
  
  projectCode: 'CASABONITA',
  stageIds: [1, 2],
  token: '' // Se obtiene del proxy automáticamente
  // ✅ SEGURIDAD: apiKey y subdomain eliminados del frontend
};

// Dimensiones por defecto para lotes (fallback cuando la API no las proporciona)
const DIMENSIONES_DEFAULT = {
  izquierda: '6.00 M',
  derecha: '6.00 M',
  frente: '11.00 M',
  fondo: '11.00 M'
};

// Función para obtener token inicial al cargar la página
async function initializeToken() {
  if (!API_CONFIG.token) {
    try {
      await renewToken();
      console.log('✅ Token inicial obtenido');
    } catch (error) {
      console.warn('⚠️ No se pudo obtener token inicial, se obtendrá cuando sea necesario');
    }
  }
}

// Función para renovar token a través del proxy (SIN CREDENCIALES EN FRONTEND)
async function renewToken() {
  try {
    console.log('🔄 Renovando token...');
    
    const response = await fetch(API_CONFIG.authUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.succeeded && data.data && data.data.accessToken) {
        API_CONFIG.token = data.data.accessToken;
        console.log('✅ Token renovado exitosamente');
        return data.data.accessToken;
      }
    }
    
    throw new Error(`Error renovando token: ${response.status}`);
  } catch (error) {
    console.error('❌ Error renovando token:', error);
    throw error;
  }
}

// Variables globales para API
let unitsData = {};

// Función para obtener datos de unidades desde la API real

async function getUnitsData() {
  try {
    // Limpiar datos anteriores
    unitsData = {};
    
    // Hacer llamadas para todas las etapas disponibles
    for (const stageId of API_CONFIG.stageIds) {
      // Construir URL del endpoint
      const apiUrl = `${API_CONFIG.baseUrl}?projectCode=${API_CONFIG.projectCode}&stageId=${stageId}`;
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        // Si es error 401 (token expirado), renovar automáticamente
        if (response.status === 401) {
          console.log('🔑 Token expirado, renovando automáticamente...');
          try {
            await renewToken();
            
            // Reintentar la llamada (el proxy maneja el token automáticamente)
            const retryResponse = await fetch(apiUrl, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              }
            });
            
            if (retryResponse.ok) {
              const apiResponse = await retryResponse.json();
              // Procesar los datos normalmente
              if (apiResponse && apiResponse.succeeded && apiResponse.data && apiResponse.data.properties) {
                apiResponse.data.properties.forEach(unit => {
                  if (unit.code && unit.status !== undefined && unit.areaSqm !== undefined) {
                    unitsData[unit.code] = {
                      estado: unit.status,
                      area: unit.areaSqm,
                      unitCode: unit.code,
                      stageId: stageId,
                      stageName: unit.stageName,
                      blockName: unit.blockName,
                      // Agregar dimensiones desde la API
                      dimensions: unit.dimensions ? {
                        front: unit.dimensions.front,
                        right: unit.dimensions.right,
                        left: unit.dimensions.left,
                        back: unit.dimensions.back
                      } : null,
                      lastUpdated: new Date().toISOString()
                    };
                  }
                });
              }
              continue; // Continuar con la siguiente etapa
            }
          } catch (renewError) {
            console.error('❌ Error renovando token:', renewError);
          }
        }
        
        if (response.status === 0 || !response.status) {
          throw new Error(`Error de conexión: No se puede conectar al proxy local en puerto 3002. ¿Está ejecutándose el servidor proxy?`);
        }
        throw new Error(`Error de API: ${response.status} ${response.statusText}`);
      }
      
      const apiResponse = await response.json();
      
      // Procesar los datos de la API
      if (apiResponse && apiResponse.succeeded && apiResponse.data && apiResponse.data.properties) {
        apiResponse.data.properties.forEach(unit => {
          // Adaptar los datos de la API al formato esperado
          if (unit.code && unit.status !== undefined && unit.areaSqm !== undefined) {
            unitsData[unit.code] = {
              estado: unit.status, // "Bloqueado", "Disponible", "Vendido", "Reservado"
              area: unit.areaSqm,
              unitCode: unit.code,
              stageId: stageId,
              stageName: unit.stageName,
              blockName: unit.blockName,
              // Agregar dimensiones desde la API
              dimensions: unit.dimensions ? {
                front: unit.dimensions.front,
                right: unit.dimensions.right,
                left: unit.dimensions.left,
                back: unit.dimensions.back
              } : null,
              lastUpdated: new Date().toISOString()
            };
          }
        });
      }
    }
    
    return unitsData;
  } catch (error) {
    console.error('Error conectando con API:', error);
    
    // Mostrar mensaje específico si es problema de proxy
    if (error.message.includes('proxy local')) {
      console.error('🔧 SOLUCIÓN: Ejecuta "start-proxy.bat" en otra ventana de terminal');
      console.error('🔧 O ejecuta: node proxy.js');
    }
    
    // Fallback: usar datos originales de JSON si falla la API
    return {};
  }
}

// Función para obtener información de un lote específico (solo estado y área)
function getLotInfo(lotCode) {
  const unit = unitsData[lotCode];
  if (!unit) {
    return null;
  }
  
  return {
    status: unit.estado || 'N/A',
    area: unit.area || 0,
    dimensions: unit.dimensions || null
  };
}

// Función para determinar el color según el estado
function getStatusColor(status) {
  switch (status?.toLowerCase()) {
    case 'disponible':
      return { fillColor: '#ffffff', color: '#111827' }; // Blanco con borde oscuro (--available-bg)
    case 'reservado':
      return { fillColor: '#f97316', color: '#ea580c' }; // Naranja (--reserved-bg)
    case 'vendido':
      return { fillColor: '#16a34a', color: '#15803d' }; // Verde (--sold-bg)
    case 'bloqueado':
      return { fillColor: '#dc2626', color: '#b91c1c' }; // Rojo (--blocked-bg)
    default:
      return { fillColor: '#007bff', color: '#0056b3' }; // Azul por defecto
  }
}

// Inicializar API al cargar la página
async function initializeAPI() {
  
  // Mostrar indicador de carga (opcional)
  const loadingIndicator = document.createElement('div');
  loadingIndicator.id = 'api-loading';
  loadingIndicator.innerHTML = `
    <div style="position: fixed; top: 20px; right: 20px; background: #007bff; color: white; padding: 10px 15px; border-radius: 5px; z-index: 1000; font-size: 14px;">
      <span>🔄 Conectando con API...</span>
    </div>
  `;
  document.body.appendChild(loadingIndicator);
  
  try {
    // Obtener token inicial si no existe
    await initializeToken();
    
    await getUnitsData();
    
    // Esperar un poco para que los polígonos se carguen
    setTimeout(() => {
      updateExistingPolygons();
    }, 2000); // Esperar 2 segundos
    
    // Mostrar mensaje de éxito
    loadingIndicator.innerHTML = `
      <div style="position: fixed; top: 20px; right: 20px; background: #28a745; color: white; padding: 10px 15px; border-radius: 5px; z-index: 1000; font-size: 14px;">
        <span>✅ API conectada (${Object.keys(unitsData).length} lotes)</span>
      </div>
    `;
    
    // Ocultar indicador después de 3 segundos
    setTimeout(() => {
      if (loadingIndicator.parentNode) {
        loadingIndicator.remove();
      }
    }, 3000);
    
  } catch (error) {
    console.error('Error inicializando modo offline:', error);
    
    // Mostrar mensaje de error
    loadingIndicator.innerHTML = `
      <div style="position: fixed; top: 20px; right: 20px; background: #dc3545; color: white; padding: 10px 15px; border-radius: 5px; z-index: 1000; font-size: 14px;">
        <span>⚠️ Error - usando datos locales únicamente</span>
      </div>
    `;
    
    // Ocultar indicador después de 5 segundos
    setTimeout(() => {
      if (loadingIndicator.parentNode) {
        loadingIndicator.remove();
      }
    }, 5000);
  }
}

// Función para actualizar polígonos existentes con información de API
function updateExistingPolygons() {
  let updatedCount = 0;
  
  polygons.forEach((polygonObj, index) => {
    // Solo actualizar lotes, no amenidades
    if (polygonObj.isAmenidad) return;
    
    const lote = polygonObj.loteData;
    if (!lote || !lote.id) {
      return;
    }
    
    // Solo buscar en API si hay datos disponibles
    if (Object.keys(unitsData).length > 0) {
      const lotInfo = getLotInfo(lote.id);
      
      if (lotInfo) {
        updatedCount++;
        
        // Actualizar colores del polígono según el estado de la API
        const colors = getStatusColor(lotInfo.status);
        polygonObj.poly.setStyle({
          fillColor: colors.fillColor,
          color: colors.color
        });
        
        // IMPORTANTE: Actualizar directamente los datos del lote en el polígono
        // Sobrescribir los valores de estado y área que vienen del JSON
        polygonObj.loteData.estado = lotInfo.status;  // Usar campo normalizado
        polygonObj.loteData.area = `${lotInfo.area} m²`;  // Usar campo normalizado
        
        // Actualizar popup content con información de API (solo estado y área)
        polygonObj.popupContent = `
          <div style="font-family: Arial, sans-serif; min-width: 200px;">
            <h3 style="margin: 0 0 10px 0; color: #333;">${lote.id}</h3>
            <div style="margin-bottom: 8px;"><strong>Área:</strong> ${lotInfo.area} m²</div>
            <div style="margin-bottom: 8px;"><strong>Estado:</strong> 
              <span style="color: ${colors.color}; font-weight: bold;">${lotInfo.status}</span>
            </div>
          </div>
        `;
        
        // Re-bind popup si ya estaba vinculado
        if (polygonObj.popupBound) {
          polygonObj.poly.bindPopup(polygonObj.popupContent);
        }
      }
    }
  });
  
  // Solo actualizar todosLosLotes si hay datos de API
  if (Object.keys(unitsData).length > 0) {
    // Paso 1: Actualizar lotes existentes en todosLosLotes
    let updatedExisting = 0;
    todosLosLotes.forEach(lote => {
      const lotInfo = getLotInfo(lote.id);
      if (lotInfo) {
        lote.estado = lotInfo.status;  // Usar campo normalizado
        lote.area = `${lotInfo.area} m²`;  // Usar campo normalizado
        updatedExisting++;
      }
    });
    
    // Paso 2: Agregar lotes de API que NO están en todosLosLotes
    const existingIds = new Set(todosLosLotes.map(lote => lote.id));
    let addedNew = 0;
    
    Object.keys(unitsData).forEach(lotId => {
      if (!existingIds.has(lotId)) {
        const apiData = unitsData[lotId];
        
        // Parsear información del ID del lote
        const lotInfo = parsearLoteId(lotId);
        
        // Crear nuevo lote con estructura consistente
        const nuevoLote = {
          id: lotId,
          nombre: `Lote ${lotId}`,
          coordinates: [], // Sin coordenadas para polígono (solo para búsqueda)
          estado: apiData.status || 'Disponible',
          area: `${apiData.area || 100} m²`,
          manzana: lotInfo.manzana,
          loteNumero: lotInfo.lote,
          tipo: 'Residencial',
          dimensiones: DIMENSIONES_DEFAULT,
          whatsappLink: `https://wa.me/51946552086?text=Hola,%20estoy%20interesado%20en%20el%20lote%20${lotId.replace('Lote ', '')}`
        };
        
        todosLosLotes.push(nuevoLote);
        addedNew++;
      }
    });
    
    // Actualizar rangos de filtros después de integrar datos de API
    actualizarRangosFiltros();
  }
  
  // Re-renderizar los filtros para mostrar los datos actualizados
  if (typeof filterAndRenderLotes === 'function') {
    filterAndRenderLotes();
  }
}

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
    try { map.removeLayer(currentOverlay); } catch (e) { }
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
              fillColor: "#f3eac6d2", // Verde claro para amenidades
              color: "#d7d7d775"
            };
            popupContent = `<b>${lote.nombre}</b><br>Tipo: ${lote.tipo}<br>Click para ver imagen`;
            
            // Función para abrir modal al hacer click
            clickHandler = function(e) {
              if (polygonsInteractiveDisabled) return;
              openImageModal(lote.id, lote.nombre);
            };
          } else {
            // Configuración para lotes normales - Integrar con API (solo estado y área)
            const lotInfo = getLotInfo(lote.id);
            let status, area;
            
            if (lotInfo) {
              // Usar información de la API (solo estado y área)
              status = lotInfo.status;
              area = `${lotInfo.area} m²`;
              colors = getStatusColor(lotInfo.status);
            } else {
              // Fallback a datos locales si no hay información de API
              const colorMap = {
                "Disponible": { fillColor: "#ffffff", color: "#111827" },
                "Reservado": { fillColor: "#f97316", color: "#ea580c" },
                "Vendido": { fillColor: "#16a34a", color: "#15803d" },
                "Bloqueado": { fillColor: "#dc2626", color: "#b91c1c" }
              };
              // Usar los campos normalizados
              status = lote.estado || 'Disponible'; 
              area = lote.area || '100 m²'; 
              colors = colorMap[lote.estado] || colorMap["Disponible"]; 
            }
            
            // Asegurar que colors nunca sea undefined
            if (!colors) {
              colors = { fillColor: "#ffffff", color: "#111827" }; // Colores por defecto
            }
            
            popupContent = `
              <div style="font-family: Arial, sans-serif; min-width: 200px;">
                <h3 style="margin: 0 0 10px 0; color: #333;">${lote.id}</h3>
                <div style="margin-bottom: 8px;"><strong>Área:</strong> ${area}</div>
                <div style="margin-bottom: 8px;"><strong>Estado:</strong> 
                  <span style="color: ${colors.color}; font-weight: bold;">${status}</span>
                </div>
              </div>
            `;
            
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
                  // Solo actualizar estado y área si hay información de API
                  ...(lotInfo ? { estado: lotInfo.status, area: `${lotInfo.area} m²` } : {}),
                  manzana: infoLote.manzana,
                  loteNumero: infoLote.lote,
                  tipo: 'Residencial',
                  dimensiones: DIMENSIONES_DEFAULT,
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
                // Error silencioso en click de lote
              }
            };
          }
          
          // Verificación final de seguridad para colors
          if (!colors || typeof colors !== 'object') {
            colors = { fillColor: "#ffffff", color: "#111827" };
          }
          
          const simplifiedCoords = simplify(lote.coords, 2.0); // Menos detalle = más rápido
          const poly = L.polygon(simplifiedCoords, {
            renderer: canvasRenderer,
            className: isAmenidades ? 'hover-amenidad' : 'hover-lote',
            fillColor: colors.fillColor || colors.fill,
            color: colors.color || colors.stroke,
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

// Variable global para almacenar todos los lotes cargados
let todosLosLotes = [];

// Función para extraer información de la manzana y lote del ID
function parsearLoteId(id, archivo = '') {
  // Formato real: "A1-01", "B2-15", etc.
  const match = id.match(/([A-Z]+)(\d*)-(\d+)/);
  if (match) {
    let manzana = match[1] + (match[2] || ''); // Ej: "A1", "B2", "D2"
    
    // Determinar si es etapa 2 basado en el archivo o el nombre de la manzana
    if (archivo.includes('2.json') || ['D2', 'E2', 'F2', 'G2'].includes(manzana)) {
      // Ya tiene el formato correcto para etapa 2
    }
    
    return {
      manzana: manzana,
      lote: match[3], // El número después del guión
      id: id
    };
  }
  
  // Fallback para formato anterior o casos especiales
  const oldMatch = id.match(/Lote ([A-Z]+)(\d+)/);
  if (oldMatch) {
    return {
      manzana: oldMatch[1],
      lote: oldMatch[2],
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
          // NORMALIZAR campos a formato estándar
          estado: lote.estado || 'Disponible',
          area: lote.area || '100 m²',
          manzana: infoLote.manzana,
          loteNumero: infoLote.lote,
          tipo: 'Residencial',
          dimensiones: DIMENSIONES_DEFAULT,
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
  
  // Calcular rangos de área (validar que sea número)
  const areas = todosLosLotes.map(lote => {
    let area = lote.area; // Solo usar campo normalizado
    // Si es string, limpiar caracteres no numéricos
    if (typeof area === 'string') {
      area = parseFloat(area.replace(/[^0-9.]/g, ''));
    }
    // Si ya es número, usarlo directamente
    return parseFloat(area);
  }).filter(area => !isNaN(area) && area > 0);
  
  if (areas.length === 0) return; // Si no hay áreas válidas, salir
  
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
    
    // Actualizar la etiqueta del rango
    const areaRangeLabel = document.getElementById('area-range-label');
    if (areaRangeLabel) {
      areaRangeLabel.textContent = `${areaMin} m² - ${areaMax} m²`;
    }
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
    // Verificar que el lote tenga los campos necesarios
    if (!lote || !lote.id) return false;
    
    // Usar solo campos normalizados
    const areaField = lote.area || '0 m²';
    const area = parseFloat(areaField.replace(/[^0-9.]/g, ''));
    
    // Usar solo campos normalizados
    const estadoField = lote.estado || '';
    const estadoMatch = !statusFilter || estadoField.toLowerCase() === statusFilter.toLowerCase();
    
    return area >= areaMin && area <= areaMax && estadoMatch;
  });
  
  // Ordenar los lotes
  filteredLotes.sort((a, b) => {
    // Usar solo campos normalizados
    const areaFieldA = a.area || '0 m²';
    const areaFieldB = b.area || '0 m²';
    const areaA = parseFloat(areaFieldA.replace(/[^0-9.]/g, ''));
    const areaB = parseFloat(areaFieldB.replace(/[^0-9.]/g, ''));
    
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
    
    // Usar solo campos normalizados
    const estado = lote.estado || 'N/A';
    const area = lote.area || 'N/A';
    const estadoClass = estado.toLowerCase().replace(/[^a-z]/g, '');
    
    card.innerHTML = `
      <h4>Mz. ${lote.manzana} - Lote ${lote.loteNumero}</h4>
      <div class="card-info-grid">
        <div><span class="label">Estado</span><span class="value status-${estadoClass}">${estado}</span></div>
        <div><span class="label">Área</span><span class="value">${area}</span></div>
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
        // Etapa 1: manzanas sin '2' en el nombre
        return !lote.manzana.includes('2');
      } else if (currentSector === 'etapa-2') {
        // Etapa 2: manzanas con '2' en el nombre (D2, E2, F2, G2)
        return lote.manzana.includes('2');
      }
      return true; // Para 'completo' mostrar todos
    });
  }

  const q = String(texto).toLowerCase().replace(/\blote\b/g, '').replace(/[^a-z0-9\s-]/g, ' ').trim();
  const parts = q.split(/[\s-]+/).filter(Boolean);
  
  // Buscar números en la consulta
  const nums = parts.filter(p => /^\d+$/.test(p));
  
  // Buscar letras (manzana) en la consulta
  const manPart = parts.find(p => /[a-z]/.test(p)) || '';
  
  return todosLosLotes.filter(l => {
    if (!l) return false;
    
    // Filtrar por etapa actual primero
    if (currentSector === 'etapa-1' && l.manzana.includes('2')) return false;
    if (currentSector === 'etapa-2' && !l.manzana.includes('2')) return false;
    
    const id = (l.id||'').toString().toLowerCase();
    const m = (l.manzana||'').toString().toLowerCase();
    const n = (l.loteNumero||'').toString().toLowerCase();

    // Búsqueda por ID completo
    if (id.includes(q)) return true;
    
    // Búsqueda por manzana y número específico
    if (manPart && nums.length > 0) {
      const manzanaMatch = m.includes(manPart);
      const numeroMatch = nums.some(num => n.includes(num) || m.includes(num));
      return manzanaMatch && numeroMatch;
    }
    
    // Búsqueda solo por número
    if (nums.length > 0 && !manPart) {
      return nums.some(num => n.includes(num));
    }
    
    // Búsqueda solo por manzana
    if (manPart && nums.length === 0) {
      return m.includes(manPart);
    }
    
    // Búsqueda general
    return id.includes(q) || m.includes(q) || n.includes(q) || (m+n).includes(q.replace(/\s/g, ''));
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
        // Error silencioso al centrar lote
      }
    }
  }
}

function updatePanelInfo(lote) {
  if (!lote) return;
  
  // PRIORIZAR datos de API sobre datos locales del JSON
  let estado, area;
  
  // Buscar información actualizada de la API
  const lotInfo = getLotInfo(lote.id);
  
  if (lotInfo && lotInfo.status && lotInfo.status !== 'N/A') {
    // Usar datos de la API (más actualizados)
    estado = lotInfo.status;
    area = `${lotInfo.area} m²`;
  } else {
    // Fallback a datos locales del JSON (ya normalizados)
    estado = lote.estado || 'N/A';
    area = lote.area || 'N/A';
  }
  
  // Actualizar información básica
  document.getElementById('lote-id').textContent = `Mz. ${lote.manzana} - Lote ${lote.loteNumero}`;
  document.getElementById('lote-estado').textContent = estado;
  document.getElementById('lote-estado').className = `status-tag status-${estado.toLowerCase().replace(/[^a-z]/g, '')}`;
  
  // Información adicional
  document.getElementById('lote-tipo').textContent = lote.tipo || 'Residencial';
  document.getElementById('lote-area').textContent = area;
  
  // Dimensiones - PRIORIZAR datos de API
  let dimensiones;
  
  if (lotInfo && lotInfo.dimensions) {
    // Validar que las dimensiones sean números válidos
    const hasValidDimensions = 
      typeof lotInfo.dimensions.front === 'number' && lotInfo.dimensions.front > 0 &&
      typeof lotInfo.dimensions.right === 'number' && lotInfo.dimensions.right > 0 &&
      typeof lotInfo.dimensions.left === 'number' && lotInfo.dimensions.left > 0 &&
      typeof lotInfo.dimensions.back === 'number' && lotInfo.dimensions.back > 0;
    
    if (hasValidDimensions) {
      // Usar dimensiones de la API (formato: front, right, left, back)
      dimensiones = {
        frente: `${lotInfo.dimensions.front.toFixed(2)} M`,
        derecha: `${lotInfo.dimensions.right.toFixed(2)} M`,
        izquierda: `${lotInfo.dimensions.left.toFixed(2)} M`,
        fondo: `${lotInfo.dimensions.back.toFixed(2)} M`
      };
    } else {
      // Si las dimensiones no son válidas, usar fallback
      dimensiones = lote.dimensiones || DIMENSIONES_DEFAULT;
    }
  } else {
    // Fallback: usar dimensiones del JSON local o valores por defecto
    dimensiones = lote.dimensiones || DIMENSIONES_DEFAULT;
  }
  
  document.getElementById('dim-izquierda').textContent = dimensiones.izquierda || '-';
  document.getElementById('dim-derecha').textContent = dimensiones.derecha || '-';
  document.getElementById('dim-frente').textContent = dimensiones.frente || '-';
  document.getElementById('dim-fondo').textContent = dimensiones.fondo || '-';
  
  // Link de WhatsApp - Comportamiento según estado del lote
  const whatsappElement = document.getElementById('whatsapp-link');
  const estadoLower = estado.toLowerCase();
  
  if (estadoLower === 'bloqueado') {
    // Lote bloqueado - No disponible para contacto
    whatsappElement.href = '#';
    whatsappElement.textContent = 'Lote No Disponible';
    whatsappElement.style.backgroundColor = '#dc2626';
    whatsappElement.style.cursor = 'not-allowed';
    whatsappElement.onclick = function(e) {
      e.preventDefault();
      return false;
    };
  } else if (estadoLower === 'reservado') {
    // Lote reservado - Contacto para lista de espera
    whatsappElement.href = `https://wa.me/51946552086?text=Hola,%20el%20lote%20${lote.id.replace('Lote ', '')}%20está%20reservado.%20¿Tienen%20otros%20lotes%20similares%20disponibles?`;
    whatsappElement.textContent = 'Consultar Disponibilidad';
    whatsappElement.style.backgroundColor = '#f97316';
    whatsappElement.style.cursor = 'pointer';
    whatsappElement.onclick = null;
  } else if (estadoLower === 'vendido') {
    // Lote vendido - No disponible
    whatsappElement.href = '#';
    whatsappElement.textContent = 'Lote Vendido';
    whatsappElement.style.backgroundColor = '#16a34a';
    whatsappElement.style.cursor = 'not-allowed';
    whatsappElement.onclick = function(e) {
      e.preventDefault();
      return false;
    };
  } else {
    // Lote disponible - Contacto normal
    whatsappElement.href = lote.whatsappLink || 
      `https://wa.me/51946552086?text=Hola,%20estoy%20interesado%20en%20el%20lote%20${lote.id.replace('Lote ', '')}`;
    whatsappElement.textContent = 'Contáctanos por WhatsApp';
    whatsappElement.style.backgroundColor = '#25D366';
    whatsappElement.style.cursor = 'pointer';
    whatsappElement.onclick = null;
  }
}

document.addEventListener('DOMContentLoaded', function() {
  
  // Cargar todos los lotes desde los archivos JSON
  cargarTodosLosLotes();
  
  setupDualRangeSliders();
  filterAndRenderLotes();
  
  // Event listeners para filtros
  document.getElementById('sort-by-select').addEventListener('change', filterAndRenderLotes);
  document.getElementById('status-filter-select').addEventListener('change', filterAndRenderLotes);
  document.getElementById('search-text').addEventListener('input', filterAndRenderLotes);
  document.querySelector('.clear-filters').addEventListener('click', (e) => { e.preventDefault(); resetFilters(); });
  btnLotes.addEventListener('click', () => { 
    hideAllPanels(); 
    searchPanel.classList.add('visible'); 
    btnLotes.classList.add('active'); 
    // Renderizar lotes al abrir el panel
    filterAndRenderLotes();
  });
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
  } catch (err) { /* Error silencioso */ }
};

// =============================================
// MODAL PARA MOSTRAR IMÁGENES DE AMENIDADES
// =============================================

// Mapeo de IDs de amenidades a nombres de archivos de imagen
const amenidadImageMap = {
  'club-house': 'Club House Casa Bonita Residencial Casa Bonita Grau Piura.webp',
  'clinica-casa-bonita': 'Clinica_Casa Bonita Residencial Casa Bonita Grau Piura.webp',
  'iglesia': 'Iglesia.webp',
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
  
  // Inicializar API al cargar la página
  initializeAPI();
});
