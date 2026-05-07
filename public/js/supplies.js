/**
 * Módulo de Gestión de Suministros
 * CRUD de suministros con categorías y resúmenes por período
 */

import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db } from './firebase-config.js';
import { formatDate, formatCurrency, showToast } from './utils.js';
import { Router } from './app.js';

// --- Constants ---

/**
 * Categorías predefinidas de suministros.
 */
export const DEFAULT_CATEGORIES = [
  'Filamento PLA',
  'Filamento ABS',
  'Filamento PETG',
  'Resina',
  'Boquillas',
  'Repuestos',
  'Herramientas',
  'Otros'
];

// --- Validation ---

/**
 * Valida los datos de un suministro.
 * @param {{ producto: string, cantidad: number, precioUnitario: number }} data
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validate(data) {
  const errors = [];
  if (!data || !data.producto || data.producto.trim() === '') {
    errors.push('El nombre del producto es obligatorio');
  }
  if (!data || !data.cantidad || data.cantidad <= 0) {
    errors.push('La cantidad debe ser mayor a cero');
  }
  if (!data || !data.precioUnitario || data.precioUnitario <= 0) {
    errors.push('El precio unitario debe ser mayor a cero');
  }
  return { valid: errors.length === 0, errors };
}

// --- Calculations ---

/**
 * Calcula el precio total de un suministro.
 * @param {number} cantidad - Cantidad comprada (> 0)
 * @param {number} precioUnitario - Precio por unidad (> 0)
 * @returns {number} Precio total = cantidad × precioUnitario
 */
export function calculateTotal(cantidad, precioUnitario) {
  return cantidad * precioUnitario;
}

// --- CRUD Functions ---

/**
 * Crea un nuevo suministro en Firestore.
 * @param {{ producto: string, categoria?: string, proveedor?: string, cantidad: number, precioUnitario: number, fecha?: any }} data
 * @returns {Promise<{ id: string }>}
 */
export async function create(data) {
  const validation = validate(data);
  if (!validation.valid) {
    throw new Error(validation.errors[0]);
  }

  const precioTotal = calculateTotal(data.cantidad, data.precioUnitario);

  const docData = {
    producto: data.producto.trim(),
    categoria: data.categoria || 'Otros',
    proveedor: data.proveedor || '',
    cantidad: data.cantidad,
    precioUnitario: data.precioUnitario,
    precioTotal,
    fecha: data.fecha || serverTimestamp(),
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, 'suministros'), docData);
  return { id: docRef.id };
}

/**
 * Lista todos los suministros ordenados por fecha descendente.
 * @returns {Promise<Array>}
 */
export async function getAll() {
  const q = query(collection(db, 'suministros'), orderBy('fecha', 'desc'));
  const snapshot = await getDocs(q);
  const supplies = [];
  snapshot.forEach((docSnap) => {
    supplies.push({ id: docSnap.id, ...docSnap.data() });
  });
  return supplies;
}

/**
 * Obtiene un suministro por su ID.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getById(id) {
  const docRef = doc(db, 'suministros', id);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) {
    return null;
  }
  return { id: docSnap.id, ...docSnap.data() };
}

/**
 * Actualiza un suministro existente.
 * @param {string} id
 * @param {{ producto?: string, categoria?: string, proveedor?: string, cantidad?: number, precioUnitario?: number, fecha?: any }} data
 * @returns {Promise<void>}
 */
export async function update(id, data) {
  const validation = validate(data);
  if (!validation.valid) {
    throw new Error(validation.errors[0]);
  }

  const precioTotal = calculateTotal(data.cantidad, data.precioUnitario);

  const updateData = {
    producto: data.producto.trim(),
    categoria: data.categoria || 'Otros',
    proveedor: data.proveedor || '',
    cantidad: data.cantidad,
    precioUnitario: data.precioUnitario,
    precioTotal,
    actualizadoEn: serverTimestamp(),
  };

  if (data.fecha !== undefined) {
    updateData.fecha = data.fecha;
  }

  const docRef = doc(db, 'suministros', id);
  await updateDoc(docRef, updateData);
}

