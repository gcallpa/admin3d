/**
 * Unit tests for the Clients module
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  validate,
  getAll,
  getById,
  create,
  update,
  getOrdersByClient,
} from '../../public/js/clients.js';
import { _resetStore, _getStore, addDoc, getDocs, getDoc, updateDoc } from '../__mocks__/firebase-firestore.js';

// Mock the firebase-config module
vi.mock('../../public/js/firebase-config.js', () => ({
  db: { type: 'firestore', app: {} },
}));

// Mock utils
vi.mock('../../public/js/utils.js', () => ({
  formatDate: (ts) => ts ? '01/01/2024 12:00' : '—',
  showToast: vi.fn(),
}));

// Mock app.js Router
vi.mock('../../public/js/app.js', () => ({
  Router: { navigate: vi.fn() },
}));

describe('Clients Module', () => {
  beforeEach(() => {
    _resetStore();
    vi.clearAllMocks();
  });

  describe('validate()', () => {
    it('should reject empty nombre', () => {
      const result = validate({ nombre: '', telefono: '123', correo: 'a@b.com' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('El nombre es obligatorio');
    });

    it('should reject whitespace-only nombre', () => {
      const result = validate({ nombre: '   ', telefono: '', correo: '' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('El nombre es obligatorio');
    });

    it('should reject null data', () => {
      const result = validate(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('El nombre es obligatorio');
    });

    it('should reject undefined nombre', () => {
      const result = validate({ telefono: '123' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('El nombre es obligatorio');
    });

    it('should accept valid data with nombre', () => {
      const result = validate({ nombre: 'Juan Pérez', telefono: '123456', correo: 'juan@test.com' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept data with only nombre (telefono and correo optional)', () => {
      const result = validate({ nombre: 'María' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('create()', () => {
    it('should create a client with valid data', async () => {
      const result = await create({ nombre: 'Test Client', telefono: '555-1234', correo: 'test@mail.com' });
      expect(result).toHaveProperty('id');
      expect(addDoc).toHaveBeenCalled();
    });

    it('should throw error when nombre is empty', async () => {
      await expect(create({ nombre: '', telefono: '123' })).rejects.toThrow('El nombre es obligatorio');
    });

    it('should trim the nombre before saving', async () => {
      await create({ nombre: '  Trimmed Name  ', telefono: '', correo: '' });
      const callArgs = addDoc.mock.calls[0][1];
      expect(callArgs.nombre).toBe('Trimmed Name');
    });

    it('should default telefono and correo to empty string if not provided', async () => {
      await create({ nombre: 'Solo Nombre' });
      const callArgs = addDoc.mock.calls[0][1];
      expect(callArgs.telefono).toBe('');
      expect(callArgs.correo).toBe('');
    });

    it('should include timestamps', async () => {
      await create({ nombre: 'With Timestamps' });
      const callArgs = addDoc.mock.calls[0][1];
      expect(callArgs.creadoEn).toBeDefined();
      expect(callArgs.actualizadoEn).toBeDefined();
    });
  });

  describe('getAll()', () => {
    it('should return all clients from the store', async () => {
      // Pre-populate store
      const store = _getStore();
      store['clientes'] = {
        'id1': { nombre: 'Client 1', telefono: '111', correo: 'a@a.com', creadoEn: { seconds: 1000 } },
        'id2': { nombre: 'Client 2', telefono: '222', correo: 'b@b.com', creadoEn: { seconds: 2000 } },
      };

      const clients = await getAll();
      expect(clients).toHaveLength(2);
      expect(clients[0]).toHaveProperty('id');
      expect(clients[0]).toHaveProperty('nombre');
    });

    it('should return empty array when no clients exist', async () => {
      const clients = await getAll();
      expect(clients).toHaveLength(0);
    });
  });

  describe('getById()', () => {
    it('should return a client by ID', async () => {
      const store = _getStore();
      store['clientes'] = {
        'abc123': { nombre: 'Found Client', telefono: '999', correo: 'found@test.com', creadoEn: { seconds: 1000 } },
      };

      const client = await getById('abc123');
      expect(client).not.toBeNull();
      expect(client.id).toBe('abc123');
      expect(client.nombre).toBe('Found Client');
    });

    it('should return null for non-existent ID', async () => {
      const client = await getById('nonexistent');
      expect(client).toBeNull();
    });
  });

  describe('update()', () => {
    it('should update client data', async () => {
      const store = _getStore();
      store['clientes'] = {
        'upd1': { nombre: 'Original', telefono: '111', correo: 'orig@test.com' },
      };

      await update('upd1', { nombre: 'Updated', telefono: '222' });
      expect(updateDoc).toHaveBeenCalled();
    });

    it('should throw error if updating with empty nombre', async () => {
      await expect(update('upd1', { nombre: '' })).rejects.toThrow('El nombre es obligatorio');
    });

    it('should allow updating without nombre field', async () => {
      const store = _getStore();
      store['clientes'] = {
        'upd2': { nombre: 'Keep Name', telefono: '111', correo: '' },
      };

      await update('upd2', { telefono: '999' });
      expect(updateDoc).toHaveBeenCalled();
    });
  });

  describe('getOrdersByClient()', () => {
    it('should return orders for a given client', async () => {
      const store = _getStore();
      store['ordenes'] = {
        'ord1': { clienteId: 'client1', descripcion: 'Order 1', estado: 'pedido', creadoEn: { seconds: 1000 } },
        'ord2': { clienteId: 'client1', descripcion: 'Order 2', estado: 'trabajando', creadoEn: { seconds: 2000 } },
        'ord3': { clienteId: 'client2', descripcion: 'Order 3', estado: 'pedido', creadoEn: { seconds: 3000 } },
      };

      const orders = await getOrdersByClient('client1');
      expect(orders).toHaveLength(2);
      expect(orders.every(o => o.clienteId === 'client1')).toBe(true);
    });

    it('should return empty array when client has no orders', async () => {
      const orders = await getOrdersByClient('no-orders-client');
      expect(orders).toHaveLength(0);
    });
  });
});
