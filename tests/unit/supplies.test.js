/**
 * Unit tests for the Supplies module
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DEFAULT_CATEGORIES,
  validate,
  calculateTotal,
  create,
  getAll,
  getById,
  update,
  remove,
  getCategories,
  addCustomCategory,
  getByCategory,
  getTotalByCategory,
  getByPeriod,
  getTotalByPeriod,
  getCountByPeriod,
} from '../../public/js/supplies.js';
import { _resetStore, _getStore, addDoc, getDocs, getDoc, updateDoc, deleteDoc } from '../__mocks__/firebase-firestore.js';

// Mock the firebase-config module
vi.mock('../../public/js/firebase-config.js', () => ({
  db: { type: 'firestore', app: {} },
}));

// Mock utils
vi.mock('../../public/js/utils.js', () => ({
  formatDate: (ts) => ts ? '01/01/2024 12:00' : '—',
  formatCurrency: (n) => `$${n}`,
  showToast: vi.fn(),
}));

// Mock app.js Router
vi.mock('../../public/js/app.js', () => ({
  Router: { navigate: vi.fn() },
}));

describe('Supplies Module', () => {
  beforeEach(() => {
    _resetStore();
    vi.clearAllMocks();
  });

  // --- DEFAULT_CATEGORIES ---

  describe('DEFAULT_CATEGORIES', () => {
    it('should contain 8 predefined categories', () => {
      expect(DEFAULT_CATEGORIES).toHaveLength(8);
    });

    it('should include all expected categories', () => {
      expect(DEFAULT_CATEGORIES).toContain('Filamento PLA');
      expect(DEFAULT_CATEGORIES).toContain('Filamento ABS');
      expect(DEFAULT_CATEGORIES).toContain('Filamento PETG');
      expect(DEFAULT_CATEGORIES).toContain('Resina');
      expect(DEFAULT_CATEGORIES).toContain('Boquillas');
      expect(DEFAULT_CATEGORIES).toContain('Repuestos');
      expect(DEFAULT_CATEGORIES).toContain('Herramientas');
      expect(DEFAULT_CATEGORIES).toContain('Otros');
    });
  });

  // --- validate() ---

  describe('validate()', () => {
    it('should reject empty producto', () => {
      const result = validate({ producto: '', cantidad: 1, precioUnitario: 100 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('El nombre del producto es obligatorio');
    });

    it('should reject whitespace-only producto', () => {
      const result = validate({ producto: '   ', cantidad: 1, precioUnitario: 100 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('El nombre del producto es obligatorio');
    });

    it('should reject null data', () => {
      const result = validate(null);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject undefined producto', () => {
      const result = validate({ cantidad: 1, precioUnitario: 100 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('El nombre del producto es obligatorio');
    });

    it('should reject cantidad of 0', () => {
      const result = validate({ producto: 'PLA', cantidad: 0, precioUnitario: 100 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('La cantidad debe ser mayor a cero');
    });

    it('should reject negative cantidad', () => {
      const result = validate({ producto: 'PLA', cantidad: -5, precioUnitario: 100 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('La cantidad debe ser mayor a cero');
    });

    it('should reject precioUnitario of 0', () => {
      const result = validate({ producto: 'PLA', cantidad: 1, precioUnitario: 0 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('El precio unitario debe ser mayor a cero');
    });

    it('should reject negative precioUnitario', () => {
      const result = validate({ producto: 'PLA', cantidad: 1, precioUnitario: -50 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('El precio unitario debe ser mayor a cero');
    });

    it('should return multiple errors for multiple invalid fields', () => {
      const result = validate({ producto: '', cantidad: 0, precioUnitario: -1 });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(3);
    });

    it('should accept valid data', () => {
      const result = validate({ producto: 'Filamento PLA 1kg', cantidad: 2, precioUnitario: 15000 });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept data with minimal valid values', () => {
      const result = validate({ producto: 'X', cantidad: 1, precioUnitario: 1 });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  // --- calculateTotal() ---

  describe('calculateTotal()', () => {
    it('should return cantidad × precioUnitario', () => {
      expect(calculateTotal(2, 15000)).toBe(30000);
    });

    it('should handle single unit', () => {
      expect(calculateTotal(1, 5000)).toBe(5000);
    });

    it('should handle large quantities', () => {
      expect(calculateTotal(100, 200)).toBe(20000);
    });

    it('should handle decimal prices', () => {
      expect(calculateTotal(3, 1500.5)).toBeCloseTo(4501.5);
    });
  });

  // --- create() ---

  describe('create()', () => {
    it('should create a supply with valid data', async () => {
      const result = await create({
        producto: 'Filamento PLA',
        categoria: 'Filamento PLA',
        proveedor: 'Proveedor X',
        cantidad: 2,
        precioUnitario: 15000,
      });
      expect(result).toHaveProperty('id');
      expect(addDoc).toHaveBeenCalled();
    });

    it('should calculate precioTotal on create', async () => {
      await create({
        producto: 'Resina',
        cantidad: 3,
        precioUnitario: 20000,
      });
      const callArgs = addDoc.mock.calls[0][1];
      expect(callArgs.precioTotal).toBe(60000);
    });

    it('should include timestamps', async () => {
      await create({
        producto: 'Boquilla',
        cantidad: 1,
        precioUnitario: 5000,
      });
      const callArgs = addDoc.mock.calls[0][1];
      expect(callArgs.creadoEn).toBeDefined();
      expect(callArgs.actualizadoEn).toBeDefined();
    });

    it('should default categoria to Otros if not provided', async () => {
      await create({
        producto: 'Algo',
        cantidad: 1,
        precioUnitario: 1000,
      });
      const callArgs = addDoc.mock.calls[0][1];
      expect(callArgs.categoria).toBe('Otros');
    });

    it('should default proveedor to empty string if not provided', async () => {
      await create({
        producto: 'Algo',
        cantidad: 1,
        precioUnitario: 1000,
      });
      const callArgs = addDoc.mock.calls[0][1];
      expect(callArgs.proveedor).toBe('');
    });

    it('should throw error when producto is empty', async () => {
      await expect(create({ producto: '', cantidad: 1, precioUnitario: 100 }))
        .rejects.toThrow('El nombre del producto es obligatorio');
    });

    it('should throw error when cantidad is 0', async () => {
      await expect(create({ producto: 'PLA', cantidad: 0, precioUnitario: 100 }))
        .rejects.toThrow('La cantidad debe ser mayor a cero');
    });

    it('should throw error when precioUnitario is 0', async () => {
      await expect(create({ producto: 'PLA', cantidad: 1, precioUnitario: 0 }))
        .rejects.toThrow('El precio unitario debe ser mayor a cero');
    });

    it('should trim producto before saving', async () => {
      await create({
        producto: '  Filamento PETG  ',
        cantidad: 1,
        precioUnitario: 18000,
      });
      const callArgs = addDoc.mock.calls[0][1];
      expect(callArgs.producto).toBe('Filamento PETG');
    });
  });

  // --- getAll() ---

  describe('getAll()', () => {
    it('should return all supplies from the store', async () => {
      const store = _getStore();
      store['suministros'] = {
        'id1': { producto: 'PLA', cantidad: 1, precioUnitario: 15000, precioTotal: 15000, fecha: { seconds: 2000 } },
        'id2': { producto: 'ABS', cantidad: 2, precioUnitario: 12000, precioTotal: 24000, fecha: { seconds: 1000 } },
      };

      const supplies = await getAll();
      expect(supplies).toHaveLength(2);
      expect(supplies[0]).toHaveProperty('id');
      expect(supplies[0]).toHaveProperty('producto');
    });

    it('should return empty array when no supplies exist', async () => {
      const supplies = await getAll();
      expect(supplies).toHaveLength(0);
    });
  });

  // --- getById() ---

  describe('getById()', () => {
    it('should return a supply by ID', async () => {
      const store = _getStore();
      store['suministros'] = {
        'sup1': { producto: 'Resina', cantidad: 1, precioUnitario: 25000, precioTotal: 25000, fecha: { seconds: 1000 } },
      };

      const supply = await getById('sup1');
      expect(supply).not.toBeNull();
      expect(supply.id).toBe('sup1');
      expect(supply.producto).toBe('Resina');
    });

    it('should return null for non-existent ID', async () => {
      const supply = await getById('nonexistent');
      expect(supply).toBeNull();
    });
  });

  // --- update() ---

  describe('update()', () => {
    it('should update supply data', async () => {
      const store = _getStore();
      store['suministros'] = {
        'upd1': { producto: 'PLA', cantidad: 1, precioUnitario: 15000, precioTotal: 15000 },
      };

      await update('upd1', { producto: 'PLA Premium', cantidad: 2, precioUnitario: 18000 });
      expect(updateDoc).toHaveBeenCalled();
    });

    it('should recalculate precioTotal on update', async () => {
      const store = _getStore();
      store['suministros'] = {
        'upd2': { producto: 'PLA', cantidad: 1, precioUnitario: 15000, precioTotal: 15000 },
      };

      await update('upd2', { producto: 'PLA', cantidad: 3, precioUnitario: 15000 });
      const callArgs = updateDoc.mock.calls[0][1];
      expect(callArgs.precioTotal).toBe(45000);
    });

    it('should throw error if updating with empty producto', async () => {
      await expect(update('upd1', { producto: '', cantidad: 1, precioUnitario: 100 }))
        .rejects.toThrow('El nombre del producto es obligatorio');
    });

    it('should throw error if updating with invalid cantidad', async () => {
      await expect(update('upd1', { producto: 'PLA', cantidad: 0, precioUnitario: 100 }))
        .rejects.toThrow('La cantidad debe ser mayor a cero');
    });
  });

  // --- remove() ---

  describe('remove()', () => {
    it('should delete a supply from the store', async () => {
      const store = _getStore();
      store['suministros'] = {
        'del1': { producto: 'PLA', cantidad: 1, precioUnitario: 15000, precioTotal: 15000 },
      };

      await remove('del1');
      expect(deleteDoc).toHaveBeenCalled();
      expect(store['suministros']['del1']).toBeUndefined();
    });
  });

  // --- getCategories() ---

  describe('getCategories()', () => {
    it('should return default categories when no custom categories exist', async () => {
      const categories = await getCategories();
      expect(categories).toHaveLength(8);
      expect(categories).toEqual(DEFAULT_CATEGORIES);
    });

    it('should include custom categories from Firestore', async () => {
      const store = _getStore();
      store['categoriasSuministro'] = {
        'cat1': { nombre: 'Pintura', creadoEn: { seconds: 1000 } },
        'cat2': { nombre: 'Adhesivos', creadoEn: { seconds: 2000 } },
      };

      const categories = await getCategories();
      expect(categories).toHaveLength(10);
      expect(categories).toContain('Pintura');
      expect(categories).toContain('Adhesivos');
      // Default categories still present
      expect(categories).toContain('Filamento PLA');
      expect(categories).toContain('Otros');
    });
  });

  // --- addCustomCategory() ---

  describe('addCustomCategory()', () => {
    it('should add a new custom category', async () => {
      const result = await addCustomCategory('Pintura');
      expect(result).toHaveProperty('id');
      expect(addDoc).toHaveBeenCalled();
    });

    it('should throw error for empty name', async () => {
      await expect(addCustomCategory('')).rejects.toThrow('El nombre de la categoría es obligatorio');
    });

    it('should throw error for whitespace-only name', async () => {
      await expect(addCustomCategory('   ')).rejects.toThrow('El nombre de la categoría es obligatorio');
    });

    it('should throw error for duplicate of default category', async () => {
      await expect(addCustomCategory('Filamento PLA')).rejects.toThrow('Esta categoría ya existe');
    });

    it('should throw error for duplicate of existing custom category', async () => {
      const store = _getStore();
      store['categoriasSuministro'] = {
        'cat1': { nombre: 'Pintura', creadoEn: { seconds: 1000 } },
      };

      await expect(addCustomCategory('Pintura')).rejects.toThrow('Esta categoría ya existe');
    });
  });

  // --- getByCategory() ---

  describe('getByCategory()', () => {
    it('should return supplies matching the category', async () => {
      const store = _getStore();
      store['suministros'] = {
        's1': { producto: 'PLA Blanco', categoria: 'Filamento PLA', cantidad: 1, precioUnitario: 15000, precioTotal: 15000, fecha: { seconds: 1000 } },
        's2': { producto: 'Resina Gris', categoria: 'Resina', cantidad: 1, precioUnitario: 25000, precioTotal: 25000, fecha: { seconds: 2000 } },
        's3': { producto: 'PLA Negro', categoria: 'Filamento PLA', cantidad: 2, precioUnitario: 15000, precioTotal: 30000, fecha: { seconds: 3000 } },
      };

      const result = await getByCategory('Filamento PLA');
      expect(result).toHaveLength(2);
      expect(result.every(s => s.categoria === 'Filamento PLA')).toBe(true);
    });

    it('should return empty array for category with no supplies', async () => {
      const result = await getByCategory('Boquillas');
      expect(result).toHaveLength(0);
    });
  });

  // --- getByPeriod() ---

  describe('getByPeriod()', () => {
    it('should filter supplies by year', async () => {
      const store = _getStore();
      store['suministros'] = {
        's1': { producto: 'PLA', precioTotal: 15000, fecha: { seconds: new Date(2024, 5, 15).getTime() / 1000 } },
        's2': { producto: 'ABS', precioTotal: 12000, fecha: { seconds: new Date(2023, 3, 10).getTime() / 1000 } },
        's3': { producto: 'PETG', precioTotal: 18000, fecha: { seconds: new Date(2024, 11, 1).getTime() / 1000 } },
      };

      const result = await getByPeriod(2024);
      expect(result).toHaveLength(2);
    });

    it('should filter supplies by year and month', async () => {
      const store = _getStore();
      store['suministros'] = {
        's1': { producto: 'PLA', precioTotal: 15000, fecha: { seconds: new Date(2024, 5, 15).getTime() / 1000 } },
        's2': { producto: 'ABS', precioTotal: 12000, fecha: { seconds: new Date(2024, 5, 20).getTime() / 1000 } },
        's3': { producto: 'PETG', precioTotal: 18000, fecha: { seconds: new Date(2024, 6, 1).getTime() / 1000 } },
      };

      const result = await getByPeriod(2024, 5);
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no supplies match period', async () => {
      const store = _getStore();
      store['suministros'] = {
        's1': { producto: 'PLA', precioTotal: 15000, fecha: { seconds: new Date(2024, 5, 15).getTime() / 1000 } },
      };

      const result = await getByPeriod(2023, 0);
      expect(result).toHaveLength(0);
    });
  });

  // --- getTotalByPeriod() ---

  describe('getTotalByPeriod()', () => {
    it('should return sum of precioTotal in period', async () => {
      const store = _getStore();
      store['suministros'] = {
        's1': { producto: 'PLA', precioTotal: 15000, fecha: { seconds: new Date(2024, 5, 15).getTime() / 1000 } },
        's2': { producto: 'ABS', precioTotal: 12000, fecha: { seconds: new Date(2024, 5, 20).getTime() / 1000 } },
        's3': { producto: 'PETG', precioTotal: 18000, fecha: { seconds: new Date(2024, 6, 1).getTime() / 1000 } },
      };

      const total = await getTotalByPeriod(2024, 5);
      expect(total).toBe(27000);
    });

    it('should return 0 when no supplies in period', async () => {
      const total = await getTotalByPeriod(2020, 0);
      expect(total).toBe(0);
    });

    it('should sum all supplies in year when month not specified', async () => {
      const store = _getStore();
      store['suministros'] = {
        's1': { producto: 'PLA', precioTotal: 15000, fecha: { seconds: new Date(2024, 0, 15).getTime() / 1000 } },
        's2': { producto: 'ABS', precioTotal: 12000, fecha: { seconds: new Date(2024, 6, 20).getTime() / 1000 } },
        's3': { producto: 'PETG', precioTotal: 18000, fecha: { seconds: new Date(2023, 6, 1).getTime() / 1000 } },
      };

      const total = await getTotalByPeriod(2024);
      expect(total).toBe(27000);
    });
  });

  // --- getCountByPeriod() ---

  describe('getCountByPeriod()', () => {
    it('should return count of supplies in period', async () => {
      const store = _getStore();
      store['suministros'] = {
        's1': { producto: 'PLA', precioTotal: 15000, fecha: { seconds: new Date(2024, 5, 15).getTime() / 1000 } },
        's2': { producto: 'ABS', precioTotal: 12000, fecha: { seconds: new Date(2024, 5, 20).getTime() / 1000 } },
        's3': { producto: 'PETG', precioTotal: 18000, fecha: { seconds: new Date(2024, 6, 1).getTime() / 1000 } },
      };

      const count = await getCountByPeriod(2024, 5);
      expect(count).toBe(2);
    });

    it('should return 0 when no supplies in period', async () => {
      const count = await getCountByPeriod(2020, 0);
      expect(count).toBe(0);
    });
  });

  // --- getTotalByCategory() ---

  describe('getTotalByCategory()', () => {
    it('should return totals grouped by category for a period', async () => {
      const store = _getStore();
      store['suministros'] = {
        's1': { producto: 'PLA Blanco', categoria: 'Filamento PLA', precioTotal: 15000, fecha: { seconds: new Date(2024, 5, 15).getTime() / 1000 } },
        's2': { producto: 'Resina Gris', categoria: 'Resina', precioTotal: 25000, fecha: { seconds: new Date(2024, 5, 20).getTime() / 1000 } },
        's3': { producto: 'PLA Negro', categoria: 'Filamento PLA', precioTotal: 15000, fecha: { seconds: new Date(2024, 5, 25).getTime() / 1000 } },
      };

      const totals = await getTotalByCategory(2024, 5);
      expect(totals['Filamento PLA']).toBe(30000);
      expect(totals['Resina']).toBe(25000);
    });

    it('should return empty object when no supplies in period', async () => {
      const totals = await getTotalByCategory(2020, 0);
      expect(Object.keys(totals)).toHaveLength(0);
    });
  });
});