/**
 * Elimina un suministro de Firestore.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function remove(id) {
  const docRef = doc(db, 'suministros', id);
  await deleteDoc(docRef);
}

// --- Categories ---

/**
 * Retorna todas las categorías disponibles (predefinidas + personalizadas).
 * @returns {Promise<string[]>}
 */
export async function getCategories() {
  const q = query(collection(db, 'categoriasSuministro'));
  const snapshot = await getDocs(q);
  const custom = [];
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    if (data.nombre) {
      custom.push(data.nombre);
    }
  });
  return [...DEFAULT_CATEGORIES, ...custom];
}

/**
 * Agrega una categoría personalizada.
 * @param {string} nombre
 * @returns {Promise<{ id: string }>}
 */
export async function addCustomCategory(nombre) {
  if (!nombre || nombre.trim() === '') {
    throw new Error('El nombre de la categoría es obligatorio');
  }

  const trimmed = nombre.trim();

  // Check for duplicates in default categories
  if (DEFAULT_CATEGORIES.includes(trimmed)) {
    throw new Error('Esta categoría ya existe');
  }

  // Check for duplicates in custom categories
  const q = query(collection(db, 'categoriasSuministro'), where('nombre', '==', trimmed));
  const snapshot = await getDocs(q);
  if (!snapshot.empty) {
    throw new Error('Esta categoría ya existe');
  }

  const docRef = await addDoc(collection(db, 'categoriasSuministro'), {
    nombre: trimmed,
    creadoEn: serverTimestamp(),
  });

  return { id: docRef.id };
}

// --- Filtering by Category ---

/**
 * Filtra suministros por categoría.
 * @param {string} category
 * @returns {Promise<Array>}
 */
export async function getByCategory(category) {
  const q = query(
    collection(db, 'suministros'),
    where('categoria', '==', category),
    orderBy('fecha', 'desc')
  );
  const snapshot = await getDocs(q);
  const supplies = [];
  snapshot.forEach((docSnap) => {
    supplies.push({ id: docSnap.id, ...docSnap.data() });
  });
  return supplies;
}

/**
 * Retorna el gasto total por cada categoría en un período.
 * @param {number} year
 * @param {number} [month] - 0-11, si se omite calcula el año completo
 * @returns {Promise<Object>} Objeto con { categoria: total }
 */
export async function getTotalByCategory(year, month) {
  const supplies = await getByPeriod(year, month);
  const totals = {};
  for (const supply of supplies) {
    const cat = supply.categoria || 'Otros';
    totals[cat] = (totals[cat] || 0) + (supply.precioTotal || 0);
  }
  return totals;
}

// --- Period Functions ---

/**
 * Extrae un Date de un campo fecha de Firestore.
 * @param {any} fecha - Timestamp de Firestore, Date, o objeto con seconds
 * @returns {Date|null}
 */
