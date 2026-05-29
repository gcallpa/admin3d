/**
 * Módulo de Gestión de Órdenes de Trabajo
 * Máquina de estados + CRUD con persistencia en Firestore
 * Soporta múltiples items por orden
 */

import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  orderBy,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db } from './firebase-config.js';
import { formatDate, formatCurrency, showToast } from './utils.js';
import { Router } from './app.js';
import { getAll as getAllClients, getById as getClientById } from './clients.js';
import { renderPaymentsSection, attachPaymentFormHandler } from './payments.js';
import { getByType as getHistoryByType, DEFAULT_TYPES, getTypes as getHistoryTypes } from './history.js';

// --- State Machine ---

export const STATES = ['pedido', 'trabajando', 'terminado', 'entregado'];

export const VALID_TRANSITIONS = {
  'pedido': ['trabajando'],
  'trabajando': ['terminado'],
  'terminado': ['entregado'],
  'entregado': []
};

/**
 * Validates whether a transition from currentState to newState is allowed.
 * @param {string} currentState
 * @param {string} newState
 * @returns {boolean}
 */
export function canTransition(currentState, newState) {
  const allowed = VALID_TRANSITIONS[currentState];
  if (!allowed) return false;
  return allowed.includes(newState);
}

// --- Item Calculation Helpers ---

/**
 * Calculates derived fields for a single item.
 * @param {{ tipoPieza?: string, pesoPieza?: number, cantidad?: number, extra?: number, precioCliente?: number }} item
 * @returns {{ tipoPieza: string, pesoPieza: number, cantidad: number, gramos: number, extra: number, costoPropio: number, precioCliente: number }}
 */
export function calculateItem(item) {
  const tipoPieza = item.tipoPieza || '';
  const pesoPieza = Number(item.pesoPieza) || 0;
  const cantidad = Number(item.cantidad) || 1;
  const gramos = pesoPieza * cantidad;
  const extra = Number(item.extra) || 0;
  const costoPropio = (gramos * 16) + extra;
  const precioCliente = Number(item.precioCliente) || 0;

  return { tipoPieza, pesoPieza, cantidad, gramos, extra, costoPropio, precioCliente };
}

/**
 * Calculates order totals from an array of items.
 * @param {Array} items - Array of calculated items
 * @returns {{ costoPropio: number, precioCliente: number, gramos: number }}
 */
export function calculateTotals(items) {
  return items.reduce((totals, item) => {
    totals.costoPropio += item.costoPropio;
    totals.precioCliente += item.precioCliente;
    totals.gramos += item.gramos;
    return totals;
  }, { costoPropio: 0, precioCliente: 0, gramos: 0 });
}

// --- Data Functions ---

/**
 * Lists all orders from Firestore, optionally filtered by state.
 * @param {{ estado?: string }} [filter]
 * @returns {Promise<Array>}
 */
export async function getAll(filter) {
  let q;
  if (filter && filter.estado) {
    q = query(
      collection(db, 'ordenes'),
      where('estado', '==', filter.estado),
      orderBy('creadoEn', 'desc')
    );
  } else {
    q = query(collection(db, 'ordenes'), orderBy('creadoEn', 'desc'));
  }
  const snapshot = await getDocs(q);
  const orders = [];
  snapshot.forEach((docSnap) => {
    orders.push({ id: docSnap.id, ...docSnap.data() });
  });
  return orders;
}

/**
 * Gets a single order by ID.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getById(id) {
  const docRef = doc(db, 'ordenes', id);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) {
    return null;
  }
  return { id: docSnap.id, ...docSnap.data() };
}

/**
 * Gets orders filtered by state.
 * @param {string} state
 * @returns {Promise<Array>}
 */
export async function getByState(state) {
  return getAll({ estado: state });
}

/**
 * Creates a new order in "pedido" state with multiple items.
 * @param {{ clienteId: string, descripcion: string, items: Array }} data
 * @returns {Promise<{ id: string }>}
 */
