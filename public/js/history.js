/**
 * Módulo Historial de Costos
 * Gestión del historial de costos por tipo de pieza con persistencia en Firestore
 */

import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db } from './firebase-config.js';
import { formatCurrency, formatDate, showToast } from './utils.js';

// --- Tipos de pieza predefinidos ---
export const DEFAULT_TYPES = ['Medallas', 'Trofeos', 'Galvanos', 'Llaveros', 'Porta celulares'];

// --- Data Functions ---

/**
 * Retrieves all history entries from Firestore, ordered by date descending.
 * @returns {Promise<Array<{ id: string, tipoPieza: string, gramos: number, extra: number, costoPropio: number, precioCliente: number, fecha: any }>>}
 */
export async function getAll() {
  const q = query(collection(db, 'historialCostos'), orderBy('fecha', 'desc'));
  const snapshot = await getDocs(q);
  const entries = [];
  snapshot.forEach(doc => {
    entries.push({ id: doc.id, ...doc.data() });
  });
  return entries;
}

/**
 * Retrieves history entries filtered by tipo de pieza.
 * @param {string} tipoPieza - The piece type to filter by
 * @returns {Promise<Array<{ id: string, tipoPieza: string, gramos: number, extra: number, costoPropio: number, precioCliente: number, fecha: any }>>}
 */
export async function getByType(tipoPieza) {
  const q = query(
    collection(db, 'historialCostos'),
    where('tipoPieza', '==', tipoPieza),
    orderBy('fecha', 'desc')
  );
  const snapshot = await getDocs(q);
  const entries = [];
  snapshot.forEach(doc => {
    entries.push({ id: doc.id, ...doc.data() });
  });
  return entries;
}

/**
 * Calculates average costo propio and precio cliente for a given piece type.
 * @param {string} tipoPieza - The piece type to calculate averages for
 * @returns {Promise<{ avgCosto: number, avgPrecio: number, count: number }>}
 */
export async function getAverages(tipoPieza) {
  const entries = await getByType(tipoPieza);
  if (entries.length === 0) {
    return { avgCosto: 0, avgPrecio: 0, count: 0 };
  }

  const totalCosto = entries.reduce((sum, e) => sum + e.costoPropio, 0);
  const totalPrecio = entries.reduce((sum, e) => sum + e.precioCliente, 0);
  const count = entries.length;

  return {
    avgCosto: totalCosto / count,
    avgPrecio: totalPrecio / count,
    count
  };
}

/**
 * Returns all available piece types (default + custom from Firestore).
 * @returns {Promise<string[]>}
 */
export async function getTypes() {
  const types = [...DEFAULT_TYPES];

  const snapshot = await getDocs(collection(db, 'tiposPieza'));
  snapshot.forEach(doc => {
    const data = doc.data();
    if (!data.esDefault && data.nombre && !types.includes(data.nombre)) {
      types.push(data.nombre);
    }
  });

  return types;
}

/**
 * Adds a custom piece type to Firestore.
 * @param {string} nombre - Name of the custom type
 * @returns {Promise<{ id: string }>}
 */
export async function addCustomType(nombre) {
  const docData = {
    nombre,
    esDefault: false,
    creadoEn: serverTimestamp()
  };

  const docRef = await addDoc(collection(db, 'tiposPieza'), docData);
  return { id: docRef.id };
}

/**
 * Saves a history entry to Firestore.
 * @param {{ tipoPieza: string, gramos: number, extra: number, costoPropio: number, precioCliente: number }} entry
 * @returns {Promise<{ id: string }>}
 */
export async function save(entry) {
  const docData = {
    tipoPieza: entry.tipoPieza,
    gramos: entry.gramos,
    extra: entry.extra,
    costoPropio: entry.costoPropio,
    precioCliente: entry.precioCliente,
    fecha: serverTimestamp()
  };

  const docRef = await addDoc(collection(db, 'historialCostos'), docData);
  return { id: docRef.id };
}

// --- Render Functions ---

/**
 * Renders the history view.
 * @param {string[]} types - Available piece types
 * @param {Array} entries - History entries to display
 * @param {string} selectedType - Currently selected filter type
 * @param {{ avgCosto: number, avgPrecio: number, count: number }|null} averages - Averages for selected type
 * @returns {string} HTML string
 */
