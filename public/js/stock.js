/**
 * Módulo de Gestión de Stock/Inventario
 * Tracking de filamentos y accesorios disponibles
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
import { formatDate, showToast } from './utils.js';
import { Router } from './app.js';

// --- Constants ---

/**
 * Categorías predefinidas de stock.
 */
export const STOCK_CATEGORIES = ['Filamentos', 'Accesorios'];

/**
 * Tipos de filamento disponibles.
 */
export const FILAMENT_TYPES = ['PLA', 'ABS', 'PETG', 'TPU', 'Resina'];

/**
 * Colores de filamento disponibles.
 */
export const FILAMENT_COLORS = ['Blanco', 'Negro', 'Rojo', 'Azul', 'Verde', 'Amarillo', 'Gris', 'Transparente', 'Otro'];

// --- Validation ---

/**
 * Valida los datos de un item de stock.
 * @param {Object} data
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validate(data) {
  const errors = [];
  if (!data || !data.nombre || data.nombre.trim() === '') {
    errors.push('El nombre es obligatorio');
  }
  if (!data || !data.categoria || !STOCK_CATEGORIES.includes(data.categoria)) {
    errors.push('La categoría debe ser Filamentos o Accesorios');
  }
  if (!data || data.cantidadDisponible === undefined || data.cantidadDisponible === null || data.cantidadDisponible < 0) {
    errors.push('La cantidad disponible debe ser mayor o igual a cero');
  }
  if (!data || !data.umbralBajo || data.umbralBajo < 0) {
    errors.push('El umbral bajo debe ser mayor o igual a cero');
  }
  return { valid: errors.length === 0, errors };
}

// --- CRUD Functions ---

/**
 * Crea un nuevo item de stock en Firestore.
 * @param {Object} data
 * @returns {Promise<{ id: string }>}
 */
export async function create(data) {
  const validation = validate(data);
  if (!validation.valid) {
    throw new Error(validation.errors[0]);
  }

  const docData = {
    nombre: data.nombre.trim(),
    categoria: data.categoria,
    tipo: data.tipo || '',
    color: data.color || '',
    marca: data.marca || '',
    cantidadDisponible: Number(data.cantidadDisponible) || 0,
    unidad: data.categoria === 'Filamentos' ? 'gramos' : 'unidades',
    umbralBajo: Number(data.umbralBajo) || 0,
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, 'stock'), docData);
  return { id: docRef.id };
}

/**
 * Lista todos los items de stock.
 * @returns {Promise<Array>}
 */
export async function getAll() {
  const q = query(collection(db, 'stock'), orderBy('nombre', 'asc'));
  const snapshot = await getDocs(q);
  const items = [];
  snapshot.forEach((docSnap) => {
    items.push({ id: docSnap.id, ...docSnap.data() });
  });
  return items;
}

/**
 * Obtiene un item de stock por su ID.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getById(id) {
  const docRef = doc(db, 'stock', id);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) {
    return null;
  }
  return { id: docSnap.id, ...docSnap.data() };
}

/**
 * Actualiza un item de stock existente.
 * @param {string} id
 * @param {Object} data
 * @returns {Promise<void>}
 */
export async function update(id, data) {
  const validation = validate(data);
  if (!validation.valid) {
    throw new Error(validation.errors[0]);
  }

  const updateData = {
    nombre: data.nombre.trim(),
    categoria: data.categoria,
    tipo: data.tipo || '',
    color: data.color || '',
    marca: data.marca || '',
    cantidadDisponible: Number(data.cantidadDisponible) || 0,
    unidad: data.categoria === 'Filamentos' ? 'gramos' : 'unidades',
    umbralBajo: Number(data.umbralBajo) || 0,
    actualizadoEn: serverTimestamp(),
  };

  const docRef = doc(db, 'stock', id);
  await updateDoc(docRef, updateData);
}

/**
 * Elimina un item de stock.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function remove(id) {
  const docRef = doc(db, 'stock', id);
  await deleteDoc(docRef);
}

/**
 * Agrega cantidad al stock de un item.
 * @param {string} id
 * @param {number} cantidad - Cantidad a agregar (debe ser > 0)
 * @returns {Promise<void>}
 */
