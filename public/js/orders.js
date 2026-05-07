/**
 * Módulo de Gestión de Órdenes de Trabajo
 * Máquina de estados + CRUD con persistencia en Firestore
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
import { getByType as getHistoryByType, DEFAULT_TYPES } from './history.js';

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
 * Creates a new order in "pedido" state.
 * @param {{ clienteId: string, descripcion: string, gramos?: number, extra?: number, tipoPieza?: string, precioFinal?: number, pesoPieza?: number, cantidad?: number }} data
 * @returns {Promise<{ id: string }>}
 */
export async function create(data) {
  if (!data || !data.clienteId) {
    throw new Error('Debe seleccionar un cliente');
  }
  if (!data.descripcion || data.descripcion.trim() === '') {
    throw new Error('La descripción es obligatoria');
  }

  const pesoPieza = Number(data.pesoPieza) || 0;
  const cantidad = Number(data.cantidad) || 1;
  const gramos = Number(data.gramos) || (pesoPieza * cantidad);
  const extra = Number(data.extra) || 0;
  const costoPropio = (gramos * 16) + extra;
  const costoMinimo = Math.round(costoPropio * 1.10 * 100) / 100;
  const precioCliente = Number(data.precioFinal) || costoMinimo;

  const now = serverTimestamp();

  const docData = {
    clienteId: data.clienteId,
    descripcion: data.descripcion.trim(),
    estado: 'pedido',
    pesoPieza,
    cantidad,
    gramos,
    extra,
    tipoPieza: data.tipoPieza || '',
    costoPropio,
    costoMinimo,
    precioCliente,
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
 * Updates an existing order.
 * @param {string} orderId
 * @param {{ clienteId: string, descripcion: string, gramos?: number, extra?: number, tipoPieza?: string, precioFinal?: number, pesoPieza?: number, cantidad?: number }} data
 * @returns {Promise<void>}
 */
export async function updateOrder(orderId, data) {
  if (!data || !data.clienteId) {
    throw new Error('Debe seleccionar un cliente');
  }
  if (!data.descripcion || data.descripcion.trim() === '') {
    throw new Error('La descripción es obligatoria');
  }

  const pesoPieza = Number(data.pesoPieza) || 0;
  const cantidad = Number(data.cantidad) || 1;
  const gramos = Number(data.gramos) || (pesoPieza * cantidad);
  const extra = Number(data.extra) || 0;
  const costoPropio = (gramos * 16) + extra;
  const costoMinimo = Math.round(costoPropio * 1.10 * 100) / 100;
  const precioCliente = Number(data.precioFinal) || costoMinimo;

  const updateData = {
    clienteId: data.clienteId,
    descripcion: data.descripcion.trim(),
    pesoPieza,
    cantidad,
    gramos,
    extra,
    tipoPieza: data.tipoPieza || '',
    costoPropio,
    costoMinimo,
    precioCliente,
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
    return `
      <tr>
        <td>${escapeHtml(order.descripcion || '—')}</td>
        <td>${clientName}</td>
        <td><span class="badge badge-${order.estado}">${order.estado}</span></td>
        <td>${formatDate(order.creadoEn)}</td>
        <td>
          <a href="#/ordenes/${order.id}" class="btn btn-sm btn-ghost">Ver</a>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Renders the new/edit order form.
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

    // Build tipo pieza options from defaults
    const tipoPiezaOptions = DEFAULT_TYPES.map(t =>
      `<option value="${t}" ${order && order.tipoPieza === t ? 'selected' : ''}>${t}</option>`
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
            <label class="form-label" for="order-tipo-pieza">Tipo de Pieza</label>
            <select id="order-tipo-pieza" class="form-select">
              <option value="">Seleccionar tipo...</option>
              ${tipoPiezaOptions}
              <option value="__custom__" ${order && order.tipoPieza && !DEFAULT_TYPES.includes(order.tipoPieza) ? 'selected' : ''}>Otro (personalizado)</option>
            </select>
          </div>
          <div class="form-group" id="custom-tipo-group" style="display: ${order && order.tipoPieza && !DEFAULT_TYPES.includes(order.tipoPieza) ? 'block' : 'none'};">
            <label class="form-label" for="order-tipo-custom">Tipo personalizado</label>
            <input type="text" id="order-tipo-custom" class="form-input" placeholder="Nombre del tipo" value="${order && order.tipoPieza && !DEFAULT_TYPES.includes(order.tipoPieza) ? escapeHtml(order.tipoPieza) : ''}">
          </div>
          <div class="form-group">
            <label class="form-label" for="order-peso-pieza">Peso por pieza (gramos)</label>
            <input type="number" id="order-peso-pieza" class="form-input" placeholder="Gramos por cada pieza" min="0" step="any" value="${order ? (order.pesoPieza || 0) : 0}">
            <p class="form-hint" id="peso-sugerido" style="display:none; color: var(--color-info);"></p>
          </div>
          <div class="form-group">
            <label class="form-label" for="order-cantidad">Cantidad de piezas</label>
            <input type="number" id="order-cantidad" class="form-input" placeholder="Cantidad" min="1" step="1" value="${order ? (order.cantidad || 1) : 1}">
          </div>
          <div class="form-group">
            <label class="form-label">Gramos totales</label>
            <input type="text" id="order-gramos-total" class="form-input" readonly value="0 g" style="background: var(--color-bg);">
            <input type="hidden" id="order-gramos" value="${order ? (order.gramos || 0) : 0}">
          </div>
          <div class="form-group">
            <label class="form-label" for="order-extra">Extra</label>
            <input type="number" id="order-extra" class="form-input" placeholder="Costo extra (opcional)" min="0" step="any" value="${order ? (order.extra || 0) : 0}">
          </div>
          <div class="form-group">
            <label class="form-label">Cálculo de Costos</label>
            <div id="cost-preview" class="card-body" style="background: var(--color-bg); padding: var(--space-md); border-radius: var(--radius-md);">
              <p><strong>Costo Producción:</strong> <span id="preview-costo">$0</span></p>
              <p><strong>Mínimo sugerido (+ 10%):</strong> <span id="preview-precio">$0</span></p>
              <p class="form-hint">Fórmula: (gramos totales × 16 + extra) × 1.10</p>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="order-precio-final">Precio que cobras al cliente</label>
            <input type="number" id="order-precio-final" class="form-input" placeholder="Ingresa lo que cobrarás" min="0" step="any" value="${order ? (order.precioCliente || '') : ''}">
            <p class="form-hint">Si lo dejas vacío, se usará el mínimo sugerido</p>
          </div>
          <div class="card-footer">
            <a href="#/ordenes" class="btn btn-ghost">Cancelar</a>
            <button type="submit" class="btn btn-primary">${isEdit ? 'Guardar Cambios' : 'Crear Orden'}</button>
          </div>
        </form>
      </div>
    `;

    app.innerHTML = html;

    // Attach cost calculator
    const pesoPiezaInput = document.getElementById('order-peso-pieza');
    const cantidadInput = document.getElementById('order-cantidad');
    const gramosInput = document.getElementById('order-gramos');
    const gramosTotalDisplay = document.getElementById('order-gramos-total');
    const extraInput = document.getElementById('order-extra');

    const updateCostPreview = () => {
      const pesoPieza = Number(pesoPiezaInput.value) || 0;
      const cantidad = Number(cantidadInput.value) || 1;
      const gramos = pesoPieza * cantidad;
      const extra = Number(extraInput.value) || 0;

      // Update gramos total
      gramosInput.value = gramos;
      gramosTotalDisplay.value = `${gramos} g (${pesoPieza}g × ${cantidad} piezas)`;

      const costoPropio = (gramos * 16) + extra;
      const precioCliente = Math.round(costoPropio * 1.10 * 100) / 100;
      document.getElementById('preview-costo').textContent = formatCurrency(costoPropio);
      document.getElementById('preview-precio').textContent = formatCurrency(precioCliente);
    };

    pesoPiezaInput.addEventListener('input', updateCostPreview);
    cantidadInput.addEventListener('input', updateCostPreview);
    extraInput.addEventListener('input', updateCostPreview);

    // Tipo pieza change handler - auto-fill peso from history
    const tipoPiezaSelect = document.getElementById('order-tipo-pieza');
    const customTipoGroup = document.getElementById('custom-tipo-group');
    const pesoSugerido = document.getElementById('peso-sugerido');

    tipoPiezaSelect.addEventListener('change', async () => {
      const tipo = tipoPiezaSelect.value;
      if (tipo === '__custom__') {
        customTipoGroup.style.display = 'block';
        pesoSugerido.style.display = 'none';
      } else {
        customTipoGroup.style.display = 'none';
        if (tipo) {
          // Look up last weight from history
          try {
            const historial = await getHistoryByType(tipo);
            if (historial.length > 0) {
              const ultimoPeso = historial[0].gramos / (historial[0].cantidad || 1) || historial[0].gramos;
              pesoPiezaInput.value = ultimoPeso;
              pesoSugerido.textContent = `Último peso registrado: ${ultimoPeso}g`;
              pesoSugerido.style.display = 'block';
              updateCostPreview();
            } else {
              pesoSugerido.style.display = 'none';
            }
          } catch (e) {
            pesoSugerido.style.display = 'none';
          }
        } else {
          pesoSugerido.style.display = 'none';
        }
      }
    });

    // Trigger initial cost preview if editing
    if (isEdit) {
      updateCostPreview();
    }

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
 * Handles order form submission (create or update).
 * @param {string|null} orderId - If provided, updates; otherwise creates
 */
async function handleOrderFormSubmit(orderId) {
  const clienteId = document.getElementById('order-cliente').value;
  const descripcion = document.getElementById('order-descripcion').value;
  const tipoPiezaSelect = document.getElementById('order-tipo-pieza');
  let tipoPieza = tipoPiezaSelect.value;
  if (tipoPieza === '__custom__') {
    tipoPieza = document.getElementById('order-tipo-custom').value.trim();
  }
  const pesoPieza = document.getElementById('order-peso-pieza').value;
  const cantidad = document.getElementById('order-cantidad').value;
  const gramos = document.getElementById('order-gramos').value;
  const extra = document.getElementById('order-extra').value;
  const precioFinal = document.getElementById('order-precio-final').value;

  // Clear errors
  const clienteError = document.getElementById('cliente-error');
  const descripcionError = document.getElementById('descripcion-error');
  clienteError.style.display = 'none';
  descripcionError.style.display = 'none';

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

  try {
    if (orderId) {
      await updateOrder(orderId, { clienteId, descripcion, tipoPieza, pesoPieza, cantidad, gramos, extra, precioFinal });
      showToast('Orden actualizada correctamente', 'success');
    } else {
      await create({ clienteId, descripcion, tipoPieza, pesoPieza, cantidad, gramos, extra, precioFinal });
      showToast('Orden creada correctamente', 'success');
    }
    Router.navigate('#/ordenes');
  } catch (error) {
    console.error('Error saving order:', error);
    showToast(error.message || 'Error al guardar orden', 'error');
  }
}

/**
 * Renders the order detail view.
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
          <p><strong>Tipo de Pieza:</strong> ${escapeHtml(order.tipoPieza || '—')}</p>
          <p><strong>Peso por pieza:</strong> ${order.pesoPieza || 0} g</p>
          <p><strong>Cantidad:</strong> ${order.cantidad || 1} piezas</p>
          <p><strong>Gramos totales:</strong> ${order.gramos || 0} g</p>
          <p><strong>Extra:</strong> ${formatCurrency(order.extra || 0)}</p>
          <p><strong>Costo Producción:</strong> ${formatCurrency(order.costoPropio || 0)}</p>
          <p><strong>Precio Cobrado:</strong> ${formatCurrency(order.precioCliente || 0)}</p>
          <p><strong>Ganancia:</strong> <span style="color: var(--color-success); font-weight: var(--font-weight-bold);">${formatCurrency((order.precioCliente || 0) - (order.costoPropio || 0))}</span></p>
          <p><strong>Creado:</strong> ${formatDate(order.creadoEn)}</p>
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
  getAll,
  getById,
  getByState,
  create,
  advanceState,
  getWithDetails,
  renderOrderList,
  renderOrderForm,
  renderOrderDetail,
};

export default Orders;
