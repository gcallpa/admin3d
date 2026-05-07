/**
 * Firebase Configuration Module
 * 
 * Inicialización del SDK modular de Firebase v9+ usando imports ESM desde CDN.
 * Este archivo exporta las instancias de Auth y Firestore para uso en toda la aplicación.
 * 
 * IMPORTANTE: Reemplazar los valores de firebaseConfig con los de tu proyecto Firebase.
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// Configuración de Firebase
const firebaseConfig = {
  apiKey: 'AIzaSyAxtrTGlrpq4lzdqBV4-9whd3dl9mEic7k',
  authDomain: 'admin3d.firebaseapp.com',
  projectId: 'admin3d',
  storageBucket: 'admin3d.firebasestorage.app',
  messagingSenderId: '948924080696',
  appId: '1:948924080696:web:cf113822ddbf3cbe783ccd'
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Instancia de Authentication
const auth = getAuth(app);

// Instancia de Firestore
const db = getFirestore(app);

export { app, auth, db };