export async function create(data) {
  if (!data || !data.clienteId) {
    throw new Error('Debe seleccionar un cliente');
  }
  if (!data.descripcion || data.descripcion.trim() === '') {
    throw new Error('La descripción es obligatoria');
  }
  if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
    throw new Error('Debe agregar al menos una pieza');
  }

  const calculatedItems = data.items.map(item => calculateItem(item));
  const totals = calculateTotals(calculatedItems);

  const now = serverTimestamp();

  const docData = {
    clienteId: data.clienteId,
    descripcion: data.descripcion.trim(),
    estado: 'pedido',
    items: calculatedItems,
    costoPropio: totals.costoPropio,
    precioCliente: totals.precioCliente,
    gramos: totals.gramos,
    totalPagado: 0,
    historialEstados: [
      { estado: 'pedido', fecha: new Date().toISOString() }
    ],
    creadoEn: now,
    actualizadoEn: now,
  };

  const docRef = await addDoc(collection(db, 'ordenes'), docData);
  return { id: docRef.id };
}

/**
 * Updates an existing order with multiple items.
 * @param {string} orderId
 * @param {{ clienteId: string, descripcion: string, items: Array }} data
 * @returns {Promise<void>}
 */
export async function updateOrder(orderId, data) {
  if (!data || !data.clienteId) {
    throw new Error('Debe seleccionar un cliente');
  }
  if (!data.descripcion || data.descripcion.trim() === '') {
    throw new Error('La descripción es obligatoria');
  }
  if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
    throw new Error('Debe agregar al menos una pieza');
  }

  const calculatedItems = data.items.map(item => calculateItem(item));
  const totals = calculateTotals(calculatedItems);

  const updateData = {
    clienteId: data.clienteId,
    descripcion: data.descripcion.trim(),
    items: calculatedItems,
    costoPropio: totals.costoPropio,
    precioCliente: totals.precioCliente,
    gramos: totals.gramos,
    actualizadoEn: serverTimestamp(),
  };

  const docRef = doc(db, 'ordenes', orderId);
  await updateDoc(docRef, updateData);
}

/**
 * Advances the order to the next valid state.
 * @param {string} orderId
 * @returns {Promise<{ newState: string }>}
 */
export async function advanceState(orderId) {
  const order = await getById(orderId);
  if (!order) {
    throw new Error('Orden no encontrada');
  }

  const currentState = order.estado;
  const nextStates = VALID_TRANSITIONS[currentState];

  if (!nextStates || nextStates.length === 0) {
    throw new Error(`No se puede avanzar desde el estado "${currentState}"`);
  }

  const newState = nextStates[0];

  const historialEstados = order.historialEstados || [];
  historialEstados.push({ estado: newState, fecha: new Date().toISOString() });

  const docRef = doc(db, 'ordenes', orderId);
  await updateDoc(docRef, {
    estado: newState,
    historialEstados,
    actualizadoEn: serverTimestamp(),
  });

  return { newState };
}

/**
 * Gets an order with full details (client info, payments).
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getWithDetails(id) {
  const order = await getById(id);
  if (!order) return null;

  // Get client info
  let cliente = null;
  if (order.clienteId) {
    cliente = await getClientById(order.clienteId);
  }

  // Get payments for this order
  const pagosQuery = query(
    collection(db, 'pagos'),
    where('ordenId', '==', id),
    orderBy('fecha', 'asc')
  );
  const pagosSnapshot = await getDocs(pagosQuery);
  const pagos = [];
  pagosSnapshot.forEach((docSnap) => {
    pagos.push({ id: docSnap.id, ...docSnap.data() });
  });

  const totalPagado = pagos.reduce((sum, p) => sum + (p.monto || 0), 0);
  const saldoPendiente = (order.precioCliente || 0) - totalPagado;

  return {
    ...order,
    cliente,
    pagos,
    totalPagado,
    saldoPendiente,
  };
}

// --- Render Functions ---

/**
 * Renders the order list view with state filter.
 */