export async function addStock(id, cantidad) {
  if (!cantidad || cantidad <= 0) {
    throw new Error('La cantidad a agregar debe ser mayor a cero');
  }
  const item = await getById(id);
  if (!item) {
    throw new Error('Item no encontrado');
  }
  const nuevaCantidad = (item.cantidadDisponible || 0) + cantidad;
  const docRef = doc(db, 'stock', id);
  await updateDoc(docRef, {
    cantidadDisponible: nuevaCantidad,
    actualizadoEn: serverTimestamp(),
  });
}

/**
 * Resta cantidad del stock de un item (no baja de 0).
 * @param {string} id
 * @param {number} cantidad - Cantidad a restar (debe ser > 0)
 * @returns {Promise<void>}
 */
export async function subtractStock(id, cantidad) {
  if (!cantidad || cantidad <= 0) {
    throw new Error('La cantidad a restar debe ser mayor a cero');
  }
  const item = await getById(id);
  if (!item) {
    throw new Error('Item no encontrado');
  }
  const nuevaCantidad = Math.max(0, (item.cantidadDisponible || 0) - cantidad);
  const docRef = doc(db, 'stock', id);
  await updateDoc(docRef, {
    cantidadDisponible: nuevaCantidad,
    actualizadoEn: serverTimestamp(),
  });
}

/**
 * Retorna items con stock bajo (cantidadDisponible <= umbralBajo).
 * @returns {Promise<Array>}
 */
export async function getLowStock() {
  const all = await getAll();
  return all.filter(item => item.cantidadDisponible <= item.umbralBajo);
}

/**
 * Filtra items de stock por categoría.
 * @param {string} categoria
 * @returns {Promise<Array>}
 */
export async function getByCategory(categoria) {
  const q = query(
    collection(db, 'stock'),
    where('categoria', '==', categoria)
  );
  const snapshot = await getDocs(q);
  const items = [];
  snapshot.forEach((docSnap) => {
    items.push({ id: docSnap.id, ...docSnap.data() });
  });
  return items;
}

// --- Render Helpers ---

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
 * Returns the stock status badge HTML.
 * @param {number} cantidad
 * @param {number} umbral
 * @returns {string}
 */
function getStockBadge(cantidad, umbral) {
  if (cantidad === 0) {
    return '<span class="badge badge-pedido" style="background: var(--color-danger, #e53e3e); color: #fff;">Sin stock</span>';
  }
  if (cantidad <= umbral) {
    return '<span class="badge badge-trabajando">Stock bajo</span>';
  }
  return '<span class="badge badge-terminado">OK</span>';
}

// --- Render Functions ---

/**
 * Renders the stock list view with filters and inline adjustments.
 */
export async function renderStockList() {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `<div class="loading"><div class="loading-spinner"></div> Cargando stock...</div>`;

  try {
    const allItems = await getAll();

    let categoryOptions = `<option value="">Todos</option>`;
    STOCK_CATEGORIES.forEach(cat => {
      categoryOptions += `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`;
    });

    const html = `
      <div class="page-header">
        <h1 class="page-title">Stock</h1>
        <a href="#/stock/nuevo" class="btn btn-primary">Nuevo Item</a>
      </div>
      <div class="filter-bar" style="display: flex; gap: var(--space-md); flex-wrap: wrap; margin-bottom: var(--space-lg);">
        <select id="stock-category-filter" class="form-select" style="width: auto; min-width: 160px;">
          ${categoryOptions}
        </select>
      </div>
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Categoría</th>
              <th>Tipo</th>
              <th>Color</th>
              <th>Cantidad</th>
              <th>Unidad</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody id="stock-tbody">
            ${renderStockRows(allItems)}
          </tbody>
        </table>
      </div>
    `;

    app.innerHTML = html;

    // Attach filter handler
    const categoryFilter = document.getElementById('stock-category-filter');

    function applyFilters() {
      const category = categoryFilter.value;
      let filtered = allItems;
      if (category) {
        filtered = allItems.filter(item => item.categoria === category);
      }
      document.getElementById('stock-tbody').innerHTML = renderStockRows(filtered);
      attachStockHandlers();
    }

    if (categoryFilter) categoryFilter.addEventListener('change', applyFilters);

    attachStockHandlers();

    function attachStockHandlers() {
      // Delete buttons
      const deleteButtons = document.querySelectorAll('.btn-delete-stock');
      deleteButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (window.confirm('¿Estás seguro de eliminar este item?')) {
            try {
              await remove(id);
              showToast('Item eliminado', 'success');
              renderStockList();
            } catch (error) {
              showToast('Error al eliminar item', 'error');
            }
          }
        });
      });

      // Add stock buttons
      const addButtons = document.querySelectorAll('.btn-add-stock');
      addButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const input = document.getElementById(`stock-adjust-${id}`);
          const cantidad = Number(input ? input.value : 0);
          if (cantidad > 0) {
            try {
              await addStock(id, cantidad);
              showToast('Stock actualizado', 'success');
              // Small delay to let Firestore propagate
              setTimeout(() => renderStockList(), 500);
            } catch (error) {
              showToast('Error al actualizar stock', 'error');
            }
          }
        });
      });

      // Subtract stock buttons
      const subButtons = document.querySelectorAll('.btn-sub-stock');
      subButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const input = document.getElementById(`stock-adjust-${id}`);
          const cantidad = Number(input ? input.value : 0);
          if (cantidad > 0) {
            try {
              await subtractStock(id, cantidad);
              showToast('Stock actualizado', 'success');
              // Small delay to let Firestore propagate
              setTimeout(() => renderStockList(), 500);
            } catch (error) {
              showToast('Error al actualizar stock', 'error');
            }
          }
        });
      });
    }
  } catch (error) {
    console.error('Error loading stock:', error);
    app.innerHTML = `<div class="empty-state"><p class="empty-state-text">Error al cargar stock</p></div>`;
    showToast('Error al cargar stock', 'error');
  }
}