function parseDate(fecha) {
  if (!fecha) return null;
  if (fecha instanceof Date) return fecha;
  if (fecha.seconds !== undefined) return new Date(fecha.seconds * 1000);
  if (fecha.toDate && typeof fecha.toDate === 'function') return fecha.toDate();
  const d = new Date(fecha);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Verifica si una fecha cae dentro de un período (año y opcionalmente mes).
 * @param {any} fecha
 * @param {number} year
 * @param {number} [month] - 0-11
 * @returns {boolean}
 */
function isInPeriod(fecha, year, month) {
  const date = parseDate(fecha);
  if (!date) return false;
  if (date.getFullYear() !== year) return false;
  if (month !== undefined && month !== null) {
    return date.getMonth() === month;
  }
  return true;
}

/**
 * Filtra suministros por año y opcionalmente mes.
 * @param {number} year
 * @param {number} [month] - 0-11, si se omite filtra por año completo
 * @returns {Promise<Array>}
 */
export async function getByPeriod(year, month) {
  const all = await getAll();
  return all.filter(supply => isInPeriod(supply.fecha, year, month));
}

/**
 * Retorna la suma de precioTotal de suministros en el período.
 * @param {number} year
 * @param {number} [month] - 0-11
 * @returns {Promise<number>}
 */
export async function getTotalByPeriod(year, month) {
  const supplies = await getByPeriod(year, month);
  return supplies.reduce((sum, s) => sum + (s.precioTotal || 0), 0);
}

/**
 * Retorna la cantidad de suministros en el período.
 * @param {number} year
 * @param {number} [month] - 0-11
 * @returns {Promise<number>}
 */
export async function getCountByPeriod(year, month) {
  const supplies = await getByPeriod(year, month);
  return supplies.length;
}

// --- Render Functions ---

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

/**
 * Renders the supply list view with filters and summary.
 */
export async function renderSupplyList() {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `<div class="loading"><div class="loading-spinner"></div> Cargando suministros...</div>`;

  try {
    const now = new Date();
    let selectedYear = now.getFullYear();
    let selectedMonth = now.getMonth();

    const [allSupplies, categories] = await Promise.all([getAll(), getCategories()]);

    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    let monthOptions = '';
    for (let i = 0; i < 12; i++) {
      let m = now.getMonth() - i;
      let y = now.getFullYear();
      if (m < 0) { m += 12; y--; }
      const selected = i === 0 ? 'selected' : '';
      monthOptions += `<option value="${y}-${m}" ${selected}>${monthNames[m]} ${y}</option>`;
    }

    let categoryOptions = `<option value="">Todas las categorías</option>`;
    categories.forEach(cat => {
      categoryOptions += `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`;
    });

    // Filter supplies for current period
    const periodSupplies = allSupplies.filter(s => isInPeriod(s.fecha, selectedYear, selectedMonth));

    const html = `
      <div class="page-header">
        <h1 class="page-title">Suministros</h1>
        <a href="#/suministros/nuevo" class="btn btn-primary">Nuevo Suministro</a>
      </div>
      <div class="filter-bar" style="display: flex; gap: var(--space-md); flex-wrap: wrap; margin-bottom: var(--space-lg);">
        <select id="supply-period-filter" class="form-select" style="width: auto; min-width: 160px;">
          ${monthOptions}
        </select>
        <select id="supply-category-filter" class="form-select" style="width: auto; min-width: 160px;">
          ${categoryOptions}
        </select>
      </div>
      <div id="supply-summary" class="card" style="margin-bottom: var(--space-lg);">
        ${renderSummarySection(periodSupplies)}
      </div>
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Producto</th>
              <th>Categoría</th>
              <th>Proveedor</th>
              <th>Cantidad</th>
              <th>P. Unitario</th>
              <th>P. Total</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody id="supplies-tbody">
            ${renderSupplyRows(periodSupplies)}
          </tbody>
        </table>
      </div>
    `;

    app.innerHTML = html;

    // Attach filter handlers
    const periodFilter = document.getElementById('supply-period-filter');
    const categoryFilter = document.getElementById('supply-category-filter');

    function applyFilters() {
      const [year, month] = periodFilter.value.split('-').map(Number);
      const category = categoryFilter.value;

      let filtered = allSupplies.filter(s => isInPeriod(s.fecha, year, month));
      if (category) {
        filtered = filtered.filter(s => s.categoria === category);
      }

      document.getElementById('supplies-tbody').innerHTML = renderSupplyRows(filtered);
      document.getElementById('supply-summary').innerHTML = renderSummarySection(filtered);
      attachDeleteHandlers();
    }

    if (periodFilter) periodFilter.addEventListener('change', applyFilters);
    if (categoryFilter) categoryFilter.addEventListener('change', applyFilters);

    attachDeleteHandlers();

    function attachDeleteHandlers() {
      const deleteButtons = document.querySelectorAll('.btn-delete-supply');
      deleteButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (window.confirm('¿Estás seguro de eliminar este suministro?')) {
            try {
              await remove(id);
              showToast('Suministro eliminado', 'success');
              renderSupplyList();
            } catch (error) {
              showToast('Error al eliminar suministro', 'error');
            }
          }
        });
      });
    }
  } catch (error) {
    console.error('Error loading supplies:', error);
    app.innerHTML = `<div class="empty-state"><p class="empty-state-text">Error al cargar suministros</p></div>`;
    showToast('Error al cargar suministros', 'error');
  }
}

