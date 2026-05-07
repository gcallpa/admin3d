/**
 * Mock de Firebase Firestore para testing
 */
import { vi } from 'vitest';

// In-memory store for testing
let _store = {};
let _idCounter = 1;

export function _resetStore() {
  _store = {};
  _idCounter = 1;
}

export function _getStore() {
  return _store;
}

export function getFirestore(app) {
  return { type: 'firestore', app };
}

export function collection(db, collectionName) {
  return { type: 'collection', path: collectionName, db };
}

export function doc(db, collectionName, docId) {
  return { type: 'doc', path: collectionName, id: docId, db };
}

export function query(...args) {
  const [collectionRef, ...constraints] = args;
  return { type: 'query', collectionRef, constraints };
}

export function where(field, op, value) {
  return { type: 'where', field, op, value };
}

export function orderBy(field, direction = 'asc') {
  return { type: 'orderBy', field, direction };
}

export function serverTimestamp() {
  return { type: 'serverTimestamp', seconds: Math.floor(Date.now() / 1000) };
}

export const getDocs = vi.fn(async (queryRef) => {
  const collPath = queryRef.type === 'query'
    ? queryRef.collectionRef.path
    : queryRef.path;

  const collData = _store[collPath] || {};
  let docs = Object.entries(collData).map(([id, data]) => ({
    id,
    data: () => ({ ...data }),
    exists: () => true,
  }));

  // Apply where constraints if query
  if (queryRef.type === 'query' && queryRef.constraints) {
    for (const constraint of queryRef.constraints) {
      if (constraint.type === 'where') {
        docs = docs.filter(d => {
          const val = d.data()[constraint.field];
          switch (constraint.op) {
            case '==': return val === constraint.value;
            case '!=': return val !== constraint.value;
            case '>': return val > constraint.value;
            case '<': return val < constraint.value;
            case '>=': return val >= constraint.value;
            case '<=': return val <= constraint.value;
            default: return true;
          }
        });
      }
    }
  }

  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
    forEach: (cb) => docs.forEach(cb),
  };
});

export const getDoc = vi.fn(async (docRef) => {
  const collData = _store[docRef.path] || {};
  const data = collData[docRef.id];
  return {
    id: docRef.id,
    exists: () => !!data,
    data: () => data ? { ...data } : undefined,
  };
});

export const addDoc = vi.fn(async (collRef, data) => {
  const id = `doc_${_idCounter++}`;
  if (!_store[collRef.path]) {
    _store[collRef.path] = {};
  }
  _store[collRef.path][id] = { ...data };
  return { id };
});

export const updateDoc = vi.fn(async (docRef, data) => {
  if (!_store[docRef.path]) {
    _store[docRef.path] = {};
  }
  if (_store[docRef.path][docRef.id]) {
    _store[docRef.path][docRef.id] = {
      ..._store[docRef.path][docRef.id],
      ...data,
    };
  }
});

export const deleteDoc = vi.fn(async (docRef) => {
  if (_store[docRef.path] && _store[docRef.path][docRef.id]) {
    delete _store[docRef.path][docRef.id];
  }
});
