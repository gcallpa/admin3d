/**
 * Módulo de Gestión de Clientes
 * CRUD de clientes con persistencia en Firestore
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
import { formatDate, showToast } from './utils.js';
import { Router } from './app.js';

// --- Data Functions ---

/**
 * Validates client data before saving.
 * @param {{ nombre?: string, telefono?: string, correo?: string }} data
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validate(data) {
  const errors = [];
  if (!data || !data.nombre || data.nombre.trim() === '') {
    errors.push('El nombre es obligatorio');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Lists all clients from Firestore, ordered by creation date descending.
 * @returns {Promise<Array<{ id: string, nombre: string, telefono: string, correo: string, creadoEn: any }>>}
 */
export async function getAll() {
  const q = query(collection(db, 'clientes'), orderBy('creadoEn', 'desc'));
  const snapshot = await getDocs(q);
  const clients = [];
  snapshot.forEach((docSnap) => {
    clients.push({ id: docSnap.id, ...docSnap.data() });
  });
  return clients;
}

/**
 * Gets a single client by ID.
 * @param {string} id
 * @returns {Promise<{ id: string, nombre: string, telefono: string, correo: string, creadoEn: any } | null>}
 */
export async function getById(id) {
  const docRef = doc(db, 'clientes', id);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) {
    return null;
  }
  return { id: docSnap.id, ...docSnap.data() };
}

/**
 * Creates a new client in Firestore.
 * @param {{ nombre: string, telefono?: string, correo?: string }} data
 * @returns {Promise<{ id: string }>}
 */
export async function create(data) {
  const validation = validate(data);
  if (!validation.valid) {
    throw new Error(validation.errors[0]);
  }
  const docData = {
    nombre: data.nombre.trim(),
    telefono: data.telefono || '',
    correo: data.correo || '',
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  };
  const docRef = await addDoc(collection(db, 'clientes'), docData);
  return { id: docRef.id };
}

/**
 * Updates an existing client.
 * @param {string} id
 * @param {{ nombre?: string, telefono?: string, correo?: string }} data
 * @returns {Promise<void>}
 */
export async function update(id, data) {
  if (data.nombre !== undefined) {
    const validation = validate(data);
    if (!validation.valid) {
      throw new Error(validation.errors[0]);
    }
  }
  const updateData = { ...data, actualizadoEn: serverTimestamp() };
  if (updateData.nombre) {
    updateData.nombre = updateData.nombre.trim();
  }
  const docRef = doc(db, 'clientes', id);
  await updateDoc(docRef, updateData);
}

/**
 * Gets orders associated with a client.
 * @param {string} clientId
 * @returns {Promise<Array>}
 */
export async function getOrdersByClient(clientId) {
  const q = query(
    collection(db, 'ordenes'),
    where('clienteId', '==', clientId),
    orderBy('creadoEn', 'desc')
  );
  const snapshot = await getDocs(q);
  const orders = [];
  snapshot.forEach((docSnap) => {
    orders.push({ id: docSnap.id, ...docSnap.data() });
  });
  return orders;
}

// --- Render Functions ---

/**
 * Renders the client list view.
 */
export async function renderClientList() {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `<div class="loading"><div class="loading-spinner"></div> Cargando clientes...</div>`;

  try {
    const clients = await getAll();

    let html = `
      <div class="page-header">
        <h1 class="page-title">Clientes</h1>
        <a href="#/clientes/nuevo" class="btn btn-primary">Nuevo Cliente</a>
      </div>
    `;

    if (clients.length === 0) {
      html += `
        <div class="empty-state">
          <div class="empty-state-icon">👥</div>
          <p class="empty-state-text">No hay clientes registrados</p>
          <a href="#/clientes/nuevo" class="btn btn-primary">Agregar primer cliente</a>
        </div>
      `;
    } else {
      html += `
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Teléfono</th>
                <th>Correo</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${clients.map(client => `
                <tr>
                  <td>${escapeHtml(client.nombre)}</td>
                  <td>${escapeHtml(client.telefono || '—')}</td>
                  <td>${escapeHtml(client.correo || '—')}</td>
                  <td>${formatDate(client.creadoEn)}</td>
                  <td>
                    <a href="#/clientes/${client.id}" class="btn btn-sm btn-ghost">Ver</a>
                    <a href="#/clientes/${client.id}/editar" class="btn btn-sm btn-ghost">Editar</a>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    app.innerHTML = html;
  } catch (error) {
    console.error('Error loading clients:', error);
    app.innerHTML = `<div class="empty-state"><p class="empty-state-text">Error al cargar clientes</p></div>`;
    showToast('Error al cargar clientes', 'error');
  }
}

/**
 * Renders the new/edit client form.
 * @param {{ id?: string }} params - If id is present, it's edit mode
 */
export async function renderClientForm(params = {}) {
  const app = document.getElementById('app');
  if (!app) return;

  const isEdit = !!params.id;
  let client = null;

  if (isEdit) {
    app.innerHTML = `<div class="loading"><div class="loading-spinner"></div> Cargando...</div>`;
    try {
      client = await getById(params.id);
      if (!client) {
        showToast('Cliente no encontrado', 'error');
        Router.navigate('#/clientes');
        return;
      }
    } catch (error) {
      console.error('Error loading client:', error);
      showToast('Error al cargar cliente', 'error');
      Router.navigate('#/clientes');
      return;
    }
  }

  const html = `
    <div class="page-header">
      <h1 class="page-title">${isEdit ? 'Editar Cliente' : 'Nuevo Cliente'}</h1>
    </div>
    <div class="card">
      <form id="client-form">
        <div class="form-group">
          <label class="form-label" for="client-nombre">Nombre *</label>
          <input type="text" id="client-nombre" class="form-input" placeholder="Nombre del cliente" value="${isEdit ? escapeHtml(client.nombre) : ''}" required>
          <div id="nombre-error" class="form-error" style="display:none;"></div>
        </div>
        <div class="form-group">
          <label class="form-label" for="client-telefono">Teléfono</label>
          <input type="tel" id="client-telefono" class="form-input" placeholder="Teléfono (opcional)" value="${isEdit ? escapeHtml(client.telefono || '') : ''}">
        </div>
        <div class="form-group">
          <label class="form-label" for="client-correo">Correo electrónico</label>
          <input type="email" id="client-correo" class="form-input" placeholder="Correo (opcional)" value="${isEdit ? escapeHtml(client.correo || '') : ''}">
        </div>
        <div class="card-footer">
          <a href="#/clientes" class="btn btn-ghost">Cancelar</a>
          <button type="submit" class="btn btn-primary">${isEdit ? 'Guardar Cambios' : 'Crear Cliente'}</button>
        </div>
      </form>
    </div>
  `;

  app.innerHTML = html;

  // Attach form submit handler
  const form = document.getElementById('client-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleClientFormSubmit(isEdit ? params.id : null);
  });
}

