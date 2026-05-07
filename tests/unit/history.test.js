/**
 * Unit tests for the History module
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DEFAULT_TYPES,
  getAll,
  getByType,
  getAverages,
  getTypes,
  addCustomType,
  save,
} from '../../public/js/history.js';
import { _resetStore, _getStore, addDoc, getDocs } from '../__mocks__/firebase-firestore.js';

// Mock the firebase-config module
vi.mock('../../public/js/firebase-config.js', () => ({
  db: { type: 'firestore', app: {} },
}));

// Mock utils
vi.mock('../../public/js/utils.js', () => ({
  formatCurrency: (amount) => `${amount}`,
  formatDate: (ts) => '01/01/2024 12:00',
  showToast: vi.fn(),
}));

describe('History Module', () => {
  beforeEach(() => {
    _resetStore();
    vi.clearAllMocks();
  });

  describe('DEFAULT_TYPES', () => {
    it('should include the 5 predefined types', () => {
      expect(DEFAULT_TYPES).toEqual(['Medallas', 'Trofeos', 'Galvanos', 'Llaveros', 'Porta celulares']);
      expect(DEFAULT_TYPES).toHaveLength(5);
    });

    it('should include Medallas', () => {
      expect(DEFAULT_TYPES).toContain('Medallas');
    });

    it('should include Trofeos', () => {
      expect(DEFAULT_TYPES).toContain('Trofeos');
    });

    it('should include Galvanos', () => {
      expect(DEFAULT_TYPES).toContain('Galvanos');
    });

    it('should include Llaveros', () => {
      expect(DEFAULT_TYPES).toContain('Llaveros');
    });

    it('should include Porta celulares', () => {
      expect(DEFAULT_TYPES).toContain('Porta celulares');
    });
  });

  describe('getAll()', () => {
    it('should return all entries from historialCostos', async () => {
      // Seed the store with entries
      const store = _getStore();
      store['historialCostos'] = {
        'entry1': { tipoPieza: 'Medallas', gramos: 100, extra: 0, costoPropio: 1600, precioCliente: 1760, fecha: { seconds: 1700000000 } },
        'entry2': { tipoPieza: 'Trofeos', gramos: 200, extra: 50, costoPropio: 3250, precioCliente: 3575, fecha: { seconds: 1700001000 } },
      };

      const entries = await getAll();
      expect(entries).toHaveLength(2);
      expect(entries[0]).toHaveProperty('id');
      expect(entries[0]).toHaveProperty('tipoPieza');
      expect(entries[0]).toHaveProperty('gramos');
      expect(entries[0]).toHaveProperty('costoPropio');
      expect(entries[0]).toHaveProperty('precioCliente');
    });

    it('should return empty array when no entries exist', async () => {
      const entries = await getAll();
      expect(entries).toHaveLength(0);
    });
  });

  describe('getByType()', () => {
    it('should filter entries by tipo de pieza', async () => {
      const store = _getStore();
      store['historialCostos'] = {
        'entry1': { tipoPieza: 'Medallas', gramos: 100, extra: 0, costoPropio: 1600, precioCliente: 1760, fecha: { seconds: 1700000000 } },
        'entry2': { tipoPieza: 'Trofeos', gramos: 200, extra: 50, costoPropio: 3250, precioCliente: 3575, fecha: { seconds: 1700001000 } },
        'entry3': { tipoPieza: 'Medallas', gramos: 50, extra: 100, costoPropio: 900, precioCliente: 990, fecha: { seconds: 1700002000 } },
      };

      const entries = await getByType('Medallas');
      expect(entries).toHaveLength(2);
      entries.forEach(entry => {
        expect(entry.tipoPieza).toBe('Medallas');
      });
    });

    it('should return empty array when no entries match the type', async () => {
      const store = _getStore();
      store['historialCostos'] = {
        'entry1': { tipoPieza: 'Medallas', gramos: 100, extra: 0, costoPropio: 1600, precioCliente: 1760, fecha: { seconds: 1700000000 } },
      };

      const entries = await getByType('Trofeos');
      expect(entries).toHaveLength(0);
    });
  });

  describe('getAverages()', () => {
    it('should calculate averages correctly with multiple entries', async () => {
      const store = _getStore();
      store['historialCostos'] = {
        'entry1': { tipoPieza: 'Medallas', gramos: 100, extra: 0, costoPropio: 1600, precioCliente: 1760, fecha: { seconds: 1700000000 } },
        'entry2': { tipoPieza: 'Medallas', gramos: 50, extra: 100, costoPropio: 900, precioCliente: 990, fecha: { seconds: 1700001000 } },
        'entry3': { tipoPieza: 'Medallas', gramos: 200, extra: 0, costoPropio: 3200, precioCliente: 3520, fecha: { seconds: 1700002000 } },
      };

      const averages = await getAverages('Medallas');
      expect(averages.count).toBe(3);
      expect(averages.avgCosto).toBeCloseTo((1600 + 900 + 3200) / 3);
      expect(averages.avgPrecio).toBeCloseTo((1760 + 990 + 3520) / 3);
    });

    it('should return zeros when no entries exist for the type', async () => {
      const averages = await getAverages('Llaveros');
      expect(averages.avgCosto).toBe(0);
      expect(averages.avgPrecio).toBe(0);
      expect(averages.count).toBe(0);
    });
  });

  describe('addCustomType()', () => {
    it('should save custom type to Firestore tiposPieza collection', async () => {
      const result = await addCustomType('Figuras');
      expect(result).toHaveProperty('id');
      expect(addDoc).toHaveBeenCalled();

      const callArgs = addDoc.mock.calls[0];
      const collRef = callArgs[0];
      const docData = callArgs[1];

      expect(collRef.path).toBe('tiposPieza');
      expect(docData.nombre).toBe('Figuras');
      expect(docData.esDefault).toBe(false);
      expect(docData.creadoEn).toBeDefined();
    });
  });

  describe('save()', () => {
    it('should store entry in historialCostos collection', async () => {
      const entry = {
        tipoPieza: 'Medallas',
        gramos: 100,
        extra: 0,
        costoPropio: 1600,
        precioCliente: 1760,
      };

      const result = await save(entry);
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

    it('should save all required fields', async () => {
      const entry = {
        tipoPieza: 'Trofeos',
        gramos: 250,
        extra: 500,
        costoPropio: 4500,
        precioCliente: 4950,
      };

      await save(entry);

      const callArgs = addDoc.mock.calls[0];
      const docData = callArgs[1];

      expect(docData).toHaveProperty('tipoPieza', 'Trofeos');
      expect(docData).toHaveProperty('gramos', 250);
      expect(docData).toHaveProperty('extra', 500);
      expect(docData).toHaveProperty('costoPropio', 4500);
      expect(docData).toHaveProperty('precioCliente', 4950);
      expect(docData).toHaveProperty('fecha');
    });
  });

  describe('getTypes()', () => {
    it('should return default types when no custom types exist', async () => {
      const types = await getTypes();
      expect(types).toEqual(expect.arrayContaining(DEFAULT_TYPES));
      expect(types).toHaveLength(5);
    });

    it('should include custom types from Firestore', async () => {
      const store = _getStore();
      store['tiposPieza'] = {
        'type1': { nombre: 'Figuras', esDefault: false, creadoEn: { seconds: 1700000000 } },
        'type2': { nombre: 'Lámparas', esDefault: false, creadoEn: { seconds: 1700001000 } },
      };

      const types = await getTypes();
      expect(types).toContain('Figuras');
      expect(types).toContain('Lámparas');
      expect(types.length).toBe(7); // 5 default + 2 custom
    });

    it('should not duplicate default types stored in Firestore', async () => {
      const store = _getStore();
      store['tiposPieza'] = {
        'type1': { nombre: 'Medallas', esDefault: true, creadoEn: { seconds: 1700000000 } },
      };

      const types = await getTypes();
      const medallaCount = types.filter(t => t === 'Medallas').length;
      expect(medallaCount).toBe(1);
    });
  });
});