/**
 * Renders summary section HTML.
 * @param {Array} supplies
 * @returns {string}
 */
function renderSummarySection(supplies) {
  const total = supplies.reduce((sum, s) => sum + (s.precioTotal || 0), 0);
  const count = supplies.length;

  // Breakdown by category
  const byCategory = {};
  supplies.forEach(s => {
    const cat = s.categoria || 'Otros';
    byCategory[cat] = (byCategory[cat] || 0) + (s.precioTotal || 0);
  });

  let categoryBreakdown = '';
  for (const [cat, catTotal] of Object.entries(byCategory)) {
    categoryBreakdown += `<p><strong>${escapeHtml(cat)}:</strong> ${formatCurrency(catTotal)}</p>`;
  }

  return `
    <div class="card-header">
      <h2 class="card-title">Resumen del Período</h2>
    </div>
    <div class="card-body">
      <p><strong>Total gastado:</strong> <span style="font-weight: var(--font-weight-bold); color: var(--color-warning);">${formatCurrency(total)}</span></p>
      <p><strong>Compras realizadas:</strong> ${count}</p>
      ${categoryBreakdown ? `<hr style="margin: var(--space-sm) 0;"><p><strong>Desglose por categoría:</strong></p>${categoryBreakdown}` : ''}
    </div>
  `;
}

/**
 * Renders table rows for supplies.
 * @param {Array} supplies
 * @returns {string}
 */