/**
 * Handles client form submission (create or update).
 * @param {string|null} clientId - If provided, updates; otherwise creates
 */
async function handleClientFormSubmit(clientId) {
  const nombre = document.getElementById('client-nombre').value;
  const telefono = document.getElementById('client-telefono').value;
  const correo = document.getElementById('client-correo').value;
  const errorEl = document.getElementById('nombre-error');
  const nombreInput = document.getElementById('client-nombre');

  // Clear previous errors
  errorEl.style.display = 'none';
  errorEl.textContent = '';
  nombreInput.classList.remove('error');

  const data = { nombre, telefono, correo };
  const validation = validate(data);

  if (!validation.valid) {
    errorEl.textContent = validation.errors[0];
    errorEl.style.display = 'block';
    nombreInput.classList.add('error');
    return;
  }

  try {
    if (clientId) {
      await update(clientId, data);
      showToast('Cliente actualizado correctamente', 'success');
    } else {
      await create(data);
      showToast('Cliente creado correctamente', 'success');
    }
    Router.navigate('#/clientes');
  } catch (error) {
    console.error('Error saving client:', error);
    showToast('Error al guardar cliente', 'error');
  }
}

/**
 * Renders the client detail view with associated orders.
 * @param {{ id: string }} params
 */
export async function renderClientDetail(params) {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `<div class="loading"><div class="loading-spinner"></div> Cargando...</div>`;

  try {
    const client = await getById(params.id);
    if (!client) {
      showToast('Cliente no encontrado', 'error');
      Router.navigate('#/clientes');
      return;
    }

    const orders = await getOrdersByClient(params.id);

    let html = `
      <div class="page-header">
        <h1 class="page-title">Detalle de Cliente</h1>
        <a href="#/clientes/${client.id}/editar" class="btn btn-primary">Editar</a>
      </div>
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">${escapeHtml(client.nombre)}</h2>
        </div>
        <div class="card-body">
          <p><strong>Teléfono:</strong> ${escapeHtml(client.telefono || '—')}</p>
          <p><strong>Correo:</strong> ${escapeHtml(client.correo || '—')}</p>
          <p><strong>Registrado:</strong> ${formatDate(client.creadoEn)}</p>
        </div>
      </div>

      <h2 style="margin-top: var(--space-xl); margin-bottom: var(--space-md);">Órdenes Asociadas</h2>
    `;

    if (orders.length === 0) {
      html += `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <p class="empty-state-text">Este cliente no tiene órdenes registradas</p>
        </div>
      `;
    } else {
      html += `
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Descripción</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${orders.map(order => `
                <tr>
                  <td>${escapeHtml(order.descripcion || '—')}</td>
                  <td><span class="badge badge-${order.estado}">${order.estado}</span></td>
                  <td>${formatDate(order.creadoEn)}</td>
                  <td>
                    <a href="#/ordenes/${order.id}" class="btn btn-sm btn-ghost">Ver</a>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    app.innerHTML = html;
  } catch (error) {
    console.error('Error loading client detail:', error);
    app.innerHTML = `<div class="empty-state"><p class="empty-state-text">Error al cargar detalle del cliente</p></div>`;
    showToast('Error al cargar detalle del cliente', 'error');
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
export const Clients = {
  getAll,
  getById,
  create,
  update,
  getOrdersByClient,
  validate,
  renderClientList,
  renderClientForm,
  renderClientDetail,
};

export default Clients;