function renderHistoryView(types, entries, selectedType, averages) {
  const typeOptions = types.map(t =>
    `<option value="${t}" ${t === selectedType ? 'selected' : ''}>${t}</option>`
  ).join('');

  const averagesHtml = selectedType && selectedType !== 'Todos' && averages && averages.count > 0
    ? `<div class="card" style="margin-bottom: var(--space-lg);">
        <div class="card-header">
          <h2 class="card-title">Promedios - ${selectedType}</h2>
        </div>
        <div class="card-body">
          <p><strong>Costo Propio Promedio:</strong> ${formatCurrency(averages.avgCosto)}</p>
          <p><strong>Precio Cliente Promedio:</strong> ${formatCurrency(averages.avgPrecio)}</p>
          <p><strong>Total de registros:</strong> ${averages.count}</p>
        </div>
      </div>`
    : '';

  const entriesHtml = entries.length === 0
    ? `<div class="empty-state">
        <p>No hay registros en el historial${selectedType && selectedType !== 'Todos' ? ` para "${selectedType}"` : ''}.</p>
      </div>`
    : `<div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Tipo de Pieza</th>
              <th>Gramos</th>
              <th>Extra</th>
              <th>Costo Propio</th>
              <th>Precio Cliente</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map(e => `
              <tr>
                <td>${e.tipoPieza}</td>
                <td>${e.gramos}</td>
                <td>${formatCurrency(e.extra)}</td>
                <td>${formatCurrency(e.costoPropio)}</td>
                <td>${formatCurrency(e.precioCliente)}</td>
                <td>${formatDate(e.fecha)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;

  return `
    <div class="view-container">
      <h1>Historial de Costos</h1>

      <div class="card" style="margin-bottom: var(--space-lg);">
        <div class="card-body">
          <div class="form-group" style="display: flex; gap: var(--space-md); align-items: flex-end; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 200px;">
              <label class="form-label" for="history-filter-type">Filtrar por tipo de pieza</label>
              <select id="history-filter-type" class="form-input">
                <option value="Todos" ${selectedType === 'Todos' ? 'selected' : ''}>Todos</option>
                ${typeOptions}
              </select>
            </div>
            <div>
              <button id="history-add-type-btn" class="btn btn-secondary">+ Agregar tipo</button>
            </div>
          </div>
        </div>
      </div>

      <div id="history-add-type-form" class="card" style="margin-bottom: var(--space-lg); display: none;">
        <div class="card-body">
          <form id="add-type-form">
            <div class="form-group" style="display: flex; gap: var(--space-md); align-items: flex-end; flex-wrap: wrap;">
              <div style="flex: 1; min-width: 200px;">
                <label class="form-label" for="new-type-name">Nombre del nuevo tipo</label>
                <input type="text" id="new-type-name" class="form-input" placeholder="Ej: Figuras" required>
              </div>
              <div>
                <button type="submit" class="btn btn-primary">Agregar</button>
                <button type="button" id="cancel-add-type" class="btn btn-secondary">Cancelar</button>
              </div>
            </div>
          </form>
        </div>
      </div>

      ${averagesHtml}
      ${entriesHtml}
    </div>
  `;
}

/**
 * Renders the history page and attaches event handlers.
 */
export async function renderHistory() {
  const app = document.getElementById('app');
  if (!app) return;

  // Show loading state
  app.innerHTML = `<div class="view-container"><p>Cargando historial...</p></div>`;

  try {
    const types = await getTypes();
    const entries = await getAll();
    app.innerHTML = renderHistoryView(types, entries, 'Todos', null);
    attachHistoryHandlers(types);
  } catch (error) {
    app.innerHTML = `<div class="view-container"><h1>Historial de Costos</h1><p>Error al cargar el historial.</p></div>`;
    showToast('Error al cargar el historial', 'error');
  }
}

/**
 * Attaches event handlers for the history view.
 * @param {string[]} types - Available piece types
 */
function attachHistoryHandlers(types) {
  const filterSelect = document.getElementById('history-filter-type');
  const addTypeBtn = document.getElementById('history-add-type-btn');
  const addTypeFormContainer = document.getElementById('history-add-type-form');
  const addTypeForm = document.getElementById('add-type-form');
  const cancelAddType = document.getElementById('cancel-add-type');

  if (filterSelect) {
    filterSelect.addEventListener('change', async () => {
      const selectedType = filterSelect.value;
      const app = document.getElementById('app');

      try {
        let entries;
        let averages = null;

        if (selectedType === 'Todos') {
          entries = await getAll();
        } else {
          entries = await getByType(selectedType);
          averages = await getAverages(selectedType);
        }

        const currentTypes = await getTypes();
        app.innerHTML = renderHistoryView(currentTypes, entries, selectedType, averages);
        attachHistoryHandlers(currentTypes);
      } catch (error) {
        showToast('Error al filtrar historial', 'error');
      }
    });
  }

  if (addTypeBtn && addTypeFormContainer) {
    addTypeBtn.addEventListener('click', () => {
      addTypeFormContainer.style.display = 'block';
    });
  }

  if (cancelAddType && addTypeFormContainer) {
    cancelAddType.addEventListener('click', () => {
      addTypeFormContainer.style.display = 'none';
    });
  }

  if (addTypeForm) {
    addTypeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('new-type-name');
      const nombre = nameInput.value.trim();

      if (!nombre) {
        showToast('Ingrese un nombre para el tipo de pieza', 'error');
        return;
      }

      // Check for duplicates
      if (types.includes(nombre)) {
        showToast('Este tipo de pieza ya existe', 'error');
        return;
      }

      try {
        await addCustomType(nombre);
        showToast('Tipo de pieza agregado correctamente', 'success');
        // Re-render the view
        await renderHistory();
      } catch (error) {
        showToast('Error al agregar tipo de pieza', 'error');
      }
    });
  }
}

// Export the module
export const History = {
  DEFAULT_TYPES,
  getAll,
  getByType,
  getAverages,
  getTypes,
  addCustomType,
  save,
  renderHistory,
};

export default History;
