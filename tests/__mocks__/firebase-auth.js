/**
 * Mock de Firebase Auth para testing
 */
import { vi } from 'vitest';

const mockAuth = {
  currentUser: null,
};

export function getAuth(app) {
  return mockAuth;
}

export const signInWithEmailAndPassword = vi.fn().mockResolvedValue({
  user: { uid: 'test-uid', email: 'test@test.com' },
});

export const signOut = vi.fn().mockResolvedValue(undefined);

export const onAuthStateChanged = vi.fn((auth, callback) => {
  // Don't call callback immediately in mock - let tests control it
  return () => {}; // unsubscribe function
});
