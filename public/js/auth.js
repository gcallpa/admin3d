/**
 * Módulo de Autenticación - Login Oculto
 * 
 * Gestiona el mecanismo de login oculto (5 clicks en logo) y la
 * autenticación con Firebase Auth.
 */

import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { auth } from './firebase-config.js';
import { setAuthenticated } from './app.js';

/**
 * Módulo Auth - Login oculto y autenticación Firebase
 */
const Auth = {
  clickCount: 0,
  REQUIRED_CLICKS: 5,
  RESET_TIMEOUT_MS: 3000,
  clickTimer: null,

  /**
   * Inicializa el mecanismo de login oculto y el listener de auth state.
   */
  init() {
    this.initHiddenLogin();
    this.initAuthStateListener();
    this.initLogoutButton();
    this.initLoginForm();
  },

  /**
   * Configura el listener de clicks en el logo.
   */
  initHiddenLogin() {
    const logoContainer = document.getElementById('logo-container');
    if (logoContainer) {
      logoContainer.addEventListener('click', () => this.handleLogoClick());
    }
  },

  /**
   * Maneja cada click en el logo. Incrementa el contador y revela
   * el formulario si se alcanza el umbral de 5 clicks en 3 segundos.
   */
  handleLogoClick() {
    this.clickCount++;

    // Reset timer on each click
    if (this.clickTimer) {
      clearTimeout(this.clickTimer);
    }

    if (this.clickCount >= this.REQUIRED_CLICKS) {
      this.showLoginForm();
      this.clickCount = 0;
      this.clickTimer = null;
    } else {
      // Reset counter after 3 seconds of inactivity
      this.clickTimer = setTimeout(() => {
        this.clickCount = 0;
        this.clickTimer = null;
      }, this.RESET_TIMEOUT_MS);
    }
  },

  /**
   * Muestra el formulario de login con animación CSS (slideDown).
   */
  showLoginForm() {
    const container = document.getElementById('login-form-container');
    if (container) {
      container.classList.remove('hidden');
      container.setAttribute('aria-hidden', 'false');
      // Focus the email input for accessibility
      const emailInput = document.getElementById('login-email');
      if (emailInput) {
        emailInput.focus();
      }
    }
  },

  /**
   * Oculta el formulario de login.
   */
  hideLoginForm() {
    const container = document.getElementById('login-form-container');
    if (container) {
      container.classList.add('hidden');
      container.setAttribute('aria-hidden', 'true');
    }
    this.clearError();
  },

  /**
   * Configura el listener del formulario de login.
   */
  initLoginForm() {
    const form = document.getElementById('login-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        this.login(email, password);
      });
    }
  },

  /**
   * Autentica al usuario con Firebase Auth.
   * @param {string} email - Correo electrónico
   * @param {string} password - Contraseña
   * @returns {Promise<void>}
   */
  async login(email, password) {
    this.clearError();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Auth state listener will handle the redirect
    } catch (error) {
      this.showError(this.getErrorMessage(error.code));
    }
  },

  /**
   * Cierra la sesión del usuario.
   * @returns {Promise<void>}
   */
  async logout() {
    try {
      await signOut(auth);
      // Auth state listener will handle the redirect
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  },

  /**
   * Configura el botón de logout.
   */
  initLogoutButton() {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.logout());
    }
  },

  /**
   * Inicializa el listener de cambios de estado de autenticación.
   */
  initAuthStateListener() {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        this.hideLoginForm();
        setAuthenticated(true);
      } else {
        setAuthenticated(false);
      }
    });
  },

  /**
   * Retorna el estado actual de autenticación.
   * @returns {boolean}
   */
  isAuthenticated() {
    return auth.currentUser !== null;
  },

  /**
   * Traduce códigos de error de Firebase a mensajes en español.
   * @param {string} errorCode - Código de error de Firebase
   * @returns {string} Mensaje de error legible
   */
  getErrorMessage(errorCode) {
    const errorMessages = {
      'auth/invalid-credential': 'Credenciales incorrectas',
      'auth/invalid-credentials': 'Credenciales incorrectas',
      'auth/wrong-password': 'Credenciales incorrectas',
      'auth/user-not-found': 'Credenciales incorrectas',
      'auth/too-many-requests': 'Demasiados intentos, espere un momento',
      'auth/network-request-failed': 'Error de conexión, verifique su internet',
    };
    return errorMessages[errorCode] || 'Error de autenticación, intente nuevamente';
  },

  /**
   * Muestra un mensaje de error en el formulario de login.
   * @param {string} message - Mensaje de error
   */
  showError(message) {
    const errorEl = document.getElementById('login-error');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.remove('hidden');
    }
  },

  /**
   * Limpia el mensaje de error del formulario.
   */
  clearError() {
    const errorEl = document.getElementById('login-error');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.add('hidden');
    }
  }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Auth.init());
} else {
  Auth.init();
}

export { Auth };
