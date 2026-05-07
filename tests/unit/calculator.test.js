/**
 * Unit tests for the Calculator module
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getCostoPropio,
  getPrecioCliente,
  calculate,
  validate,
  saveToHistory,
} from '../../public/js/calculator.js';
import { _resetStore, addDoc } from '../__mocks__/firebase-firestore.js';

// Mock the firebase-config module
vi.mock('../../public/js/firebase-config.js', () => ({
  db: { type: 'firestore', app: {} },
}));

// Mock utils
vi.mock('../../public/js/utils.js', () => ({
  formatCurrency: (amount) => `$${amount}`,
  showToast: vi.fn(),
}));

describe('Calculator Module', () => {
  beforeEach(() => {
    _resetStore();
    vi.clearAllMocks();
  });

  describe('getCostoPropio()', () => {
    it('should calculate (gramos × 16) + extra correctly', () => {
      expect(getCostoPropio(100, 0)).toBe(1600);
      expect(getCostoPropio(50, 500)).toBe(1300);
      expect(getCostoPropio(200, 100)).toBe(3300);
    });

    it('should handle decimal gramos', () => {
      expect(getCostoPropio(10.5, 0)).toBe(168);
    });
  });

  describe('getPrecioCliente()', () => {
    it('should calculate costoPropio × 1.10 correctly', () => {
      expect(getPrecioCliente(1600)).toBe(1760);
      expect(getPrecioCliente(1300)).toBe(1430);
      expect(getPrecioCliente(1000)).toBe(1100);
    });
  });

  describe('calculate()', () => {
    it('100 gramos sin extra = costo propio 1600, precio cliente 1760', () => {
      const result = calculate(100, 0);
      expect(result.costoPropio).toBe(1600);
      expect(result.precioCliente).toBe(1760);
    });

    it('50 gramos con extra 500 = costo propio 1300, precio cliente 1430', () => {
      const result = calculate(50, 500);
      expect(result.costoPropio).toBe(1300);
      expect(result.precioCliente).toBe(1430);
    });

    it('should return both costoPropio and precioCliente', () => {
      const result = calculate(75, 200);
      expect(result).toHaveProperty('costoPropio');
      expect(result).toHaveProperty('precioCliente');
      expect(result.costoPropio).toBe(1400);
      expect(result.precioCliente).toBe(1540);
    });

    it('extra vacío se trata como 0', () => {
      const result = calculate(100);
      expect(result.costoPropio).toBe(1600);
      expect(result.precioCliente).toBe(1760);
    });
  });

  describe('validate()', () => {
    it('gramos = 0 shows validation error', () => {
      const result = validate(0, 0);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Los gramos deben ser mayores a cero');
    });

    it('negative gramos shows validation error', () => {
      const result = validate(-5, 0);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Los gramos deben ser mayores a cero');
    });

    it('should accept valid gramos > 0', () => {
      const result = validate(50, 0);
      expect(result.valid).toBe(true);
      expect(result.error).toBe('');
    });

    it('should accept gramos with extra', () => {
      const result = validate(100, 500);
      expect(result.valid).toBe(true);
      expect(result.error).toBe('');
    });
  });

  describe('saveToHistory()', () => {
    it('should save calculation to Firestore historialCostos collection', async () => {
      const result = await saveToHistory('Medallas', 100, 0, 1600, 1760);
      expect(result).toHaveProperty('id');
      expect(addDoc).toHaveBeenCalled();

      const callArgs = addDoc.mock.calls[0];
      const collRef = callArgs[0];
      const docData = callArgs[1];

      expect(collRef.path).toBe('historialCostos');
      expect(docData.tipoPieza).toBe('Medallas');
      expect(docData.gramos).toBe(100);
      expect(docData.extra).toBe(0);
      expect(docData.costoPropio).toBe(1600);
      expect(docData.precioCliente).toBe(1760);
      expect(docData.fecha).toBeDefined();
    });
  });
});