export async function renderOrderList() {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `<div class="loading"><div class="loading-spinner"></div> Cargando órdenes...</div>`;

  try {
    const orders = await getAll();
    const clients = await getAllClients();
    const clientMap = {};
    clients.forEach(c => { clientMap[c.id] = c; });

    let html = `
      <div class="page-header">
        <h1 class="page-title">Órdenes</h1>
        <a href="#/ordenes/nueva" class="btn btn-primary">Nueva Orden</a>
      </div>
      <div class="filter-bar">
        <select id="order-state-filter" class="form-select">
          <option value="">Todos</option>
          <option value="pedido">Pedido</option>
          <option value="trabajando">Trabajando</option>
          <option value="terminado">Terminado</option>
          <option value="entregado">Entregado</option>
        </select>
      </div>
    `;

    if (orders.length === 0) {
      html += `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <p class="empty-state-text">No hay órdenes registradas</p>
          <a href="#/ordenes/nueva" class="btn btn-primary">Crear primera orden</a>
        </div>
      `;
    } else {
      html += `
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Descripción</th>
                <th>Cliente</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th>Valor Cobrado</th>
                <th>Saldo Pendiente</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="orders-tbody">
              ${renderOrderRows(orders, clientMap)}
            </tbody>
          </table>
        </div>
      `;
    }

    app.innerHTML = html;

    // Attach filter handler
    const filterSelect = document.getElementById('order-state-filter');
    if (filterSelect) {
      filterSelect.addEventListener('change', async (e) => {
        const estado = e.target.value;
        const filtered = estado
          ? orders.filter(o => o.estado === estado)
          : orders;
        const tbody = document.getElementById('orders-tbody');
        if (tbody) {
          tbody.innerHTML = renderOrderRows(filtered, clientMap);
        }
      });
    }
  } catch (error) {
    console.error('Error loading orders:', error);
    app.innerHTML = `<div class="empty-state"><p class="empty-state-text">Error al cargar órdenes</p></div>`;
    showToast('Error al cargar órdenes', 'error');
  }
}

/**
 * Renders table rows for orders.
 * @param {Array} orders
 * @param {Object} clientMap
 * @returns {string}
 */
