/**
 * Módulo de Balance Financiero
 * Cálculos de ingresos, gastos, balance y rentabilidad
 */

import {
  collection,
  getDocs,
  query,
  orderBy
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db } from './firebase-config.js';
import { getTotalByPeriod } from './supplies.js';
import { formatCurrency } from './utils.js';

// --- Helper ---

/**
 * Extrae un Date de un campo fecha de Firestore.
 * @param {any} fecha
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

// --- Financial Calculations ---

/**
 * Calcula los ingresos del período sumando precioCliente de órdenes entregadas.
 * @param {number} year
 * @param {number} [month] - 0-11, si se omite calcula el año completo
 * @returns {Promise<number>}
 */
export async function getIncomeByPeriod(year, month) {
  const q = query(collection(db, 'ordenes'), orderBy('creadoEn', 'desc'));
  const snapshot = await getDocs(q);
  const orders = [];
  snapshot.forEach((docSnap) => {
    orders.push({ id: docSnap.id, ...docSnap.data() });
  });

  return orders
    .filter(o => o.estado === 'entregado' && isInPeriod(o.creadoEn, year, month))
    .reduce((sum, o) => sum + (o.precioCliente || 0), 0);
}

/**
 * Calcula los gastos del período sumando precioTotal de suministros.
 * Reutiliza getTotalByPeriod de supplies.js.
 * @param {number} year
 * @param {number} [month] - 0-11
 * @returns {Promise<number>}
 */
export async function getExpensesByPeriod(year, month) {
  return getTotalByPeriod(year, month);
}

/**
 * Calcula el balance del período (ingresos - gastos).
 * @param {number} year
 * @param {number} [month] - 0-11
 * @returns {Promise<number>}
 */
export async function getBalance(year, month) {
  const income = await getIncomeByPeriod(year, month);
  const expenses = await getExpensesByPeriod(year, month);
  return income - expenses;
}

/**
 * Calcula el porcentaje de rentabilidad.
 * @param {number} income - Ingresos totales del período
 * @param {number} expenses - Gastos totales del período
 * @returns {{ percentage: number|null, label: string }}
 */
export function getProfitability(income, expenses) {
  if (income <= 0) {
    return { percentage: null, label: 'Sin ingresos' };
  }
  const percentage = ((income - expenses) / income) * 100;
  return { percentage, label: `${percentage.toFixed(1)}%` };
}

/**
 * Retorna un resumen completo del balance del período.
 * @param {number} year
 * @param {number} [month] - 0-11
 * @returns {Promise<{ ingresos: number, gastos: number, balance: number, rentabilidad: { percentage: number|null, label: string } }>}
 */
export async function getBalanceSummary(year, month) {
  const ingresos = await getIncomeByPeriod(year, month);
  const gastos = await getExpensesByPeriod(year, month);
  const balance = ingresos - gastos;
  const rentabilidad = getProfitability(ingresos, gastos);
  return { ingresos, gastos, balance, rentabilidad };
}

// --- Render ---

/**
 * Renderiza la vista completa del panel de balance.
 */
export async function renderBalanceView() {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `<div class="loading"><div class="loading-spinner"></div> Cargando balance...</div>`;

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  try {
    const summary = await getBalanceSummary(currentYear, currentMonth);

    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    let monthOptions = '';
    for (let i = 0; i < 12; i++) {
      let m = currentMonth - i;
      let y = currentYear;
      if (m < 0) { m += 12; y--; }
      const selected = i === 0 ? 'selected' : '';
      monthOptions += `<option value="${y}-${m}" ${selected}>${monthNames[m]} ${y}</option>`;
    }

    const balanceColor = summary.balance >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
    const balanceIcon = summary.balance >= 0 ? '✅' : '❌';
    const balanceLabel = summary.balance >= 0 ? 'Ganancia' : 'Pérdida';

    const html = `
      <div class="page-header">
        <h1 class="page-title">Balance Financiero</h1>
        <select id="balance-period-filter" class="form-select" style="width: auto; min-width: 160px;">
          ${monthOptions}
        </select>
      </div>
      <div class="card-grid">
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">💰 Ingresos</h2>
          </div>
          <div class="card-body">
            <p id="balance-income" style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); color: var(--color-success);">${formatCurrency(summary.ingresos)}</p>
            <p>órdenes entregadas</p>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">🛒 Gastos</h2>
          </div>
          <div class="card-body">
            <p id="balance-expenses" style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); color: var(--color-warning);">${formatCurrency(summary.gastos)}</p>
            <p>en suministros</p>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">📊 Balance</h2>
          </div>
          <div class="card-body">
            <p id="balance-total" style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); color: ${balanceColor};">${formatCurrency(summary.balance)}</p>
            <p id="balance-label">${balanceIcon} ${balanceLabel}</p>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">📈 Rentabilidad</h2>
          </div>
          <div class="card-body">
            <p id="balance-profitability" style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); color: var(--color-primary);">${summary.rentabilidad.label}</p>
            <p>del período</p>
          </div>
        </div>
      </div>
    `;

    app.innerHTML = html;

    // Attach period filter handler
    const periodFilter = document.getElementById('balance-period-filter');
    if (periodFilter) {
      periodFilter.addEventListener('change', async () => {
        const [year, month] = periodFilter.value.split('-').map(Number);
        try {
          const newSummary = await getBalanceSummary(year, month);
          const newBalanceColor = newSummary.balance >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
          const newBalanceIcon = newSummary.balance >= 0 ? '✅' : '❌';
          const newBalanceLabel = newSummary.balance >= 0 ? 'Ganancia' : 'Pérdida';

          document.getElementById('balance-income').textContent = formatCurrency(newSummary.ingresos);
          document.getElementById('balance-expenses').textContent = formatCurrency(newSummary.gastos);

          const totalEl = document.getElementById('balance-total');
          totalEl.textContent = formatCurrency(newSummary.balance);
          totalEl.style.color = newBalanceColor;

          document.getElementById('balance-label').textContent = `${newBalanceIcon} ${newBalanceLabel}`;
          document.getElementById('balance-profitability').textContent = newSummary.rentabilidad.label;
        } catch (error) {
          console.error('Error updating balance:', error);
        }
      });
    }
  } catch (error) {
    console.error('Error loading balance:', error);
    app.innerHTML = `<div class="empty-state"><p class="empty-state-text">Error al cargar balance</p></div>`;
  }
}

// --- Export Module ---

export const Balance = {
  getIncomeByPeriod,
  getExpensesByPeriod,
  getBalance,
  getProfitability,
  getBalanceSummary,
  renderBalanceView,
};

export default Balance;
