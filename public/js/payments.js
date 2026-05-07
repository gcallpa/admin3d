/**
 * Módulo de Gestión de Pagos
 * Abonos parciales y estado de pago con persistencia en Firestore
 */

import {
  collection,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db } from './firebase-config.js';
import { getById as getOrderById } from './orders.js';
import { formatDate, formatCurrency, showToast } from './utils.js';

// --- Data Functions ---

/**
 * Validates a payment amount against the pending balance.
 * @param {number} monto - Payment amount
 * @param {number} saldoPendiente - Pending balance
 * @returns {{ valid: boolean, error: string }}
 */
export function validate(monto, saldoPendiente) {
  if (monto <= 0) {
    return { valid: false, error: 'El monto debe ser mayor a cero' };
  }
  if (monto > saldoPendiente) {
    return { valid: false, error: `El monto excede el saldo pendiente de ${formatCurrency(saldoPendiente)} CLP` };
  }
  return { valid: true, error: '' };
}

/**
 * Lists all payments for a given order.
 * @param {string} orderId
 * @returns {Promise<Array<{ id: string, ordenId: string, monto: number, fecha: any, creadoEn: any }>>}
 */
export async function getByOrder(orderId) {
  const q = query(
    collection(db, 'pagos'),
    where('ordenId', '==', orderId),
    orderBy('fecha', 'asc')
  );
  const snapshot = await getDocs(q);
  const payments = [];
  snapshot.forEach((docSnap) => {
    payments.push({ id: docSnap.id, ...docSnap.data() });
  });
  return payments;
}

/**
 * Calculates the total paid for an order.
 * @param {string} orderId
 * @returns {Promise<number>}
 */
export async function getTotalPaid(orderId) {
  const payments = await getByOrder(orderId);
  return payments.reduce((sum, p) => sum + (p.monto || 0), 0);
}

/**
 * Calculates the pending balance for an order.
 * @param {string} orderId
 * @returns {Promise<number>}
 */
export async function getBalance(orderId) {
  const order = await getOrderById(orderId);
  if (!order) {
    throw new Error('Orden no encontrada');
  }
  const totalPaid = await getTotalPaid(orderId);
  return (order.precioCliente || 0) - totalPaid;
}

/**
 * Gets the payment status for an order.
 * @param {string} orderId
 * @returns {Promise<'pagado'|'pendiente'>}
 */
export async function getPaymentStatus(orderId) {
  const balance = await getBalance(orderId);
  return balance <= 0 ? 'pagado' : 'pendiente';
}

/**
 * Registers a new payment for an order.
 * Validates that monto > 0 and monto <= pending balance before saving.
 * @param {string} orderId
 * @param {number} monto
 * @returns {Promise<{ id: string }>}
 */
export async function addPayment(orderId, monto) {
  const balance = await getBalance(orderId);
  const validation = validate(monto, balance);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const docData = {
    ordenId: orderId,
    monto,
    fecha: serverTimestamp(),
    creadoEn: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, 'pagos'), docData);
  return { id: docRef.id };
}

// --- Render Functions ---

/**
 * Renders the payments section within the order detail view.
 * @param {Object} order - The order object (with precioCliente)
 * @param {string} orderId - The order ID
 * @returns {Promise<string>} HTML string for the payments section
 */
export async function renderPaymentsSection(order, orderId) {
  const payments = await getByOrder(orderId);
  const totalPaid = payments.reduce((sum, p) => sum + (p.monto || 0), 0);
  const saldoPendiente = (order.precioCliente || 0) - totalPaid;
  const status = saldoPendiente <= 0 ? 'pagado' : 'pendiente';

  let html = `
    <div class="card" style="margin-top: var(--space-lg);">
      <div class="card-header">
        <h2 class="card-title">Pagos</h2>
        <span class="badge badge-${status}">${status}</span>
      </div>
      <div class="card-body">
        <p><strong>Valor Cobrado:</strong> ${formatCurrency(order.precioCliente || 0)}</p>
        <p><strong>Total Abonado:</strong> <span style="color: var(--color-success);">${formatCurrency(totalPaid)}</span></p>
        <p><strong>Saldo Pendiente:</strong> <span style="color: ${saldoPendiente > 0 ? 'var(--color-warning)' : 'var(--color-success)'}; font-weight: var(--font-weight-bold);">${formatCurrency(saldoPendiente)}</span></p>
  `;

  // Payments list
  if (payments.length > 0) {
    html += `
        <div class="table-container" style="margin-top: var(--space-md);">
          <table class="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Monto</th>
              </tr>
            </thead>
            <tbody>
              ${payments.map(p => `
                <tr>
                  <td>${formatDate(p.fecha)}</td>
                  <td>${formatCurrency(p.monto)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
    `;
  } else {
    html += `<p class="form-hint" style="margin-top: var(--space-md);">No hay abonos registrados.</p>`;
  }

  // Add payment form (only if there's a pending balance)
  if (saldoPendiente > 0) {
    html += `
        <div style="margin-top: var(--space-lg);">
          <h3>Registrar Abono</h3>
          <form id="payment-form" style="display: flex; gap: var(--space-sm); align-items: flex-end; flex-wrap: wrap; margin-top: var(--space-sm);">
            <div class="form-group" style="margin-bottom: 0; flex: 1; min-width: 150px;">
              <label class="form-label" for="payment-monto">Monto</label>
              <input type="number" id="payment-monto" class="form-input" placeholder="Monto del abono" min="1" max="${saldoPendiente}" step="any" required>
            </div>
            <button type="submit" class="btn btn-primary">Registrar Abono</button>
          </form>
          <div id="payment-error" class="form-error" style="display:none; margin-top: var(--space-sm);"></div>
        </div>
    `;
  }

  html += `
      </div>
    </div>
  `;

  return html;
}

/**
 * Attaches the payment form event handler.
 * Should be called after the payments section HTML is inserted into the DOM.
 * @param {string} orderId
 * @param {Function} onSuccess - Callback to refresh the view after successful payment
 */
export function attachPaymentFormHandler(orderId, onSuccess) {
  const form = document.getElementById('payment-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const montoInput = document.getElementById('payment-monto');
    const errorEl = document.getElementById('payment-error');
    const monto = Number(montoInput.value);

    // Clear previous error
    errorEl.style.display = 'none';
    errorEl.textContent = '';

    try {
      await addPayment(orderId, monto);
      showToast('Abono registrado correctamente', 'success');
      if (onSuccess) onSuccess();
    } catch (error) {
      errorEl.textContent = error.message;
      errorEl.style.display = 'block';
    }
  });
}

// Export the module
export const Payments = {
  validate,
  getByOrder,
  getTotalPaid,
  getBalance,
  getPaymentStatus,
  addPayment,
  renderPaymentsSection,
  attachPaymentFormHandler,
};

export default Payments;