/**
 * Renders table rows for stock items.
 * @param {Array} items
 * @returns {string}
 */
function renderStockRows(items) {
  if (items.length === 0) {
    return `<tr><td colspan="8" style="text-align: center;">No hay items de stock</td></tr>`;
  }
  return items.map(item => {
    const isLow = item.cantidadDisponible <= item.umbralBajo;
    const rowStyle = item.cantidadDisponible === 0
      ? 'background: rgba(229, 62, 62, 0.08);'
      : isLow
        ? 'background: rgba(237, 137, 54, 0.08);'
        : '';
    return `
    <tr style="${rowStyle}">
      <td>${escapeHtml(item.nombre)}</td>
      <td>${escapeHtml(item.categoria)}</td>
      <td>${escapeHtml(item.tipo || '—')}</td>
      <td>${escapeHtml(item.color || '—')}</td>
      <td>${item.cantidadDisponible || 0}</td>
      <td>${escapeHtml(item.unidad || '—')}</td>
      <td>${getStockBadge(item.cantidadDisponible || 0, item.umbralBajo || 0)}</td>
      <td>
        <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
          <input type="number" id="stock-adjust-${item.id}" class="form-input" style="width: 60px; padding: 2px 4px;" min="1" value="1">
          <button class="btn btn-sm btn-ghost btn-add-stock" data-id="${item.id}" title="Agregar">+</button>
          <button class="btn btn-sm btn-ghost btn-sub-stock" data-id="${item.id}" title="Restar">−</button>
          <a href="#/stock/${item.id}/editar" class="btn btn-sm btn-ghost">Editar</a>
          <button class="btn btn-sm btn-ghost btn-delete-stock" data-id="${item.id}" style="color: var(--color-danger);">Eliminar</button>
        </div>
      </td>
    </tr>
  `;
  }).join('');
}

/**
 * Renders the stock create/edit form.
 * @param {{ id?: string }} [params] - If id is present, it's edit mode
 */
