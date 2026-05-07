/**
 * Unit tests for the Balance module
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getIncomeByPeriod,
  getExpensesByPeriod,
  getBalance,
  getProfitability,
  getBalanceSummary,
} from '../../public/js/balance.js';
import { _resetStore, _getStore } from '../__mocks__/firebase-firestore.js';

// Mock the firebase-config module
vi.mock('../../public/js/firebase-config.js', () => ({
  db: { type: 'firestore', app: {} },
}));

// Mock utils
vi.mock('../../public/js/utils.js', () => ({
  formatDate: (ts) => ts ? '01/01/2024 12:00' : '—',
  formatCurrency: (n) => `${n}`,
  showToast: vi.fn(),
}));

// Mock app.js Router
vi.mock('../../public/js/app.js', () => ({
  Router: { navigate: vi.fn() },
}));

describe('Balance Module', () => {
  beforeEach(() => {
    _resetStore();
    vi.clearAllMocks();
  });

  // --- getProfitability() ---

  describe('getProfitability()', () => {
    it('should return correct percentage when income > 0', () => {
      const result = getProfitability(100000, 60000);
      expect(result.percentage).toBeCloseTo(40.0);
      expect(result.label).toBe('40.0%');
    });

    it('should return 100% when expenses are 0', () => {
      const result = getProfitability(50000, 0);
      expect(result.percentage).toBeCloseTo(100.0);
      expect(result.label).toBe('100.0%');
    });

    it('should return negative percentage when expenses > income', () => {
      const result = getProfitability(50000, 80000);
      expect(result.percentage).toBeCloseTo(-60.0);
      expect(result.label).toBe('-60.0%');
    });

    it('should return "Sin ingresos" when income is 0', () => {
      const result = getProfitability(0, 5000);
      expect(result.percentage).toBeNull();
      expect(result.label).toBe('Sin ingresos');
    });

    it('should return "Sin ingresos" when income is negative', () => {
      const result = getProfitability(-100, 5000);
      expect(result.percentage).toBeNull();
      expect(result.label).toBe('Sin ingresos');
    });

    it('should handle equal income and expenses (0% profitability)', () => {
      const result = getProfitability(10000, 10000);
      expect(result.percentage).toBeCloseTo(0.0);
      expect(result.label).toBe('0.0%');
    });
  });

  // --- getIncomeByPeriod() ---

  describe('getIncomeByPeriod()', () => {
    it('should only count orders with estado "entregado"', async () => {
      const store = _getStore();
      store['ordenes'] = {
        'o1': { estado: 'entregado', precioCliente: 50000, creadoEn: { seconds: new Date(2024, 5, 15).getTime() / 1000 } },
        'o2': { estado: 'pedido', precioCliente: 30000, creadoEn: { seconds: new Date(2024, 5, 10).getTime() / 1000 } },
        'o3': { estado: 'trabajando', precioCliente: 20000, creadoEn: { seconds: new Date(2024, 5, 12).getTime() / 1000 } },
        'o4': { estado: 'terminado', precioCliente: 40000, creadoEn: { seconds: new Date(2024, 5, 14).getTime() / 1000 } },
        'o5': { estado: 'entregado', precioCliente: 25000, creadoEn: { seconds: new Date(2024, 5, 20).getTime() / 1000 } },
      };

      const income = await getIncomeByPeriod(2024, 5);
      // Only o1 (50000) and o5 (25000) should count
      expect(income).toBe(75000);
    });

    it('should only count orders within the specified period', async () => {
      const store = _getStore();
      store['ordenes'] = {
        'o1': { estado: 'entregado', precioCliente: 50000, creadoEn: { seconds: new Date(2024, 5, 15).getTime() / 1000 } },
        'o2': { estado: 'entregado', precioCliente: 30000, creadoEn: { seconds: new Date(2024, 6, 10).getTime() / 1000 } },
        'o3': { estado: 'entregado', precioCliente: 20000, creadoEn: { seconds: new Date(2023, 5, 12).getTime() / 1000 } },
      };

      const income = await getIncomeByPeriod(2024, 5);
      // Only o1 (50000) is in June 2024
      expect(income).toBe(50000);
    });

    it('should return 0 when no entregado orders in period', async () => {
      const store = _getStore();
      store['ordenes'] = {
        'o1': { estado: 'pedido', precioCliente: 50000, creadoEn: { seconds: new Date(2024, 5, 15).getTime() / 1000 } },
      };

      const income = await getIncomeByPeriod(2024, 5);
      expect(income).toBe(0);
    });

    it('should sum all entregado orders in year when month not specified', async () => {
      const store = _getStore();
      store['ordenes'] = {
        'o1': { estado: 'entregado', precioCliente: 50000, creadoEn: { seconds: new Date(2024, 0, 15).getTime() / 1000 } },
        'o2': { estado: 'entregado', precioCliente: 30000, creadoEn: { seconds: new Date(2024, 6, 10).getTime() / 1000 } },
        'o3': { estado: 'entregado', precioCliente: 20000, creadoEn: { seconds: new Date(2023, 5, 12).getTime() / 1000 } },
      };

      const income = await getIncomeByPeriod(2024);
      // o1 + o2 = 80000 (both in 2024)
      expect(income).toBe(80000);
    });

    it('should return 0 when no orders exist', async () => {
      const income = await getIncomeByPeriod(2024, 5);
      expect(income).toBe(0);
    });
  });

  // --- getBalance() ---

  describe('getBalance()', () => {
    it('should return income - expenses', async () => {
      const store = _getStore();
      // Income: 50000 from entregado order
      store['ordenes'] = {
        'o1': { estado: 'entregado', precioCliente: 50000, creadoEn: { seconds: new Date(2024, 5, 15).getTime() / 1000 } },
      };
      // Expenses: 20000 from supply
      store['suministros'] = {
        's1': { producto: 'PLA', precioTotal: 20000, fecha: { seconds: new Date(2024, 5, 10).getTime() / 1000 } },
      };

      const balance = await getBalance(2024, 5);
      expect(balance).toBe(30000); // 50000 - 20000
    });

    it('should return negative when expenses > income', async () => {
      const store = _getStore();
      store['ordenes'] = {
        'o1': { estado: 'entregado', precioCliente: 10000, creadoEn: { seconds: new Date(2024, 5, 15).getTime() / 1000 } },
      };
      store['suministros'] = {
        's1': { producto: 'PLA', precioTotal: 30000, fecha: { seconds: new Date(2024, 5, 10).getTime() / 1000 } },
      };

      const balance = await getBalance(2024, 5);
      expect(balance).toBe(-20000); // 10000 - 30000
    });

    it('should return 0 when no income and no expenses', async () => {
      const balance = await getBalance(2024, 5);
      expect(balance).toBe(0);
    });
  });

  // --- getBalanceSummary() ---

  describe('getBalanceSummary()', () => {
    it('should return complete summary object', async () => {
      const store = _getStore();
      store['ordenes'] = {
        'o1': { estado: 'entregado', precioCliente: 80000, creadoEn: { seconds: new Date(2024, 5, 15).getTime() / 1000 } },
      };
      store['suministros'] = {
        's1': { producto: 'PLA', precioTotal: 30000, fecha: { seconds: new Date(2024, 5, 10).getTime() / 1000 } },
      };

      const summary = await getBalanceSummary(2024, 5);
      expect(summary.ingresos).toBe(80000);
      expect(summary.gastos).toBe(30000);
      expect(summary.balance).toBe(50000);
      expect(summary.rentabilidad.percentage).toBeCloseTo(62.5);
      expect(summary.rentabilidad.label).toBe('62.5%');
    });

    it('should handle zero income correctly', async () => {
      const store = _getStore();
      store['suministros'] = {
        's1': { producto: 'PLA', precioTotal: 15000, fecha: { seconds: new Date(2024, 5, 10).getTime() / 1000 } },
      };

      const summary = await getBalanceSummary(2024, 5);
      expect(summary.ingresos).toBe(0);
      expect(summary.gastos).toBe(15000);
      expect(summary.balance).toBe(-15000);
      expect(summary.rentabilidad.percentage).toBeNull();
      expect(summary.rentabilidad.label).toBe('Sin ingresos');
    });
  });
});
