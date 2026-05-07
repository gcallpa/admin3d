/**
 * Unit tests for the Stock module
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
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
} from '../../public/js/stock.js';
import { _resetStore, _getStore, addDoc, getDocs, getDoc, updateDoc, deleteDoc } from '../__mocks__/firebase-firestore.js';

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

describe('Stock Module', () => {
  beforeEach(() => {
    _resetStore();
    vi.clearAllMocks();
  });

  // --- Constants ---

  describe('Constants', () => {
    it('should have 2 stock categories', () => {
      expect(STOCK_CATEGORIES).toHaveLength(2);
      expect(STOCK_CATEGORIES).toContain('Filamentos');
      expect(STOCK_CATEGORIES).toContain('Accesorios');
    });

    it('should have 5 filament types', () => {
      expect(FILAMENT_TYPES).toHaveLength(5);
      expect(FILAMENT_TYPES).toContain('PLA');
      expect(FILAMENT_TYPES).toContain('ABS');
      expect(FILAMENT_TYPES).toContain('PETG');
      expect(FILAMENT_TYPES).toContain('TPU');
      expect(FILAMENT_TYPES).toContain('Resina');
    });

    it('should have 9 filament colors', () => {
      expect(FILAMENT_COLORS).toHaveLength(9);
      expect(FILAMENT_COLORS).toContain('Blanco');
      expect(FILAMENT_COLORS).toContain('Negro');
      expect(FILAMENT_COLORS).toContain('Otro');
    });
  });

  // --- validate() ---

  describe('validate()', () => {
    it('should accept valid filament data', () => {
      const result = validate({
        nombre: 'PLA Blanco - eSun',
        categoria: 'Filamentos',
        cantidadDisponible: 1000,
        umbralBajo: 200,
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept valid accessory data', () => {
      const result = validate({
        nombre: 'Cintas para medalla',
        categoria: 'Accesorios',
        cantidadDisponible: 50,
        umbralBajo: 10,
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty nombre', () => {
      const result = validate({
        nombre: '',
        categoria: 'Filamentos',
        cantidadDisponible: 100,
        umbralBajo: 10,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('El nombre es obligatorio');
    });

    it('should reject whitespace-only nombre', () => {
      const result = validate({
        nombre: '   ',
        categoria: 'Filamentos',
        cantidadDisponible: 100,
        umbralBajo: 10,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('El nombre es obligatorio');
    });

    it('should reject null data', () => {
      const result = validate(null);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid category', () => {
      const result = validate({
        nombre: 'Item',
        categoria: 'InvalidCategory',
        cantidadDisponible: 10,
        umbralBajo: 5,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('La categoría debe ser Filamentos o Accesorios');
    });

    it('should reject missing category', () => {
      const result = validate({
        nombre: 'Item',
        cantidadDisponible: 10,
        umbralBajo: 5,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('La categoría debe ser Filamentos o Accesorios');
    });

    it('should reject negative cantidadDisponible', () => {
      const result = validate({
        nombre: 'PLA',
        categoria: 'Filamentos',
        cantidadDisponible: -5,
        umbralBajo: 10,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('La cantidad disponible debe ser mayor o igual a cero');
    });

    it('should accept cantidadDisponible of 0', () => {
      const result = validate({
        nombre: 'PLA',
        categoria: 'Filamentos',
        cantidadDisponible: 0,
        umbralBajo: 10,
      });
      expect(result.valid).toBe(true);
    });

    it('should reject negative umbralBajo', () => {
      const result = validate({
        nombre: 'PLA',
        categoria: 'Filamentos',
        cantidadDisponible: 100,
        umbralBajo: -1,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('El umbral bajo debe ser mayor o igual a cero');
    });

    it('should return multiple errors for multiple invalid fields', () => {
      const result = validate({
        nombre: '',
        categoria: 'Invalid',
        cantidadDisponible: -1,
        umbralBajo: -1,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(4);
    });
  });

  // --- create() ---

  describe('create()', () => {
    it('should create a filament stock item', async () => {
      const result = await create({
        nombre: 'PLA Blanco - eSun',
        categoria: 'Filamentos',
        tipo: 'PLA',
        color: 'Blanco',
        marca: 'eSun',
        cantidadDisponible: 1000,
        umbralBajo: 200,
      });
      expect(result).toHaveProperty('id');
      expect(addDoc).toHaveBeenCalled();
    });

    it('should set unidad to gramos for Filamentos', async () => {
      await create({
        nombre: 'PLA Blanco',
        categoria: 'Filamentos',
        tipo: 'PLA',
        color: 'Blanco',
        cantidadDisponible: 1000,
        umbralBajo: 200,
      });
      const callArgs = addDoc.mock.calls[0][1];
      expect(callArgs.unidad).toBe('gramos');
    });

    it('should set unidad to unidades for Accesorios', async () => {
      await create({
        nombre: 'Cintas para medalla',
        categoria: 'Accesorios',
        tipo: 'Cintas',
        cantidadDisponible: 50,
        umbralBajo: 10,
      });
      const callArgs = addDoc.mock.calls[0][1];
      expect(callArgs.unidad).toBe('unidades');
    });

    it('should include timestamps', async () => {
      await create({
        nombre: 'PLA Negro',
        categoria: 'Filamentos',
        cantidadDisponible: 500,
        umbralBajo: 100,
      });
      const callArgs = addDoc.mock.calls[0][1];
      expect(callArgs.creadoEn).toBeDefined();
      expect(callArgs.actualizadoEn).toBeDefined();
    });

    it('should throw error when nombre is empty', async () => {
      await expect(create({
        nombre: '',
        categoria: 'Filamentos',
        cantidadDisponible: 100,
        umbralBajo: 10,
      })).rejects.toThrow('El nombre es obligatorio');
    });

    it('should throw error when category is invalid', async () => {
      await expect(create({
        nombre: 'Item',
        categoria: 'Invalid',
        cantidadDisponible: 100,
        umbralBajo: 10,
      })).rejects.toThrow('La categoría debe ser Filamentos o Accesorios');
    });

    it('should trim nombre before saving', async () => {
      await create({
        nombre: '  PLA Blanco  ',
        categoria: 'Filamentos',
        cantidadDisponible: 1000,
        umbralBajo: 200,
      });
      const callArgs = addDoc.mock.calls[0][1];
      expect(callArgs.nombre).toBe('PLA Blanco');
    });

    it('should default optional fields to empty strings', async () => {
      await create({
        nombre: 'Item',
        categoria: 'Accesorios',
        cantidadDisponible: 10,
        umbralBajo: 5,
      });
      const callArgs = addDoc.mock.calls[0][1];
      expect(callArgs.tipo).toBe('');
      expect(callArgs.color).toBe('');
      expect(callArgs.marca).toBe('');
    });
  });

  // --- getAll() ---

  describe('getAll()', () => {
    it('should return all stock items', async () => {
      const store = _getStore();
      store['stock'] = {
        'id1': { nombre: 'PLA Blanco', categoria: 'Filamentos', cantidadDisponible: 1000, umbralBajo: 200 },
        'id2': { nombre: 'Cintas', categoria: 'Accesorios', cantidadDisponible: 50, umbralBajo: 10 },
      };

      const items = await getAll();
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveProperty('id');
      expect(items[0]).toHaveProperty('nombre');
    });

    it('should return empty array when no items exist', async () => {
      const items = await getAll();
      expect(items).toHaveLength(0);
    });
  });

  // --- getById() ---

  describe('getById()', () => {
    it('should return an item by ID', async () => {
      const store = _getStore();
      store['stock'] = {
        'stk1': { nombre: 'PLA Blanco', categoria: 'Filamentos', cantidadDisponible: 1000, umbralBajo: 200 },
      };

      const item = await getById('stk1');
      expect(item).not.toBeNull();
      expect(item.id).toBe('stk1');
      expect(item.nombre).toBe('PLA Blanco');
    });

    it('should return null for non-existent ID', async () => {
      const item = await getById('nonexistent');
      expect(item).toBeNull();
    });
  });

  // --- update() ---

  describe('update()', () => {
    it('should update stock item data', async () => {
      const store = _getStore();
      store['stock'] = {
        'upd1': { nombre: 'PLA Blanco', categoria: 'Filamentos', cantidadDisponible: 1000, umbralBajo: 200 },
      };

      await update('upd1', {
        nombre: 'PLA Blanco Premium',
        categoria: 'Filamentos',
        cantidadDisponible: 1500,
        umbralBajo: 300,
      });
      expect(updateDoc).toHaveBeenCalled();
    });

    it('should throw error if updating with empty nombre', async () => {
      await expect(update('upd1', {
        nombre: '',
        categoria: 'Filamentos',
        cantidadDisponible: 100,
        umbralBajo: 10,
      })).rejects.toThrow('El nombre es obligatorio');
    });

    it('should throw error if updating with invalid category', async () => {
      await expect(update('upd1', {
        nombre: 'Item',
        categoria: 'Invalid',
        cantidadDisponible: 100,
        umbralBajo: 10,
      })).rejects.toThrow('La categoría debe ser Filamentos o Accesorios');
    });

    it('should include actualizadoEn timestamp', async () => {
      const store = _getStore();
      store['stock'] = {
        'upd2': { nombre: 'PLA', categoria: 'Filamentos', cantidadDisponible: 500, umbralBajo: 100 },
      };

      await update('upd2', {
        nombre: 'PLA Updated',
        categoria: 'Filamentos',
        cantidadDisponible: 600,
        umbralBajo: 100,
      });
      const callArgs = updateDoc.mock.calls[0][1];
      expect(callArgs.actualizadoEn).toBeDefined();
    });
  });

  // --- remove() ---

  describe('remove()', () => {
    it('should delete a stock item', async () => {
      const store = _getStore();
      store['stock'] = {
        'del1': { nombre: 'PLA Blanco', categoria: 'Filamentos', cantidadDisponible: 1000, umbralBajo: 200 },
      };

      await remove('del1');
      expect(deleteDoc).toHaveBeenCalled();
      expect(store['stock']['del1']).toBeUndefined();
    });
  });

  // --- addStock() ---

  describe('addStock()', () => {
    it('should increase quantity of an item', async () => {
      const store = _getStore();
      store['stock'] = {
        'add1': { nombre: 'PLA Blanco', categoria: 'Filamentos', cantidadDisponible: 500, umbralBajo: 200 },
      };

      await addStock('add1', 250);
      expect(updateDoc).toHaveBeenCalled();
      const callArgs = updateDoc.mock.calls[0][1];
      expect(callArgs.cantidadDisponible).toBe(750);
    });

    it('should throw error for zero cantidad', async () => {
      await expect(addStock('add1', 0)).rejects.toThrow('La cantidad a agregar debe ser mayor a cero');
    });

    it('should throw error for negative cantidad', async () => {
      await expect(addStock('add1', -10)).rejects.toThrow('La cantidad a agregar debe ser mayor a cero');
    });

    it('should throw error for non-existent item', async () => {
      await expect(addStock('nonexistent', 100)).rejects.toThrow('Item no encontrado');
    });

    it('should add to item with 0 stock', async () => {
      const store = _getStore();
      store['stock'] = {
        'add2': { nombre: 'PLA Negro', categoria: 'Filamentos', cantidadDisponible: 0, umbralBajo: 100 },
      };

      await addStock('add2', 500);
      const callArgs = updateDoc.mock.calls[0][1];
      expect(callArgs.cantidadDisponible).toBe(500);
    });
  });

  // --- subtractStock() ---

  describe('subtractStock()', () => {
    it('should decrease quantity of an item', async () => {
      const store = _getStore();
      store['stock'] = {
        'sub1': { nombre: 'PLA Blanco', categoria: 'Filamentos', cantidadDisponible: 500, umbralBajo: 200 },
      };

      await subtractStock('sub1', 200);
      expect(updateDoc).toHaveBeenCalled();
      const callArgs = updateDoc.mock.calls[0][1];
      expect(callArgs.cantidadDisponible).toBe(300);
    });

    it('should not go below 0', async () => {
      const store = _getStore();
      store['stock'] = {
        'sub2': { nombre: 'PLA Blanco', categoria: 'Filamentos', cantidadDisponible: 100, umbralBajo: 200 },
      };

      await subtractStock('sub2', 500);
      const callArgs = updateDoc.mock.calls[0][1];
      expect(callArgs.cantidadDisponible).toBe(0);
    });

    it('should throw error for zero cantidad', async () => {
      await expect(subtractStock('sub1', 0)).rejects.toThrow('La cantidad a restar debe ser mayor a cero');
    });

    it('should throw error for negative cantidad', async () => {
      await expect(subtractStock('sub1', -10)).rejects.toThrow('La cantidad a restar debe ser mayor a cero');
    });

    it('should throw error for non-existent item', async () => {
      await expect(subtractStock('nonexistent', 100)).rejects.toThrow('Item no encontrado');
    });

    it('should result in 0 when subtracting exact amount', async () => {
      const store = _getStore();
      store['stock'] = {
        'sub3': { nombre: 'Cintas', categoria: 'Accesorios', cantidadDisponible: 50, umbralBajo: 10 },
      };

      await subtractStock('sub3', 50);
      const callArgs = updateDoc.mock.calls[0][1];
      expect(callArgs.cantidadDisponible).toBe(0);
    });
  });

  // --- getLowStock() ---

  describe('getLowStock()', () => {
    it('should return items at or below threshold', async () => {
      const store = _getStore();
      store['stock'] = {
        's1': { nombre: 'PLA Blanco', categoria: 'Filamentos', cantidadDisponible: 100, umbralBajo: 200 },
        's2': { nombre: 'ABS Negro', categoria: 'Filamentos', cantidadDisponible: 500, umbralBajo: 200 },
        's3': { nombre: 'Cintas', categoria: 'Accesorios', cantidadDisponible: 5, umbralBajo: 10 },
        's4': { nombre: 'Argollas', categoria: 'Accesorios', cantidadDisponible: 50, umbralBajo: 10 },
      };

      const lowStock = await getLowStock();
      expect(lowStock).toHaveLength(2);
      expect(lowStock.map(i => i.nombre)).toContain('PLA Blanco');
      expect(lowStock.map(i => i.nombre)).toContain('Cintas');
    });

    it('should include items with exactly the threshold amount', async () => {
      const store = _getStore();
      store['stock'] = {
        's1': { nombre: 'PLA Blanco', categoria: 'Filamentos', cantidadDisponible: 200, umbralBajo: 200 },
      };

      const lowStock = await getLowStock();
      expect(lowStock).toHaveLength(1);
      expect(lowStock[0].nombre).toBe('PLA Blanco');
    });

    it('should include items with 0 stock', async () => {
      const store = _getStore();
      store['stock'] = {
        's1': { nombre: 'PLA Blanco', categoria: 'Filamentos', cantidadDisponible: 0, umbralBajo: 200 },
      };

      const lowStock = await getLowStock();
      expect(lowStock).toHaveLength(1);
    });

    it('should return empty array when all items are above threshold', async () => {
      const store = _getStore();
      store['stock'] = {
        's1': { nombre: 'PLA Blanco', categoria: 'Filamentos', cantidadDisponible: 1000, umbralBajo: 200 },
        's2': { nombre: 'Cintas', categoria: 'Accesorios', cantidadDisponible: 50, umbralBajo: 10 },
      };

      const lowStock = await getLowStock();
      expect(lowStock).toHaveLength(0);
    });

    it('should return empty array when no items exist', async () => {
      const lowStock = await getLowStock();
      expect(lowStock).toHaveLength(0);
    });
  });

  // --- getByCategory() ---

  describe('getByCategory()', () => {
    it('should return items matching the category', async () => {
      const store = _getStore();
      store['stock'] = {
        's1': { nombre: 'PLA Blanco', categoria: 'Filamentos', cantidadDisponible: 1000, umbralBajo: 200 },
        's2': { nombre: 'ABS Negro', categoria: 'Filamentos', cantidadDisponible: 500, umbralBajo: 200 },
        's3': { nombre: 'Cintas', categoria: 'Accesorios', cantidadDisponible: 50, umbralBajo: 10 },
      };

      const result = await getByCategory('Filamentos');
      expect(result).toHaveLength(2);
      expect(result.every(i => i.categoria === 'Filamentos')).toBe(true);
    });

    it('should return empty array for category with no items', async () => {
      const result = await getByCategory('Accesorios');
      expect(result).toHaveLength(0);
    });

    it('should return only Accesorios when filtering by Accesorios', async () => {
      const store = _getStore();
      store['stock'] = {
        's1': { nombre: 'PLA Blanco', categoria: 'Filamentos', cantidadDisponible: 1000, umbralBajo: 200 },
        's2': { nombre: 'Cintas', categoria: 'Accesorios', cantidadDisponible: 50, umbralBajo: 10 },
        's3': { nombre: 'Argollas', categoria: 'Accesorios', cantidadDisponible: 30, umbralBajo: 5 },
      };

      const result = await getByCategory('Accesorios');
      expect(result).toHaveLength(2);
      expect(result.every(i => i.categoria === 'Accesorios')).toBe(true);
    });
  });
});