export async function renderStockForm(params = {}) {
  const app = document.getElementById('app');
  if (!app) return;

  const isEdit = !!params.id;
  let item = null;

  app.innerHTML = `<div class="loading"><div class="loading-spinner"></div> Cargando...</div>`;

  try {
    if (isEdit) {
      item = await getById(params.id);
      if (!item) {
        showToast('Item no encontrado', 'error');
        Router.navigate('#/stock');
        return;
      }
    }

    const selectedCategory = item ? item.categoria : 'Filamentos';

    // Build category options
    const categoryOptions = STOCK_CATEGORIES.map(cat => {
      const selected = selectedCategory === cat ? 'selected' : '';
      return `<option value="${escapeHtml(cat)}" ${selected}>${escapeHtml(cat)}</option>`;
    }).join('');

    // Build filament type options
    const tipoOptions = FILAMENT_TYPES.map(tipo => {
      const selected = item && item.tipo === tipo ? 'selected' : '';
      return `<option value="${escapeHtml(tipo)}" ${selected}>${escapeHtml(tipo)}</option>`;
    }).join('');

    // Build color options
    const colorSuggestions = FILAMENT_COLORS.map(color =>
      `<option value="${escapeHtml(color)}">`
    ).join('');

    const showFilament = selectedCategory === 'Filamentos';

    const html = `
      <div class="page-header">
        <h1 class="page-title">${isEdit ? 'Editar Item de Stock' : 'Nuevo Item de Stock'}</h1>
      </div>
      <div class="card">
        <form id="stock-form">
          <div class="form-group">
            <label class="form-label" for="stock-categoria">Categoría *</label>
            <select id="stock-categoria" class="form-select">
              ${categoryOptions}
            </select>
          </div>
          <div id="filament-fields" style="display: ${showFilament ? 'block' : 'none'};">
            <div class="form-group">
              <label class="form-label" for="stock-tipo">Tipo de filamento *</label>
              <select id="stock-tipo" class="form-select">
                ${tipoOptions}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="stock-color">Color *</label>
              <input type="text" id="stock-color" class="form-input" placeholder="Escribe el color" list="color-suggestions" value="${item ? escapeHtml(item.color || '') : ''}">
              <datalist id="color-suggestions">
                ${colorSuggestions}
              </datalist>
            </div>
            <div class="form-group">
              <label class="form-label" for="stock-marca">Marca</label>
              <input type="text" id="stock-marca" class="form-input" placeholder="Marca del filamento" value="${item ? escapeHtml(item.marca || '') : ''}">
            </div>
          </div>
          <div id="accessory-fields" style="display: ${showFilament ? 'none' : 'block'};">
            <div class="form-group">
              <label class="form-label" for="stock-nombre-acc">Nombre *</label>
              <input type="text" id="stock-nombre-acc" class="form-input" placeholder="Ej: Cintas para medalla" value="${item && item.categoria === 'Accesorios' ? escapeHtml(item.nombre || '') : ''}">
            </div>
            <div class="form-group">
              <label class="form-label" for="stock-tipo-acc">Tipo</label>
              <input type="text" id="stock-tipo-acc" class="form-input" placeholder="Tipo de accesorio" value="${item && item.categoria === 'Accesorios' ? escapeHtml(item.tipo || '') : ''}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="stock-nombre">Nombre (auto-generado para filamentos)</label>
            <input type="text" id="stock-nombre" class="form-input" placeholder="Nombre del item" value="${item ? escapeHtml(item.nombre || '') : ''}" ${showFilament ? 'readonly' : ''}>
          </div>
          <div class="form-group">
            <label class="form-label" for="stock-cantidad">Cantidad disponible *</label>
            <input type="number" id="stock-cantidad" class="form-input" placeholder="${showFilament ? 'Gramos' : 'Unidades'}" min="0" step="1" value="${item ? (item.cantidadDisponible || 0) : 0}">
            <small style="color: var(--color-text-muted);" id="stock-unidad-hint">${showFilament ? 'En gramos' : 'En unidades'}</small>
          </div>
          <div class="form-group">
            <label class="form-label" for="stock-umbral">Umbral de stock bajo *</label>
            <input type="number" id="stock-umbral" class="form-input" placeholder="Cantidad mínima antes de alerta" min="0" step="1" value="${item ? (item.umbralBajo || 0) : 100}">
          </div>
          <div id="stock-form-error" class="form-error" style="display:none;"></div>
          <div class="card-footer">
            <a href="#/stock" class="btn btn-ghost">Cancelar</a>
            <button type="submit" class="btn btn-primary">${isEdit ? 'Guardar Cambios' : 'Crear Item'}</button>
          </div>
        </form>
      </div>
    `;

    app.innerHTML = html;

    // Dynamic fields based on category
    const categoriaSelect = document.getElementById('stock-categoria');
    const filamentFields = document.getElementById('filament-fields');
    const accessoryFields = document.getElementById('accessory-fields');
    const nombreInput = document.getElementById('stock-nombre');
    const unidadHint = document.getElementById('stock-unidad-hint');
    const cantidadInput = document.getElementById('stock-cantidad');

    function toggleFields() {
      const cat = categoriaSelect.value;
      if (cat === 'Filamentos') {
        filamentFields.style.display = 'block';
        accessoryFields.style.display = 'none';
        nombreInput.readOnly = true;
        unidadHint.textContent = 'En gramos';
        cantidadInput.placeholder = 'Gramos';
        updateFilamentName();
      } else {
        filamentFields.style.display = 'none';
        accessoryFields.style.display = 'block';
        nombreInput.readOnly = false;
        unidadHint.textContent = 'En unidades';
        cantidadInput.placeholder = 'Unidades';
      }
    }

    function updateFilamentName() {
      if (categoriaSelect.value === 'Filamentos') {
        const tipo = document.getElementById('stock-tipo').value;
        const color = document.getElementById('stock-color').value;
        const marca = document.getElementById('stock-marca').value.trim();
        nombreInput.value = marca ? `${tipo} ${color} - ${marca}` : `${tipo} ${color}`;
      }
    }

    function updateAccessoryName() {
      if (categoriaSelect.value === 'Accesorios') {
        const nombreAcc = document.getElementById('stock-nombre-acc').value;
        nombreInput.value = nombreAcc;
      }
    }

    categoriaSelect.addEventListener('change', toggleFields);

    const tipoSelect = document.getElementById('stock-tipo');
    const colorInput = document.getElementById('stock-color');
    const marcaInput = document.getElementById('stock-marca');
    const nombreAccInput = document.getElementById('stock-nombre-acc');

    if (tipoSelect) tipoSelect.addEventListener('change', updateFilamentName);
    if (colorInput) colorInput.addEventListener('input', updateFilamentName);
    if (marcaInput) marcaInput.addEventListener('input', updateFilamentName);
    if (nombreAccInput) nombreAccInput.addEventListener('input', updateAccessoryName);

    // Auto-generate name on load for new filament items
    if (!isEdit && selectedCategory === 'Filamentos') {
      updateFilamentName();
    }

    // Form submit
    const form = document.getElementById('stock-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleStockFormSubmit(isEdit ? params.id : null);
    });
  } catch (error) {
    console.error('Error loading stock form:', error);
    app.innerHTML = `<div class="empty-state"><p class="empty-state-text">Error al cargar formulario</p></div>`;
    showToast('Error al cargar formulario', 'error');
  }
}