function renderSupplyRows(supplies) {
  if (supplies.length === 0) {
    return `<tr><td colspan="8" style="text-align: center;">No hay suministros en este período</td></tr>`;
  }
  return supplies.map(supply => `
    <tr>
      <td>${formatDate(supply.fecha)}</td>
      <td>${escapeHtml(supply.producto)}</td>
      <td>${escapeHtml(supply.categoria || 'Otros')}</td>
      <td>${escapeHtml(supply.proveedor || '—')}</td>
      <td>${supply.cantidad || 0}</td>
      <td>${formatCurrency(supply.precioUnitario || 0)}</td>
      <td>${formatCurrency(supply.precioTotal || 0)}</td>
      <td>
        <a href="#/suministros/${supply.id}/editar" class="btn btn-sm btn-ghost">Editar</a>
        <button class="btn btn-sm btn-ghost btn-delete-supply" data-id="${supply.id}" style="color: var(--color-danger);">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

/**
 * Renders the supply create/edit form.
 * @param {{ id?: string }} [params] - If id is present, it's edit mode
 */
export async function renderSupplyForm(params = {}) {
  const app = document.getElementById('app');
  if (!app) return;

  const isEdit = !!params.id;
  let supply = null;

  app.innerHTML = `<div class="loading"><div class="loading-spinner"></div> Cargando...</div>`;

  try {
    const categories = await getCategories();

    if (isEdit) {
      supply = await getById(params.id);
      if (!supply) {
        showToast('Suministro no encontrado', 'error');
        Router.navigate('#/suministros');
        return;
      }
    }

    // Build category options
    let categoryOptions = categories.map(cat => {
      const selected = supply && supply.categoria === cat ? 'selected' : '';
      return `<option value="${escapeHtml(cat)}" ${selected}>${escapeHtml(cat)}</option>`;
    }).join('');
    const customSelected = supply && supply.categoria && !categories.includes(supply.categoria) ? 'selected' : '';
    categoryOptions += `<option value="__custom__" ${customSelected}>Otra (personalizada)</option>`;

    // Format date for input
    let fechaValue = '';
    if (supply && supply.fecha) {
      const d = parseDate(supply.fecha);
      if (d) {
        fechaValue = d.toISOString().split('T')[0];
      }
    } else {
      fechaValue = new Date().toISOString().split('T')[0];
    }

    const html = `
      <div class="page-header">
        <h1 class="page-title">${isEdit ? 'Editar Suministro' : 'Nuevo Suministro'}</h1>
      </div>
      <div class="card">
        <form id="supply-form">
          <div class="form-group">
            <label class="form-label" for="supply-fecha">Fecha de compra *</label>
            <input type="date" id="supply-fecha" class="form-input" value="${fechaValue}" required>
            <div id="fecha-error" class="form-error" style="display:none;"></div>
          </div>
          <div class="form-group">
            <label class="form-label" for="supply-proveedor">Proveedor</label>
            <input type="text" id="supply-proveedor" class="form-input" placeholder="Nombre del proveedor" value="${supply ? escapeHtml(supply.proveedor || '') : ''}">
          </div>
          <div class="form-group">
            <label class="form-label" for="supply-producto">Producto *</label>
            <input type="text" id="supply-producto" class="form-input" placeholder="Nombre del producto" value="${supply ? escapeHtml(supply.producto || '') : ''}" required>
            <div id="producto-error" class="form-error" style="display:none;"></div>
          </div>
          <div class="form-group">
            <label class="form-label" for="supply-categoria">Categoría</label>
            <select id="supply-categoria" class="form-select">
              ${categoryOptions}
            </select>
          </div>
          <div class="form-group" id="custom-category-group" style="display: ${customSelected ? 'block' : 'none'};">
            <label class="form-label" for="supply-categoria-custom">Categoría personalizada</label>
            <input type="text" id="supply-categoria-custom" class="form-input" placeholder="Nombre de la categoría" value="${supply && supply.categoria && !categories.includes(supply.categoria) ? escapeHtml(supply.categoria) : ''}">
          </div>
          <div class="form-group">
            <label class="form-label" for="supply-cantidad">Cantidad *</label>
            <input type="number" id="supply-cantidad" class="form-input" placeholder="Cantidad" min="1" step="1" value="${supply ? (supply.cantidad || 1) : 1}" required>
            <div id="cantidad-error" class="form-error" style="display:none;"></div>
          </div>
          <div class="form-group">
            <label class="form-label" for="supply-precio-unitario">Precio unitario *</label>
            <input type="number" id="supply-precio-unitario" class="form-input" placeholder="Precio por unidad" min="1" step="any" value="${supply ? (supply.precioUnitario || '') : ''}" required>
            <div id="precio-error" class="form-error" style="display:none;"></div>
          </div>
          <div class="form-group">
            <label class="form-label">Precio total</label>
            <input type="text" id="supply-precio-total" class="form-input" readonly value="$0" style="background: var(--color-bg);">
          </div>
          <div class="card-footer">
            <a href="#/suministros" class="btn btn-ghost">Cancelar</a>
            <button type="submit" class="btn btn-primary">${isEdit ? 'Guardar Cambios' : 'Crear Suministro'}</button>
          </div>
        </form>
      </div>
    `;

    app.innerHTML = html;

    // Attach category toggle handler
    const categoriaSelect = document.getElementById('supply-categoria');
    const customCategoryGroup = document.getElementById('custom-category-group');
    categoriaSelect.addEventListener('change', () => {
      if (categoriaSelect.value === '__custom__') {
        customCategoryGroup.style.display = 'block';
      } else {
        customCategoryGroup.style.display = 'none';
      }
    });

    // Attach price preview
    const cantidadInput = document.getElementById('supply-cantidad');
    const precioUnitarioInput = document.getElementById('supply-precio-unitario');
    const precioTotalDisplay = document.getElementById('supply-precio-total');

    function updatePricePreview() {
      const cantidad = Number(cantidadInput.value) || 0;
      const precioUnitario = Number(precioUnitarioInput.value) || 0;
      const total = calculateTotal(cantidad, precioUnitario);
      precioTotalDisplay.value = formatCurrency(total);
    }

    cantidadInput.addEventListener('input', updatePricePreview);
    precioUnitarioInput.addEventListener('input', updatePricePreview);
    updatePricePreview();

    // Attach form submit handler
    const form = document.getElementById('supply-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleSupplyFormSubmit(isEdit ? params.id : null);
    });
  } catch (error) {
    console.error('Error loading supply form:', error);
    app.innerHTML = `<div class="empty-state"><p class="empty-state-text">Error al cargar formulario</p></div>`;
    showToast('Error al cargar formulario', 'error');
  }
}

/**
 * Handles supply form submission (create or update).
 * @param {string|null} supplyId
 */
async function handleSupplyFormSubmit(supplyId) {
  const fecha = document.getElementById('supply-fecha').value;
  const proveedor = document.getElementById('supply-proveedor').value;
  const producto = document.getElementById('supply-producto').value;
  const categoriaSelect = document.getElementById('supply-categoria');
  let categoria = categoriaSelect.value;
  const cantidad = Number(document.getElementById('supply-cantidad').value);
  const precioUnitario = Number(document.getElementById('supply-precio-unitario').value);

  // Handle custom category
  if (categoria === '__custom__') {
    const customCat = document.getElementById('supply-categoria-custom').value.trim();
    if (customCat) {
      try {
        await addCustomCategory(customCat);
      } catch (e) {
        // Category might already exist, that's fine
        if (!e.message.includes('ya existe')) {
          showToast(e.message, 'error');
          return;
        }
      }
      categoria = customCat;
    } else {
      categoria = 'Otros';
    }
  }

  // Clear errors
  const errorFields = ['producto-error', 'cantidad-error', 'precio-error', 'fecha-error'];
  errorFields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  // Validate
  const validation = validate({ producto, cantidad, precioUnitario });
  if (!validation.valid) {
    validation.errors.forEach(err => {
      if (err.includes('producto')) {
        const el = document.getElementById('producto-error');
        if (el) { el.textContent = err; el.style.display = 'block'; }
      } else if (err.includes('cantidad')) {
        const el = document.getElementById('cantidad-error');
        if (el) { el.textContent = err; el.style.display = 'block'; }
      } else if (err.includes('precio')) {
        const el = document.getElementById('precio-error');
        if (el) { el.textContent = err; el.style.display = 'block'; }
      }
    });
    return;
  }

  // Parse fecha to a Date object for Firestore
  const fechaDate = fecha ? new Date(fecha + 'T12:00:00') : new Date();

  const data = {
    producto,
    categoria,
    proveedor,
    cantidad,
    precioUnitario,
    fecha: { seconds: Math.floor(fechaDate.getTime() / 1000) },
  };

  try {
    if (supplyId) {
      await update(supplyId, data);
      showToast('Suministro actualizado correctamente', 'success');
    } else {
      await create(data);
      showToast('Suministro creado correctamente', 'success');
    }
    Router.navigate('#/suministros');
  } catch (error) {
    console.error('Error saving supply:', error);
    showToast(error.message || 'Error al guardar suministro', 'error');
  }
}

// --- Export Module ---

export const Supplies = {
  DEFAULT_CATEGORIES,
  validate,
  calculateTotal,
  create,
  getAll,
  getById,
  update,
  remove,
  getCategories,
  addCustomCategory,
  getByCategory,
  getTotalByCategory,
  getByPeriod,
  getTotalByPeriod,
  getCountByPeriod,
  renderSupplyList,
  renderSupplyForm,
};

export default Supplies;
