/**
 * Unit tests for the Payments module
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  validate,
  getByOrder,
  getTotalPaid,
  getBalance,
  getPaymentStatus,
  addPayment,
} from '../../public/js/payments.js';
import { _resetStore, _getStore, addDoc, getDocs } from '../__mocks__/firebase-firestore.js';

// Mock the firebase-config module
vi.mock('../../public/js/firebase-config.js', () => ({
  db: { type: 'firestore', app: {} },
}));

// Mock utils
vi.mock('../../public/js/utils.js', () => ({
  formatDate: (ts) => ts ? '01/01/2024 12:00' : '—',
  formatCurrency: (amount) => `${amount}`,
  showToast: vi.fn(),
}));

// Mock app.js Router
vi.mock('../../public/js/app.js', () => ({
  Router: { navigate: vi.fn() },
}));

// Mock clients.js (required by orders.js)
vi.mock('../../public/js/clients.js', () => ({
  getAll: vi.fn(async () => []),
  getById: vi.fn(async (id) => {
    if (id === 'client1') return { id: 'client1', nombre: 'Test Client' };
    return null;
  }),
}));

describe('Payments Module', () => {
  beforeEach(() => {
    _resetStore();
    vi.clearAllMocks();
  });

  describe('validate()', () => {
    it('should reject monto 0', () => {
      const result = validate(0, 1000);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('El monto debe ser mayor a cero');
    });

    it('should reject negative monto', () => {
      const result = validate(-100, 1000);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('El monto debe ser mayor a cero');
    });

    it('should reject monto exceeding saldo', () => {
      const result = validate(1500, 1000);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('El monto excede el saldo pendiente');
    });

    it('should accept valid monto within saldo', () => {
      const result = validate(500, 1000);
      expect(result.valid).toBe(true);
      expect(result.error).toBe('');
    });

    it('should accept monto equal to saldo', () => {
      const result = validate(1000, 1000);
      expect(result.valid).toBe(true);
      expect(result.error).toBe('');
    });
  });

  describe('addPayment()', () => {
    it('should store payment in Firestore', async () => {
      const store = _getStore();
      store['ordenes'] = {
        'order1': {
          clienteId: 'client1',
          descripcion: 'Test Order',
          estado: 'pedido',
          precioCliente: 5000,
          historialEstados: [],
          creadoEn: { seconds: 1000 },
        },
      };
      store['pagos'] = {};

      const result = await addPayment('order1', 2000);
      expect(result).toHaveProperty('id');
      expect(addDoc).toHaveBeenCalled();

      const callArgs = addDoc.mock.calls[0][1];
      expect(callArgs.ordenId).toBe('order1');
      expect(callArgs.monto).toBe(2000);
      expect(callArgs.fecha).toBeDefined();
      expect(callArgs.creadoEn).toBeDefined();
    });

    it('should reject payment with monto 0', async () => {
      const store = _getStore();
      store['ordenes'] = {
        'order1': {
          clienteId: 'client1',
          descripcion: 'Test',
          estado: 'pedido',
          precioCliente: 5000,
          historialEstados: [],
          creadoEn: { seconds: 1000 },
        },
      };
      store['pagos'] = {};

      await expect(addPayment('order1', 0)).rejects.toThrow('El monto debe ser mayor a cero');
    });

    it('should reject payment exceeding balance', async () => {
      const store = _getStore();
      store['ordenes'] = {
        'order1': {
          clienteId: 'client1',
          descripcion: 'Test',
          estado: 'pedido',
          precioCliente: 5000,
          historialEstados: [],
          creadoEn: { seconds: 1000 },
        },
      };
      store['pagos'] = {
        'pago1': { ordenId: 'order1', monto: 4000, fecha: { seconds: 2000 }, creadoEn: { seconds: 2000 } },
      };

      await expect(addPayment('order1', 2000)).rejects.toThrow('El monto excede el saldo pendiente');
    });
  });

  describe('getByOrder()', () => {
    it('should return payments for an order', async () => {
      const store = _getStore();
      store['pagos'] = {
        'p1': { ordenId: 'order1', monto: 1000, fecha: { seconds: 1000 }, creadoEn: { seconds: 1000 } },
        'p2': { ordenId: 'order1', monto: 500, fecha: { seconds: 2000 }, creadoEn: { seconds: 2000 } },
        'p3': { ordenId: 'order2', monto: 300, fecha: { seconds: 3000 }, creadoEn: { seconds: 3000 } },
      };

      const payments = await getByOrder('order1');
      expect(payments).toHaveLength(2);
      expect(payments.every(p => p.ordenId === 'order1')).toBe(true);
    });

    it('should return empty array when no payments exist', async () => {
      const payments = await getByOrder('no-payments-order');
      expect(payments).toHaveLength(0);
    });
  });

  describe('getTotalPaid()', () => {
    it('should sum all payments for an order', async () => {
      const store = _getStore();
      store['pagos'] = {
        'p1': { ordenId: 'order1', monto: 1000, fecha: { seconds: 1000 }, creadoEn: { seconds: 1000 } },
        'p2': { ordenId: 'order1', monto: 2000, fecha: { seconds: 2000 }, creadoEn: { seconds: 2000 } },
        'p3': { ordenId: 'order1', monto: 500, fecha: { seconds: 3000 }, creadoEn: { seconds: 3000 } },
      };

      const total = await getTotalPaid('order1');
      expect(total).toBe(3500);
    });

    it('should return 0 when no payments exist', async () => {
      const total = await getTotalPaid('empty-order');
      expect(total).toBe(0);
    });
  });

  describe('getBalance()', () => {
    it('should calculate balance correctly', async () => {
      const store = _getStore();
      store['ordenes'] = {
        'order1': {
          clienteId: 'client1',
          descripcion: 'Test',
          estado: 'pedido',
          precioCliente: 5000,
          historialEstados: [],
          creadoEn: { seconds: 1000 },
        },
      };
      store['pagos'] = {
        'p1': { ordenId: 'order1', monto: 1000, fecha: { seconds: 1000 }, creadoEn: { seconds: 1000 } },
        'p2': { ordenId: 'order1', monto: 1500, fecha: { seconds: 2000 }, creadoEn: { seconds: 2000 } },
      };

      const balance = await getBalance('order1');
      expect(balance).toBe(2500); // 5000 - 1000 - 1500
    });

    it('should return full price when no payments exist', async () => {
      const store = _getStore();
      store['ordenes'] = {
        'order1': {
          clienteId: 'client1',
          descripcion: 'Test',
          estado: 'pedido',
          precioCliente: 3000,
          historialEstados: [],
          creadoEn: { seconds: 1000 },
        },
      };
      store['pagos'] = {};

      const balance = await getBalance('order1');
      expect(balance).toBe(3000);
    });

    it('should throw error for non-existent order', async () => {
      await expect(getBalance('nonexistent')).rejects.toThrow('Orden no encontrada');
    });
  });

  describe('getPaymentStatus()', () => {
    it('should return "pagado" when fully paid', async () => {
      const store = _getStore();
      store['ordenes'] = {
        'order1': {
          clienteId: 'client1',
          descripcion: 'Test',
          estado: 'pedido',
          precioCliente: 2000,
          historialEstados: [],
          creadoEn: { seconds: 1000 },
        },
      };
      store['pagos'] = {
        'p1': { ordenId: 'order1', monto: 1000, fecha: { seconds: 1000 }, creadoEn: { seconds: 1000 } },
        'p2': { ordenId: 'order1', monto: 1000, fecha: { seconds: 2000 }, creadoEn: { seconds: 2000 } },
      };

      const status = await getPaymentStatus('order1');
      expect(status).toBe('pagado');
    });

    it('should return "pendiente" when balance remains', async () => {
      const store = _getStore();
      store['ordenes'] = {
        'order1': {
          clienteId: 'client1',
          descripcion: 'Test',
          estado: 'pedido',
          precioCliente: 5000,
          historialEstados: [],
          creadoEn: { seconds: 1000 },
        },
      };
      store['pagos'] = {
        'p1': { ordenId: 'order1', monto: 2000, fecha: { seconds: 1000 }, creadoEn: { seconds: 1000 } },
      };

      const status = await getPaymentStatus('order1');
      expect(status).toBe('pendiente');
    });

    it('should return "pendiente" when no payments exist', async () => {
      const store = _getStore();
      store['ordenes'] = {
        'order1': {
          clienteId: 'client1',
          descripcion: 'Test',
          estado: 'pedido',
          precioCliente: 1000,
          historialEstados: [],
          creadoEn: { seconds: 1000 },
        },
      };
      store['pagos'] = {};

      const status = await getPaymentStatus('order1');
      expect(status).toBe('pendiente');
    });
  });
});
