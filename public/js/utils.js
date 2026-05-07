/**
 * Utilidades compartidas para Admin Impresión 3D
 */

/**
 * Formatea un timestamp de Firestore a fecha legible.
 * @param {Object|Date|{seconds: number}} timestamp - Timestamp de Firestore o Date
 * @returns {string} Fecha formateada (ej: "15/03/2024 14:30")
 */
export function formatDate(timestamp) {
  if (!timestamp) return '—';

  let date;
  if (timestamp instanceof Date) {
    date = timestamp;
  } else if (timestamp.seconds !== undefined) {
    date = new Date(timestamp.seconds * 1000);
  } else if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    date = timestamp.toDate();
  } else {
    date = new Date(timestamp);
  }

  if (isNaN(date.getTime())) return '—';

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Formatea un número a moneda CLP.
 * @param {number} amount - Monto a formatear
 * @returns {string} Monto formateado (ej: "$1.600")
 */
export function formatCurrency(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '$0';

  const rounded = Math.round(amount);
  const formatted = Math.abs(rounded).toLocaleString('es-CL');
  return rounded < 0 ? `-$${formatted}` : `$${formatted}`;
}

/**
 * Muestra una notificación toast.
 * @param {string} message - Mensaje a mostrar
 * @param {'success'|'error'|'warning'|'info'} type - Tipo de notificación
 */
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'alert');
  toast.textContent = message;

  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('toast-visible');
  });

  // Auto-dismiss after 4 seconds
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    toast.addEventListener('transitionend', () => {
      toast.remove();
    }, { once: true });
    // Fallback removal if transitionend doesn't fire
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 300);
  }, 4000);
}

/**
 * Genera un ID único simple.
 * @returns {string} ID único
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
}

/**
 * Crea una función debounced.
 * @param {Function} fn - Función a ejecutar
 * @param {number} delay - Retraso en milisegundos
 * @returns {Function} Función debounced
 */
export function debounce(fn, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}