function renderOrderRows(orders, clientMap) {
  return orders.map(order => {
    const client = clientMap[order.clienteId];
    const clientName = client ? escapeHtml(client.nombre) : '—';
    const totalCobrado = order.precioCliente || 0;
    const totalPagado = order.totalPagado || 0;
    const saldoPendiente = totalCobrado - totalPagado;

    // Estilo para el saldo pendiente: color rojo sutil si es mayor a cero
    const saldoStyle = saldoPendiente > 0 ? 'color: var(--color-error); font-weight: 600;' : '';

    return `
      <tr>
        <td>${escapeHtml(order.descripcion || '—')}</td>
        <td>${clientName}</td>
        <td><span class="badge badge-${order.estado}">${order.estado}</span></td>
        <td>${formatDate(order.creadoEn)}</td>
        <td>${formatCurrency(totalCobrado)}</td>
        <td style="${saldoStyle}">${formatCurrency(saldoPendiente)}</td>
        <td>
          <a href="#/ordenes/${order.id}" class="btn btn-sm btn-ghost">Ver</a>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Renders a single item row for the multi-item form.
 * @param {number} index - Item index
 * @param {Object} item - Item data (for edit mode)
 * @param {boolean} canRemove - Whether the remove button should be shown
 * @param {string[]} availableTypes - Available piece types
 * @returns {string}
 */
function renderItemRow(index, item = {}, canRemove = true, availableTypes = DEFAULT_TYPES) {
  const tipoPiezaOptions = availableTypes.map(t =>
    `<option value="${t}" ${item.tipoPieza === t ? 'selected' : ''}>${t}</option>`
  ).join('');

  return `
    <div class="order-item-row" data-item-index="${index}" style="border: 1px solid var(--color-border, #ddd); border-radius: var(--radius-md); padding: var(--space-md); margin-bottom: var(--space-md); position: relative;">
      <div style="display: flex; gap: var(--space-sm); flex-wrap: wrap; align-items: flex-end;">
        <div class="form-group" style="flex: 2; min-width: 140px; margin-bottom: 0;">
          <label class="form-label">Tipo de Pieza</label>
          <select class="form-select item-tipo-pieza" data-index="${index}">
            <option value="">Seleccionar...</option>
            ${tipoPiezaOptions}
          </select>
        </div>
        <div class="form-group" style="flex: 1; min-width: 100px; margin-bottom: 0;">
          <label class="form-label">Peso/pieza (g)</label>
          <input type="number" class="form-input item-peso-pieza" data-index="${index}" min="0" step="any" value="${item.pesoPieza || 0}" placeholder="0">
        </div>
        <div class="form-group" style="flex: 1; min-width: 80px; margin-bottom: 0;">
          <label class="form-label">Cantidad</label>
          <input type="number" class="form-input item-cantidad" data-index="${index}" min="1" step="1" value="${item.cantidad || 1}" placeholder="1">
        </div>
        <div class="form-group" style="flex: 1; min-width: 80px; margin-bottom: 0;">
          <label class="form-label">Extra</label>
          <input type="number" class="form-input item-extra" data-index="${index}" min="0" step="any" value="${item.extra || 0}" placeholder="0">
        </div>
        <div class="form-group" style="flex: 1; min-width: 100px; margin-bottom: 0;">
          <label class="form-label">Precio cobrado</label>
          <input type="number" class="form-input item-precio" data-index="${index}" min="0" step="any" value="${item.precioCliente || ''}" placeholder="0">
        </div>
        ${canRemove ? `<button type="button" class="btn btn-ghost btn-sm item-remove-btn" data-index="${index}" style="color: var(--color-danger, red); align-self: flex-end;" aria-label="Eliminar pieza">✕</button>` : ''}
      </div>
      <div class="item-preview" data-index="${index}" style="margin-top: var(--space-xs); font-size: var(--font-size-sm, 0.85rem); color: var(--color-text-muted, #666);">
        Gramos: 0 g | Costo: $0 | Mínimo: $0
      </div>
      <p class="form-hint item-peso-sugerido" data-index="${index}" style="display:none; color: var(--color-info); margin-top: var(--space-xs);"></p>
    </div>
  `;
}

/**
 * Renders the new/edit order form with multi-item support.
 * @param {{ id?: string }} [params] - If id is present, it's edit mode
 */
export async function renderOrderForm(params = {}) {
  const app = document.getElementById('app');
  if (!app) return;

  const isEdit = !!params.id;
  let order = null;

  app.innerHTML = `<div class="loading"><div class="loading-spinner"></div> Cargando...</div>`;

  try {
    const clients = await getAllClients();

    if (isEdit) {
      order = await getById(params.id);
      if (!order) {
        showToast('Orden no encontrada', 'error');
        Router.navigate('#/ordenes');
        return;
      }
    }

    // Determine initial items
    let initialItems = [];
    if (isEdit && order) {
      if (order.items && order.items.length > 0) {
        initialItems = order.items;
      } else {
        // Backward compatibility: convert old single-item order to items array
        initialItems = [{
          tipoPieza: order.tipoPieza || '',
          pesoPieza: order.pesoPieza || 0,
          cantidad: order.cantidad || 1,
          extra: order.extra || 0,
          precioCliente: order.precioCliente || 0,
        }];
      }
    } else {
      initialItems = [{}]; // Start with one empty item
    }

    // Load available piece types (predefined + custom from Firestore)
    let availableTypes = DEFAULT_TYPES;
    try {
      availableTypes = await getHistoryTypes();
    } catch (e) {
      // Fallback to defaults if loading fails
    }

    // Store types globally for addItemRow
    window._orderFormTypes = availableTypes;

    const itemsHtml = initialItems.map((item, i) =>
      renderItemRow(i, item, initialItems.length > 1, availableTypes)
    ).join('');

    const html = `
      <div class="page-header">
        <h1 class="page-title">${isEdit ? 'Editar Orden' : 'Nueva Orden'}</h1>
      </div>
      <div class="card">
        <form id="order-form">
          <div class="form-group">
            <label class="form-label" for="order-cliente">Cliente *</label>
            <select id="order-cliente" class="form-select" required>
              <option value="">Seleccionar cliente...</option>
              ${clients.map(c => `<option value="${c.id}" ${order && order.clienteId === c.id ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>`).join('')}
            </select>
            <div id="cliente-error" class="form-error" style="display:none;"></div>
          </div>
          <div class="form-group">
            <label class="form-label" for="order-descripcion">Descripción *</label>
            <textarea id="order-descripcion" class="form-textarea" placeholder="Descripción del trabajo" required>${order ? escapeHtml(order.descripcion || '') : ''}</textarea>
            <div id="descripcion-error" class="form-error" style="display:none;"></div>
          </div>

          <div class="form-group">
            <label class="form-label">Piezas</label>
            <div id="items-container">
              ${itemsHtml}
            </div>
            <button type="button" id="add-item-btn" class="btn btn-secondary" style="margin-top: var(--space-sm);">+ Agregar pieza</button>
            <div id="items-error" class="form-error" style="display:none;"></div>
          </div>

          <div class="form-group">
            <label class="form-label">Totales de la Orden</label>
            <div id="order-totals" class="card-body" style="background: var(--color-bg); padding: var(--space-md); border-radius: var(--radius-md);">
              <p><strong>Total Gramos:</strong> <span id="total-gramos">0 g</span></p>
              <p><strong>Total Costo Producción:</strong> <span id="total-costo">$0</span></p>
              <p><strong>Total Precio Cobrado:</strong> <span id="total-precio">$0</span></p>
              <p><strong>Ganancia Estimada:</strong> <span id="total-ganancia" style="color: var(--color-success); font-weight: var(--font-weight-bold);">$0</span></p>
            </div>
          </div>

          <div class="card-footer">
            <a href="#/ordenes" class="btn btn-ghost">Cancelar</a>
            <button type="submit" class="btn btn-primary">${isEdit ? 'Guardar Cambios' : 'Crear Orden'}</button>
          </div>
        </form>
      </div>
    `;

    app.innerHTML = html;

    // Attach dynamic item handlers
    attachItemHandlers();

    // Trigger initial totals calculation
    updateOrderTotals();

    // Attach form submit handler
    const form = document.getElementById('order-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleOrderFormSubmit(isEdit ? params.id : null);
    });
  } catch (error) {
    console.error('Error loading order form:', error);
    app.innerHTML = `<div class="empty-state"><p class="empty-state-text">Error al cargar formulario</p></div>`;
    showToast('Error al cargar formulario', 'error');
  }
}

/**
 * Attaches event handlers for item rows (add, remove, input changes).
 */
function attachItemHandlers() {
  const container = document.getElementById('items-container');
  const addBtn = document.getElementById('add-item-btn');

  if (!container) return;

  // Delegate events on the container
  container.addEventListener('input', (e) => {
    const target = e.target;
    if (target.classList.contains('item-peso-pieza') ||
        target.classList.contains('item-cantidad') ||
        target.classList.contains('item-extra') ||
        target.classList.contains('item-precio')) {
      const index = target.dataset.index;
      updateItemPreview(index);
      updateOrderTotals();
    }
  });

  container.addEventListener('change', async (e) => {
    const target = e.target;
    if (target.classList.contains('item-tipo-pieza')) {
      const index = target.dataset.index;
      const tipo = target.value;
      if (tipo) {
        // Auto-fill peso from history
        try {
          const historial = await getHistoryByType(tipo);
          if (historial.length > 0) {
            const ultimoPeso = historial[0].gramos / (historial[0].cantidad || 1) || historial[0].gramos;
            const pesoInput = container.querySelector(`.item-peso-pieza[data-index="${index}"]`);
            if (pesoInput) {
              pesoInput.value = ultimoPeso;
              updateItemPreview(index);
              updateOrderTotals();
            }
            const hint = container.querySelector(`.item-peso-sugerido[data-index="${index}"]`);
            if (hint) {
              hint.textContent = `Último peso registrado: ${ultimoPeso}g`;
              hint.style.display = 'block';
            }
          }
        } catch (err) {
          // Silently ignore history lookup errors
        }
      }
    }
  });

  container.addEventListener('click', (e) => {
    const target = e.target.closest('.item-remove-btn');
    if (target) {
      const index = target.dataset.index;
      removeItemRow(index);
    }
  });

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      addItemRow();
    });
  }
}

/**
 * Adds a new empty item row to the form.
 */
function addItemRow() {
  const container = document.getElementById('items-container');
  if (!container) return;

  const rows = container.querySelectorAll('.order-item-row');
  const newIndex = rows.length;

  const newRowHtml = renderItemRow(newIndex, {}, true, window._orderFormTypes || DEFAULT_TYPES);
  container.insertAdjacentHTML('beforeend', newRowHtml);

  // If we now have more than 1 row, ensure all rows have remove buttons
  updateRemoveButtons();
}

/**
 * Removes an item row from the form.
 * @param {string} index - The data-item-index to remove
 */
function removeItemRow(index) {
  const container = document.getElementById('items-container');
  if (!container) return;

  const rows = container.querySelectorAll('.order-item-row');
  if (rows.length <= 1) return; // Don't remove the last row

  const row = container.querySelector(`.order-item-row[data-item-index="${index}"]`);
  if (row) {
    row.remove();
    // Re-index remaining rows
    reindexItemRows();
    updateRemoveButtons();
    updateOrderTotals();
  }
}

/**
 * Re-indexes item rows after removal.
 */
function reindexItemRows() {
  const container = document.getElementById('items-container');
  if (!container) return;

  const rows = container.querySelectorAll('.order-item-row');
  rows.forEach((row, i) => {
    row.dataset.itemIndex = i;
    row.querySelectorAll('[data-index]').forEach(el => {
      el.dataset.index = i;
    });
  });
}

/**
 * Updates remove button visibility (hide if only 1 row).
 */
function updateRemoveButtons() {
  const container = document.getElementById('items-container');
  if (!container) return;

  const rows = container.querySelectorAll('.order-item-row');
  const canRemove = rows.length > 1;

  rows.forEach(row => {
    const removeBtn = row.querySelector('.item-remove-btn');
    if (canRemove && !removeBtn) {
      // Add remove button
      const index = row.dataset.itemIndex;
      const btnHtml = `<button type="button" class="btn btn-ghost btn-sm item-remove-btn" data-index="${index}" style="color: var(--color-danger, red); align-self: flex-end;" aria-label="Eliminar pieza">✕</button>`;
      const flexContainer = row.querySelector('div[style*="display: flex"]');
      if (flexContainer) {
        flexContainer.insertAdjacentHTML('beforeend', btnHtml);
      }
    } else if (!canRemove && removeBtn) {
      removeBtn.remove();
    }
  });
}

/**
 * Updates the cost preview for a single item row.
 * @param {string|number} index
 */
function updateItemPreview(index) {
  const container = document.getElementById('items-container');
  if (!container) return;

  const peso = Number(container.querySelector(`.item-peso-pieza[data-index="${index}"]`)?.value) || 0;
  const cantidad = Number(container.querySelector(`.item-cantidad[data-index="${index}"]`)?.value) || 1;
  const extra = Number(container.querySelector(`.item-extra[data-index="${index}"]`)?.value) || 0;

  const gramos = peso * cantidad;
  const costoPropio = (gramos * 16) + extra;
  const minimo = Math.round(costoPropio * 1.10 * 100) / 100;

  const preview = container.querySelector(`.item-preview[data-index="${index}"]`);
  if (preview) {
    preview.textContent = `Gramos: ${gramos} g | Costo: ${formatCurrency(costoPropio)} | Mínimo: ${formatCurrency(minimo)}`;
  }
}

/**
 * Updates the order totals section.
 */
function updateOrderTotals() {
  const container = document.getElementById('items-container');
  if (!container) return;

  const rows = container.querySelectorAll('.order-item-row');
  let totalGramos = 0;
  let totalCosto = 0;
  let totalPrecio = 0;

  rows.forEach(row => {
    const index = row.dataset.itemIndex;
    const peso = Number(container.querySelector(`.item-peso-pieza[data-index="${index}"]`)?.value) || 0;
    const cantidad = Number(container.querySelector(`.item-cantidad[data-index="${index}"]`)?.value) || 1;
    const extra = Number(container.querySelector(`.item-extra[data-index="${index}"]`)?.value) || 0;
    const precio = Number(container.querySelector(`.item-precio[data-index="${index}"]`)?.value) || 0;

    const gramos = peso * cantidad;
    const costoPropio = (gramos * 16) + extra;

    totalGramos += gramos;
    totalCosto += costoPropio;
    totalPrecio += precio;

    // Also update individual preview
    updateItemPreview(index);
  });

  const totalGanancia = totalPrecio - totalCosto;

  const gramosEl = document.getElementById('total-gramos');
  const costoEl = document.getElementById('total-costo');
  const precioEl = document.getElementById('total-precio');
  const gananciaEl = document.getElementById('total-ganancia');

  if (gramosEl) gramosEl.textContent = `${totalGramos} g`;
  if (costoEl) costoEl.textContent = formatCurrency(totalCosto);
  if (precioEl) precioEl.textContent = formatCurrency(totalPrecio);
  if (gananciaEl) {
    gananciaEl.textContent = formatCurrency(totalGanancia);
    gananciaEl.style.color = totalGanancia >= 0 ? 'var(--color-success)' : 'var(--color-danger, red)';
  }
}

/**
 * Handles order form submission (create or update).
 * @param {string|null} orderId - If provided, updates; otherwise creates
 */
async function handleOrderFormSubmit(orderId) {
  const clienteId = document.getElementById('order-cliente').value;
  const descripcion = document.getElementById('order-descripcion').value;

  // Clear errors
  const clienteError = document.getElementById('cliente-error');
  const descripcionError = document.getElementById('descripcion-error');
  const itemsError = document.getElementById('items-error');
  clienteError.style.display = 'none';
  descripcionError.style.display = 'none';
  itemsError.style.display = 'none';

  // Validate
  if (!clienteId) {
    clienteError.textContent = 'Debe seleccionar un cliente';
    clienteError.style.display = 'block';
    return;
  }
  if (!descripcion || descripcion.trim() === '') {
    descripcionError.textContent = 'La descripción es obligatoria';
    descripcionError.style.display = 'block';
    return;
  }

  // Collect items
  const container = document.getElementById('items-container');
  const rows = container.querySelectorAll('.order-item-row');
  const items = [];

  rows.forEach(row => {
    const index = row.dataset.itemIndex;
    const tipoPieza = container.querySelector(`.item-tipo-pieza[data-index="${index}"]`)?.value || '';
    const pesoPieza = Number(container.querySelector(`.item-peso-pieza[data-index="${index}"]`)?.value) || 0;
    const cantidad = Number(container.querySelector(`.item-cantidad[data-index="${index}"]`)?.value) || 1;
    const extra = Number(container.querySelector(`.item-extra[data-index="${index}"]`)?.value) || 0;
    const precioCliente = Number(container.querySelector(`.item-precio[data-index="${index}"]`)?.value) || 0;

    // Only include items that have at least tipoPieza or cantidad > 0
    if (tipoPieza || cantidad > 0) {
      items.push({ tipoPieza, pesoPieza, cantidad, extra, precioCliente });
    }
  });

  if (items.length === 0) {
    itemsError.textContent = 'Debe agregar al menos una pieza';
    itemsError.style.display = 'block';
    return;
  }

  try {
    if (orderId) {
      await updateOrder(orderId, { clienteId, descripcion, items });
      showToast('Orden actualizada correctamente', 'success');
    } else {
      await create({ clienteId, descripcion, items });
      showToast('Orden creada correctamente', 'success');
    }
    Router.navigate('#/ordenes');
  } catch (error) {
    console.error('Error saving order:', error);
    showToast(error.message || 'Error al guardar orden', 'error');
  }
}

/**
 * Renders the order detail view with items table.
 * @param {{ id: string }} params
 */
export async function renderOrderDetail(params) {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `<div class="loading"><div class="loading-spinner"></div> Cargando...</div>`;

  try {
    const order = await getWithDetails(params.id);
    if (!order) {
      showToast('Orden no encontrada', 'error');
      Router.navigate('#/ordenes');
      return;
    }

    const nextStates = VALID_TRANSITIONS[order.estado] || [];
    const canAdvance = nextStates.length > 0;

    // Build items section - support both new multi-item and old single-item format
    let itemsHtml = '';
    if (order.items && order.items.length > 0) {
      // New multi-item format
      itemsHtml = `
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Tipo Pieza</th>
                <th>Peso/pieza</th>
                <th>Cantidad</th>
                <th>Gramos</th>
                <th>Extra</th>
                <th>Costo</th>
                <th>Precio</th>
                <th>Ganancia</th>
              </tr>
            </thead>
            <tbody>
              ${order.items.map(item => `
                <tr>
                  <td>${escapeHtml(item.tipoPieza || '—')}</td>
                  <td>${item.pesoPieza || 0} g</td>
                  <td>${item.cantidad || 1}</td>
                  <td>${item.gramos || 0} g</td>
                  <td>${formatCurrency(item.extra || 0)}</td>
                  <td>${formatCurrency(item.costoPropio || 0)}</td>
                  <td>${formatCurrency(item.precioCliente || 0)}</td>
                  <td style="color: var(--color-success);">${formatCurrency((item.precioCliente || 0) - (item.costoPropio || 0))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div style="margin-top: var(--space-md); padding: var(--space-md); background: var(--color-bg); border-radius: var(--radius-md);">
          <p><strong>Total Gramos:</strong> ${order.gramos || 0} g</p>
          <p><strong>Total Costo Producción:</strong> ${formatCurrency(order.costoPropio || 0)}</p>
          <p><strong>Total Precio Cobrado:</strong> ${formatCurrency(order.precioCliente || 0)}</p>
          <p><strong>Ganancia Total:</strong> <span style="color: var(--color-success); font-weight: var(--font-weight-bold);">${formatCurrency((order.precioCliente || 0) - (order.costoPropio || 0))}</span></p>
        </div>
      `;
    } else {
      // Old single-item format (backward compatibility)
      itemsHtml = `
        <p><strong>Tipo de Pieza:</strong> ${escapeHtml(order.tipoPieza || '—')}</p>
        <p><strong>Peso por pieza:</strong> ${order.pesoPieza || 0} g</p>
        <p><strong>Cantidad:</strong> ${order.cantidad || 1} piezas</p>
        <p><strong>Gramos totales:</strong> ${order.gramos || 0} g</p>
        <p><strong>Extra:</strong> ${formatCurrency(order.extra || 0)}</p>
        <p><strong>Costo Producción:</strong> ${formatCurrency(order.costoPropio || 0)}</p>
        <p><strong>Precio Cobrado:</strong> ${formatCurrency(order.precioCliente || 0)}</p>
        <p><strong>Ganancia:</strong> <span style="color: var(--color-success); font-weight: var(--font-weight-bold);">${formatCurrency((order.precioCliente || 0) - (order.costoPropio || 0))}</span></p>
      `;
    }

    let html = `
      <div class="page-header">
        <h1 class="page-title">Detalle de Orden</h1>
        <div>
          <a href="#/ordenes/${params.id}/editar" class="btn btn-primary" style="margin-right: var(--space-sm);">Editar</a>
          <a href="#/ordenes" class="btn btn-ghost">Volver</a>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">${escapeHtml(order.descripcion)}</h2>
          <span class="badge badge-${order.estado}">${order.estado}</span>
        </div>
        <div class="card-body">
          <p><strong>Cliente:</strong> ${order.cliente ? escapeHtml(order.cliente.nombre) : '—'}</p>
          ${itemsHtml}
          <p style="margin-top: var(--space-md);"><strong>Creado:</strong> ${formatDate(order.creadoEn)}</p>
        </div>
      </div>

      <div class="card" style="margin-top: var(--space-lg);">
        <div class="card-header">
          <h2 class="card-title">Estado</h2>
        </div>
        <div class="card-body">
          ${canAdvance ? `
            <p>Estado actual: <span class="badge badge-${order.estado}">${order.estado}</span> → Siguiente: <span class="badge badge-${nextStates[0]}">${nextStates[0]}</span></p>
            <button id="advance-state-btn" class="btn btn-primary" style="margin-top: var(--space-md);">Avanzar Estado</button>
          ` : `
            <p>Estado final alcanzado: <span class="badge badge-${order.estado}">${order.estado}</span></p>
          `}
          <div id="state-error" class="form-error" style="display:none; margin-top: var(--space-sm);"></div>
        </div>
      </div>

      <div class="card" style="margin-top: var(--space-lg);">
        <div class="card-header">
          <h2 class="card-title">Historial de Estados</h2>
        </div>
        <div class="card-body">
          ${(order.historialEstados || []).map(h => `
            <p><span class="badge badge-${h.estado}">${h.estado}</span> — ${h.fecha ? formatDate(h.fecha) : '—'}</p>
          `).join('')}
        </div>
      </div>

      <div id="payments-section"></div>
    `;

    app.innerHTML = html;

    // Render payments section
    try {
      const paymentsHtml = await renderPaymentsSection(order, params.id);
      const paymentsContainer = document.getElementById('payments-section');
      if (paymentsContainer) {
        paymentsContainer.innerHTML = paymentsHtml;
        attachPaymentFormHandler(params.id, () => renderOrderDetail(params));
      }
    } catch (error) {
      console.error('Error loading payments:', error);
    }

    // Attach advance state handler
    const advanceBtn = document.getElementById('advance-state-btn');
    if (advanceBtn) {
      advanceBtn.addEventListener('click', async () => {
        try {
          const result = await advanceState(params.id);
          showToast(`Estado avanzado a "${result.newState}"`, 'success');
          renderOrderDetail(params);
        } catch (error) {
          const stateError = document.getElementById('state-error');
          if (stateError) {
            stateError.textContent = error.message;
            stateError.style.display = 'block';
          }
          showToast(error.message, 'error');
        }
      });
    }
  } catch (error) {
    console.error('Error loading order detail:', error);
    app.innerHTML = `<div class="empty-state"><p class="empty-state-text">Error al cargar detalle de orden</p></div>`;
    showToast('Error al cargar detalle de orden', 'error');
  }
}

// --- Utility ---

/**
 * Escapes HTML to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Export the module
export const Orders = {
  STATES,
  VALID_TRANSITIONS,
  canTransition,
  calculateItem,
  calculateTotals,
  getAll,
  getById,
  getByState,
  create,
  updateOrder,
  advanceState,
  getWithDetails,
  renderOrderList,
  renderOrderForm,
  renderOrderDetail,
};

export default Orders;
