import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'jsdom',
  },
  resolve: {
    alias: {
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js': path.resolve('./tests/__mocks__/firebase-app.js'),
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js': path.resolve('./tests/__mocks__/firebase-auth.js'),
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js': path.resolve('./tests/__mocks__/firebase-firestore.js'),
    },
  },
});
