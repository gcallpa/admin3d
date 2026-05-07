import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

describe('Test environment setup', () => {
  it('should run a basic unit test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should run a basic property-based test with fast-check', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        return a + b === b + a;
      })
    );
  });
});
