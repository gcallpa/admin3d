/**
 * Unit tests for the Orders state machine logic
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  STATES,
  VALID_TRANSITIONS,
  canTransition,
  create,
  advanceState,
  getAll,
  getByState,
  getById,
} from '../../public/js/orders.js';
import { _resetStore, _getStore, addDoc, getDocs, getDoc, updateDoc } from '../__mocks__/firebase-firestore.js';

// Mock the firebase-config module
vi.mock('../../public/js/firebase-config.js', () => ({
  db: { type: 'firestore', app: {} },
}));

// Mock utils
vi.mock('../../public/js/utils.js', () => ({
  formatDate: (ts) => ts ? '01/01/2024 12:00' : '—',
  formatCurrency: (amount) => `$${amount}`,
  showToast: vi.fn(),
}));

// Mock app.js Router
vi.mock('../../public/js/app.js', () => ({
  Router: { navigate: vi.fn() },
}));

// Mock clients.js
vi.mock('../../public/js/clients.js', () => ({
  getAll: vi.fn(async () => []),
  getById: vi.fn(async (id) => {
    if (id === 'client1') return { id: 'client1', nombre: 'Test Client' };
    return null;
  }),
}));

// Mock payments.js
vi.mock('../../public/js/payments.js', () => ({
  renderPaymentsSection: vi.fn(async () => '<div>Payments Mock</div>'),
  attachPaymentFormHandler: vi.fn(),
}));

describe('Orders State Machine', () => {
  beforeEach(() => {
    _resetStore();
    vi.clearAllMocks();
  });

  describe('STATES', () => {
    it('should have 4 states in correct order', () => {
      expect(STATES).toEqual(['pedido', 'trabajando', 'terminado', 'entregado']);
    });
  });

  describe('VALID_TRANSITIONS', () => {
    it('should define transitions for all states', () => {
      expect(Object.keys(VALID_TRANSITIONS)).toHaveLength(4);
      STATES.forEach(state => {
        expect(VALID_TRANSITIONS).toHaveProperty(state);
      });
    });
  });

  describe('canTransition()', () => {
    it('should allow pedido → trabajando', () => {
      expect(canTransition('pedido', 'trabajando')).toBe(true);
    });

    it('should allow trabajando → terminado', () => {
      expect(canTransition('trabajando', 'terminado')).toBe(true);
    });

    it('should allow terminado → entregado', () => {
      expect(canTransition('terminado', 'entregado')).toBe(true);
    });

    it('should reject pedido → terminado (skip state)', () => {
      expect(canTransition('pedido', 'terminado')).toBe(false);
    });

    it('should reject pedido → entregado (skip states)', () => {
      expect(canTransition('pedido', 'entregado')).toBe(false);
    });

    it('should reject entregado → pedido (reverse)', () => {
      expect(canTransition('entregado', 'pedido')).toBe(false);
    });

    it('should reject entregado → trabajando (reverse)', () => {
      expect(canTransition('entregado', 'trabajando')).toBe(false);
    });

    it('should reject trabajando → pedido (reverse)', () => {
      expect(canTransition('trabajando', 'pedido')).toBe(false);
    });

    it('should reject unknown state', () => {
      expect(canTransition('unknown', 'pedido')).toBe(false);
    });
  });

  describe('create()', () => {
    it('should create an order with state "pedido"', async () => {
      const result = await create({
        clienteId: 'client1',
        descripcion: 'Test order',
        gramos: 100,
        extra: 0,
        tipoPieza: 'Medallas',
      });

      expect(result).toHaveProperty('id');
      expect(addDoc).toHaveBeenCalled();

      const callArgs = addDoc.mock.calls[0][1];
      expect(callArgs.estado).toBe('pedido');
    });

    it('should include fecha in historialEstados on creation', async () => {
      await create({
        clienteId: 'client1',
        descripcion: 'Test order',
        gramos: 50,
      });

      const callArgs = addDoc.mock.calls[0][1];
      expect(callArgs.historialEstados).toHaveLength(1);
      expect(callArgs.historialEstados[0].estado).toBe('pedido');
      expect(callArgs.historialEstados[0].fecha).toBeDefined();
    });

    it('should throw error when clienteId is missing', async () => {
      await expect(create({ descripcion: 'No client' })).rejects.toThrow('Debe seleccionar un cliente');
    });

    it('should throw error when descripcion is empty', async () => {
      await expect(create({ clienteId: 'client1', descripcion: '' })).rejects.toThrow('La descripción es obligatoria');
    });

    it('should calculate costs correctly', async () => {
      await create({
        clienteId: 'client1',
        descripcion: 'Cost test',
        gramos: 100,
        extra: 200,
      });

      const callArgs = addDoc.mock.calls[0][1];
      expect(callArgs.costoPropio).toBe(1800); // (100 * 16) + 200
      expect(callArgs.precioCliente).toBe(1980); // 1800 * 1.10
    });
  });

  describe('advanceState()', () => {
    it('should advance from pedido to trabajando', async () => {
      const store = _getStore();
      store['ordenes'] = {
        'ord1': {
          clienteId: 'client1',
          descripcion: 'Test',
          estado: 'pedido',
          historialEstados: [{ estado: 'pedido', fecha: '2024-01-01T00:00:00.000Z' }],
          creadoEn: { seconds: 1000 },
        },
      };

      const result = await advanceState('ord1');
      expect(result.newState).toBe('trabajando');
      expect(updateDoc).toHaveBeenCalled();
    });

    it('should advance from trabajando to terminado', async () => {
      const store = _getStore();
      store['ordenes'] = {
        'ord2': {
          clienteId: 'client1',
          descripcion: 'Test',
          estado: 'trabajando',
          historialEstados: [
            { estado: 'pedido', fecha: '2024-01-01T00:00:00.000Z' },
            { estado: 'trabajando', fecha: '2024-01-02T00:00:00.000Z' },
          ],
          creadoEn: { seconds: 1000 },
        },
      };

      const result = await advanceState('ord2');
      expect(result.newState).toBe('terminado');
    });

    it('should throw error when trying to advance from entregado', async () => {
      const store = _getStore();
      store['ordenes'] = {
        'ord3': {
          clienteId: 'client1',
          descripcion: 'Test',
          estado: 'entregado',
          historialEstados: [],
          creadoEn: { seconds: 1000 },
        },
      };

      await expect(advanceState('ord3')).rejects.toThrow('No se puede avanzar desde el estado "entregado"');
    });

    it('should throw error for non-existent order', async () => {
      await expect(advanceState('nonexistent')).rejects.toThrow('Orden no encontrada');
    });

    it('should add new state to historialEstados', async () => {
      const store = _getStore();
      store['ordenes'] = {
        'ord4': {
          clienteId: 'client1',
          descripcion: 'Test',
          estado: 'pedido',
          historialEstados: [{ estado: 'pedido', fecha: '2024-01-01T00:00:00.000Z' }],
          creadoEn: { seconds: 1000 },
        },
      };

      await advanceState('ord4');

      const updateCall = updateDoc.mock.calls[0][1];
      expect(updateCall.historialEstados).toHaveLength(2);
      expect(updateCall.historialEstados[1].estado).toBe('trabajando');
      expect(updateCall.historialEstados[1].fecha).toBeDefined();
    });
  });

  describe('getAll()', () => {
    it('should return all orders', async () => {
      const store = _getStore();
      store['ordenes'] = {
        'o1': { descripcion: 'Order 1', estado: 'pedido', creadoEn: { seconds: 1000 } },
        'o2': { descripcion: 'Order 2', estado: 'trabajando', creadoEn: { seconds: 2000 } },
      };

      const orders = await getAll();
      expect(orders).toHaveLength(2);
    });

    it('should return empty array when no orders exist', async () => {
      const orders = await getAll();
      expect(orders).toHaveLength(0);
    });
  });

  describe('getByState()', () => {
    it('should filter orders by state', async () => {
      const store = _getStore();
      store['ordenes'] = {
        'o1': { descripcion: 'Order 1', estado: 'pedido', creadoEn: { seconds: 1000 } },
        'o2': { descripcion: 'Order 2', estado: 'trabajando', creadoEn: { seconds: 2000 } },
        'o3': { descripcion: 'Order 3', estado: 'pedido', creadoEn: { seconds: 3000 } },
      };

      const pedidos = await getByState('pedido');
      expect(pedidos).toHaveLength(2);
      expect(pedidos.every(o => o.estado === 'pedido')).toBe(true);
    });
  });
});
