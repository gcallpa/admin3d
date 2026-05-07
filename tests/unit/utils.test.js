import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { formatDate, formatCurrency, showToast, generateId, debounce } from '../../public/js/utils.js';

describe('formatDate', () => {
  it('formats a Date object to dd/mm/yyyy hh:mm', () => {
    const date = new Date(2024, 2, 15, 14, 30); // March 15, 2024 14:30
    expect(formatDate(date)).toBe('15/03/2024 14:30');
  });

  it('formats a Firestore-like timestamp with seconds', () => {
    // March 15, 2024 14:30:00 UTC
    const timestamp = { seconds: 1710513000 };
    const result = formatDate(timestamp);
    expect(result).toMatch(/^\d{2}\/\d{2}\/2024 \d{2}:\d{2}$/);
  });

  it('formats a timestamp with toDate method', () => {
    const date = new Date(2024, 0, 1, 10, 0);
    const timestamp = { toDate: () => date };
    expect(formatDate(timestamp)).toBe('01/01/2024 10:00');
  });

  it('returns dash for null or undefined', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
  });

  it('returns dash for invalid date', () => {
    expect(formatDate('invalid')).toBe('—');
  });

  it('pads single digit day and month', () => {
    const date = new Date(2024, 0, 5, 9, 5); // Jan 5, 2024 09:05
    expect(formatDate(date)).toBe('05/01/2024 09:05');
  });
});

describe('formatCurrency', () => {
  it('formats a positive number to CLP', () => {
    const result = formatCurrency(1600);
    expect(result).toBe('$1.600');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0');
  });

  it('formats a large number', () => {
    const result = formatCurrency(1500000);
    expect(result).toBe('$1.500.000');
  });

  it('rounds decimal values', () => {
    const result = formatCurrency(1599.5);
    expect(result).toBe('$1.600');
  });

  it('handles negative numbers', () => {
    const result = formatCurrency(-500);
    expect(result).toBe('-$500');
  });

  it('returns $0 for null/undefined/NaN', () => {
    expect(formatCurrency(null)).toBe('$0');
    expect(formatCurrency(undefined)).toBe('$0');
    expect(formatCurrency(NaN)).toBe('$0');
  });
});

describe('showToast', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="toast-container"></div>';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a toast element in the container', () => {
    showToast('Test message', 'success');
    const container = document.getElementById('toast-container');
    const toast = container.querySelector('.toast');
    expect(toast).not.toBeNull();
    expect(toast.textContent).toBe('Test message');
    expect(toast.classList.contains('toast-success')).toBe(true);
  });

  it('defaults to info type', () => {
    showToast('Info message');
    const toast = document.querySelector('.toast');
    expect(toast.classList.contains('toast-info')).toBe(true);
  });

  it('adds role alert for accessibility', () => {
    showToast('Alert', 'error');
    const toast = document.querySelector('.toast');
    expect(toast.getAttribute('role')).toBe('alert');
  });

  it('does nothing if container is missing', () => {
    document.body.innerHTML = '';
    expect(() => showToast('No container')).not.toThrow();
  });
});

describe('generateId', () => {
  it('returns a non-empty string', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('delays function execution', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('resets timer on subsequent calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);

    debounced();
    vi.advanceTimersByTime(100);
    debounced();
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('passes arguments to the debounced function', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('arg1', 'arg2');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
  });
});
