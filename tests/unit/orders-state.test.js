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
  calculateItem,
  calculateTotals,
} from '../../public/js/orders.js';
import { _resetStore, _getStore, addDoc, getDocs, getDoc, updateDoc } from '../__mocks__/firebase-firestore.js';

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

// Mock history.js
vi.mock('../../public/js/history.js', () => ({
  getByType: vi.fn(async () => []),
  getTypes: vi.fn(async () => ['Medallas', 'Trofeos', 'Galvanos', 'Llaveros', 'Porta celulares']),
  DEFAULT_TYPES: ['Medallas', 'Trofeos', 'Galvanos', 'Llaveros', 'Porta celulares'],
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

  describe('calculateItem()', () => {
    it('should calculate gramos and costoPropio for an item', () => {
      const result = calculateItem({ tipoPieza: 'Medallas', pesoPieza: 10, cantidad: 5, extra: 100, precioCliente: 1000 });
      expect(result.gramos).toBe(50); // 10 * 5
      expect(result.costoPropio).toBe(900); // (50 * 16) + 100
      expect(result.precioCliente).toBe(1000);
      expect(result.tipoPieza).toBe('Medallas');
    });

    it('should default cantidad to 1 if not provided', () => {
      const result = calculateItem({ pesoPieza: 20, extra: 0 });
      expect(result.cantidad).toBe(1);
      expect(result.gramos).toBe(20);
      expect(result.costoPropio).toBe(320); // 20 * 16
    });
  });

  describe('calculateTotals()', () => {
    it('should sum costoPropio, precioCliente, and gramos from items', () => {
      const items = [
        { tipoPieza: 'Medallas', pesoPieza: 10, cantidad: 5, gramos: 50, extra: 0, costoPropio: 800, precioCliente: 1000 },
        { tipoPieza: 'Trofeos', pesoPieza: 20, cantidad: 2, gramos: 40, extra: 100, costoPropio: 740, precioCliente: 900 },
      ];
      const totals = calculateTotals(items);
      expect(totals.costoPropio).toBe(1540);
      expect(totals.precioCliente).toBe(1900);
      expect(totals.gramos).toBe(90);
    });
  });

  describe('create()', () => {
    it('should create an order with state "pedido"', async () => {
      const result = await create({
        clienteId: 'client1',
        descripcion: 'Test order',
        items: [
          { tipoPieza: 'Medallas', pesoPieza: 10, cantidad: 5, extra: 0, precioCliente: 1000 }
        ],
      });

      expect(result).toHaveProperty('id');
      expect(addDoc).toHaveBeenCalled();

      const callArgs = addDoc.mock.calls[0][1];
      expect(callArgs.estado).toBe('pedido');
    });

    it('debería inicializar totalPagado en 0 al crear una orden', async () => {
      await create({
        clienteId: 'client1',
        descripcion: 'Test order',
        items: [
          { tipoPieza: 'Medallas', pesoPieza: 10, cantidad: 5, extra: 0, precioCliente: 1000 }
        ],
      });

      const callArgs = addDoc.mock.calls[0][1];
      expect(callArgs.totalPagado).toBe(0);
    });

    it('should include fecha in historialEstados on creation', async () => {
      await create({
        clienteId: 'client1',
        descripcion: 'Test order',
        items: [
          { tipoPieza: 'Medallas', pesoPieza: 10, cantidad: 5, extra: 0, precioCliente: 1000 }
        ],
      });

      const callArgs = addDoc.mock.calls[0][1];
      expect(callArgs.historialEstados).toHaveLength(1);
      expect(callArgs.historialEstados[0].estado).toBe('pedido');
      expect(callArgs.historialEstados[0].fecha).toBeDefined();
    });

    it('should throw error when clienteId is missing', async () => {
      await expect(create({ descripcion: 'No client', items: [{ tipoPieza: 'Medallas', pesoPieza: 10, cantidad: 1 }] })).rejects.toThrow('Debe seleccionar un cliente');
    });

    it('should throw error when descripcion is empty', async () => {
      await expect(create({ clienteId: 'client1', descripcion: '', items: [{ tipoPieza: 'Medallas' }] })).rejects.toThrow('La descripción es obligatoria');
    });

    it('should throw error when no items provided', async () => {
      await expect(create({ clienteId: 'client1', descripcion: 'Test' })).rejects.toThrow('Debe agregar al menos una pieza');
    });

    it('should throw error when items array is empty', async () => {
      await expect(create({ clienteId: 'client1', descripcion: 'Test', items: [] })).rejects.toThrow('Debe agregar al menos una pieza');
    });

    it('should calculate costs correctly from items', async () => {
      await create({
        clienteId: 'client1',
        descripcion: 'Cost test',
        items: [
          { tipoPieza: 'Medallas', pesoPieza: 10, cantidad: 5, extra: 100, precioCliente: 1200 },
          { tipoPieza: 'Trofeos', pesoPieza: 20, cantidad: 3, extra: 50, precioCliente: 1500 },
        ],
      });

      const callArgs = addDoc.mock.calls[0][1];
      // Item 1: gramos = 10*5=50, costoPropio = (50*16)+100 = 900
      // Item 2: gramos = 20*3=60, costoPropio = (60*16)+50 = 1010
      expect(callArgs.items).toHaveLength(2);
      expect(callArgs.items[0].gramos).toBe(50);
      expect(callArgs.items[0].costoPropio).toBe(900);
      expect(callArgs.items[1].gramos).toBe(60);
      expect(callArgs.items[1].costoPropio).toBe(1010);
      // Totals
      expect(callArgs.costoPropio).toBe(1910); // 900 + 1010
      expect(callArgs.precioCliente).toBe(2700); // 1200 + 1500
      expect(callArgs.gramos).toBe(110); // 50 + 60
    });

    it('should store items array in the order document', async () => {
      await create({
        clienteId: 'client1',
        descripcion: 'Items test',
        items: [
          { tipoPieza: 'Galvanos', pesoPieza: 15, cantidad: 2, extra: 0, precioCliente: 600 },
        ],
      });

      const callArgs = addDoc.mock.calls[0][1];
      expect(callArgs.items).toBeDefined();
      expect(Array.isArray(callArgs.items)).toBe(true);
      expect(callArgs.items[0].tipoPieza).toBe('Galvanos');
      expect(callArgs.items[0].pesoPieza).toBe(15);
      expect(callArgs.items[0].cantidad).toBe(2);
      expect(callArgs.items[0].gramos).toBe(30);
      expect(callArgs.items[0].costoPropio).toBe(480); // 30*16
      expect(callArgs.items[0].precioCliente).toBe(600);
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
