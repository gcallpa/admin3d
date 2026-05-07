/**
 * Módulo Calculadora de Costos
 * Cálculo de costos con fórmula definida y persistencia en Firestore
 */

import {
  collection,
  addDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db } from './firebase-config.js';
import { formatCurrency, showToast } from './utils.js';

// --- Tipos de pieza predefinidos ---
const DEFAULT_TYPES = ['Medallas', 'Trofeos', 'Galvanos', 'Llaveros', 'Porta celulares'];

// --- Data Functions ---

/**
 * Calculates the costo propio: (gramos × 16) + extra
 * @param {number} gramos - Weight in grams
 * @param {number} extra - Extra cost
 * @returns {number}
 */
export function getCostoPropio(gramos, extra) {
  return (gramos * 16) + extra;
}

/**
 * Calculates the precio cliente: costoPropio × 1.10
 * @param {number} costoPropio - Own cost
 * @returns {number}
 */
export function getPrecioCliente(costoPropio) {
  return Math.round(costoPropio * 1.10 * 100) / 100;
}

/**
 * Calculates both costo propio and precio cliente.
 * @param {number} gramos - Weight in grams
 * @param {number} [extra=0] - Extra cost (defaults to 0)
 * @returns {{ costoPropio: number, precioCliente: number }}
 */
export function calculate(gramos, extra = 0) {
  const costoPropio = getCostoPropio(gramos, extra);
  const precioCliente = getPrecioCliente(costoPropio);
  return { costoPropio, precioCliente };
}

/**
 * Validates calculator inputs.
 * @param {number} gramos - Weight in grams
 * @param {number} extra - Extra cost
 * @returns {{ valid: boolean, error: string }}
 */
export function validate(gramos, extra) {
  if (gramos <= 0) {
    return { valid: false, error: 'Los gramos deben ser mayores a cero' };
  }
  return { valid: true, error: '' };
}

/**
 * Saves a calculation to the historialCostos collection in Firestore.
 * @param {string} tipoPieza - Type of piece
 * @param {number} gramos - Weight in grams
 * @param {number} extra - Extra cost
 * @param {number} costoPropio - Own cost
 * @param {number} precioCliente - Client price
 * @returns {Promise<{ id: string }>}
 */
export async function saveToHistory(tipoPieza, gramos, extra, costoPropio, precioCliente) {
  const docData = {
    tipoPieza,
    gramos,
    extra,
    costoPropio,
    precioCliente,
    fecha: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, 'historialCostos'), docData);
  return { id: docRef.id };
}

// --- Render Functions ---

/**
 * Renders the calculator view.
 * @returns {string} HTML string for the calculator view
 */
export function renderCalculator() {
  const typeOptions = DEFAULT_TYPES.map(t => `<option value="${t}">${t}</option>`).join('');

  return `
    <div class="view-container">
      <h1>Calculadora de Costos</h1>
      <div class="card">
        <div class="card-body">
          <form id="calculator-form">
            <div class="form-group">
              <label class="form-label" for="calc-gramos">Gramos *</label>
              <input type="number" id="calc-gramos" class="form-input" placeholder="Ingrese gramos" min="1" step="any" required>
            </div>
            <div class="form-group">
              <label class="form-label" for="calc-extra">Extra (opcional)</label>
              <input type="number" id="calc-extra" class="form-input" placeholder="0" step="any">
            </div>
            <div id="calc-error" class="form-error" style="display:none;"></div>
            <button type="submit" class="btn btn-primary">Calcular</button>
          </form>

          <div id="calc-results" class="card" style="margin-top: var(--space-lg); display: none;">
            <div class="card-header">
              <h2 class="card-title">Resultado</h2>
            </div>
            <div class="card-body">
              <p><strong>Costo Propio:</strong> <span id="calc-costo-propio"></span></p>
              <p><strong>Precio Cliente:</strong> <span id="calc-precio-cliente"></span></p>
            </div>
          </div>

          <div id="calc-save-section" style="margin-top: var(--space-lg); display: none;">
            <h3>Guardar en Historial</h3>
            <form id="calc-save-form" style="margin-top: var(--space-sm);">
              <div class="form-group">
                <label class="form-label" for="calc-tipo-pieza">Tipo de Pieza</label>
                <select id="calc-tipo-pieza" class="form-input">
                  ${typeOptions}
                  <option value="__custom__">Otro (personalizado)</option>
                </select>
              </div>
              <div class="form-group" id="calc-custom-type-group" style="display: none;">
                <label class="form-label" for="calc-custom-type">Tipo personalizado</label>
                <input type="text" id="calc-custom-type" class="form-input" placeholder="Nombre del tipo">
              </div>
              <button type="submit" class="btn btn-secondary">Guardar en Historial</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Attaches event handlers for the calculator view.
 * Should be called after renderCalculator HTML is inserted into the DOM.
 */
export function attachCalculatorHandlers() {
  const form = document.getElementById('calculator-form');
  const saveForm = document.getElementById('calc-save-form');
  const tipoPiezaSelect = document.getElementById('calc-tipo-pieza');

  let lastResult = null;
  let lastGramos = null;
  let lastExtra = null;

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const gramosInput = document.getElementById('calc-gramos');
      const extraInput = document.getElementById('calc-extra');
      const errorEl = document.getElementById('calc-error');
      const resultsEl = document.getElementById('calc-results');
      const saveSection = document.getElementById('calc-save-section');

      const gramos = Number(gramosInput.value);
      const extra = extraInput.value === '' ? 0 : Number(extraInput.value);

      // Clear previous error
      errorEl.style.display = 'none';
      errorEl.textContent = '';

      // Validate
      const validation = validate(gramos, extra);
      if (!validation.valid) {
        errorEl.textContent = validation.error;
        errorEl.style.display = 'block';
        resultsEl.style.display = 'none';
        saveSection.style.display = 'none';
        lastResult = null;
        return;
      }

      // Calculate
      const result = calculate(gramos, extra);
      lastResult = result;
      lastGramos = gramos;
      lastExtra = extra;

      // Display results
      document.getElementById('calc-costo-propio').textContent = formatCurrency(result.costoPropio);
      document.getElementById('calc-precio-cliente').textContent = formatCurrency(result.precioCliente);
      resultsEl.style.display = 'block';
      saveSection.style.display = 'block';
    });
  }

  if (tipoPiezaSelect) {
    tipoPiezaSelect.addEventListener('change', () => {
      const customGroup = document.getElementById('calc-custom-type-group');
      if (tipoPiezaSelect.value === '__custom__') {
        customGroup.style.display = 'block';
      } else {
        customGroup.style.display = 'none';
      }
    });
  }

  if (saveForm) {
    saveForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!lastResult) return;

      let tipoPieza = tipoPiezaSelect.value;
      if (tipoPieza === '__custom__') {
        const customInput = document.getElementById('calc-custom-type');
        tipoPieza = customInput.value.trim();
        if (!tipoPieza) {
          showToast('Ingrese un nombre para el tipo de pieza', 'error');
          return;
        }
      }

      try {
        await saveToHistory(tipoPieza, lastGramos, lastExtra, lastResult.costoPropio, lastResult.precioCliente);
        showToast('Guardado en historial correctamente', 'success');
      } catch (error) {
        showToast('Error al guardar en historial', 'error');
      }
    });
  }
}

// Export the module
export const Calculator = {
  getCostoPropio,
  getPrecioCliente,
  calculate,
  validate,
  saveToHistory,
  renderCalculator,
  attachCalculatorHandlers,
};

export default Calculator;