/**
 * Handles stock form submission (create or update).
 * @param {string|null} itemId
 */
async function handleStockFormSubmit(itemId) {
  const categoria = document.getElementById('stock-categoria').value;
  const nombre = document.getElementById('stock-nombre').value;
  const cantidad = Number(document.getElementById('stock-cantidad').value);
  const umbral = Number(document.getElementById('stock-umbral').value);

  let tipo = '';
  let color = '';
  let marca = '';

  if (categoria === 'Filamentos') {
    tipo = document.getElementById('stock-tipo').value;
    color = document.getElementById('stock-color').value;
    marca = document.getElementById('stock-marca').value.trim();
  } else {
    tipo = document.getElementById('stock-tipo-acc').value.trim();
  }

  const errorEl = document.getElementById('stock-form-error');

  const data = {
    nombre,
    categoria,
    tipo,
    color,
    marca,
    cantidadDisponible: cantidad,
    umbralBajo: umbral,
  };

  const validation = validate(data);
  if (!validation.valid) {
    if (errorEl) {
      errorEl.textContent = validation.errors[0];
      errorEl.style.display = 'block';
    }
    return;
  }

  try {
    if (itemId) {
      await update(itemId, data);
      showToast('Item actualizado correctamente', 'success');
    } else {
      await create(data);
      showToast('Item creado correctamente', 'success');
    }
    Router.navigate('#/stock');
  } catch (error) {
    console.error('Error saving stock item:', error);
    if (errorEl) {
      errorEl.textContent = error.message || 'Error al guardar item';
      errorEl.style.display = 'block';
    }
    showToast(error.message || 'Error al guardar item', 'error');
  }
}

// --- Export Module ---

export const Stock = {
  STOCK_CATEGORIES,
  FILAMENT_TYPES,
  FILAMENT_COLORS,
  validate,
  create,
  getAll,
  getById,
  update,
  remove,
  addStock,
  subtractStock,
  getLowStock,
  getByCategory,
  renderStockList,
  renderStockForm,
};

export default Stock;
