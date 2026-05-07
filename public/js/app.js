/**
 * Punto de entrada de la aplicación Admin Impresión 3D
 * Router hash-based para SPA
 */

import './auth.js';
import { renderClientList, renderClientForm, renderClientDetail, getAll as getAllClients } from './clients.js';
import { renderOrderList, renderOrderForm, renderOrderDetail, getAll as getAllOrders, STATES } from './orders.js';
import { renderCalculator, attachCalculatorHandlers } from './calculator.js';
import { renderHistory } from './history.js';
import { getByOrder as getPaymentsByOrder } from './payments.js';
import { formatCurrency, showToast } from './utils.js';

// --- Auth State ---
let _isAuthenticated = false;

/**
 * Sets the authentication state and updates the UI accordingly.
 * @param {boolean} authenticated
 */
export function setAuthenticated(authenticated) {
  _isAuthenticated = authenticated;
  updateUIForAuthState();
  if (authenticated) {
    // If on landing or no hash, go to dashboard
    if (!window.location.hash || window.location.hash === '#/' || window.location.hash === '#') {
      Router.navigate('#/dashboard');
    } else {
      Router.handleRouteChange();
    }
  } else {
    Router.navigate('#/');
  }
}

/**
 * Returns the current authentication state.
 * @returns {boolean}
 */
export function isAuthenticated() {
  return _isAuthenticated;
}

/**
 * Updates the UI visibility based on auth state.
 */
function updateUIForAuthState() {
  const landing = document.getElementById('landing');
  const sidebar = document.getElementById('sidebar');
  const app = document.getElementById('app');
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');

  if (_isAuthenticated) {
    if (landing) landing.classList.add('hidden');
    if (sidebar) sidebar.classList.remove('hidden');
    if (app) app.classList.remove('hidden');
    if (mobileMenuBtn) mobileMenuBtn.classList.remove('hidden');
  } else {
    if (landing) landing.classList.remove('hidden');
    if (sidebar) sidebar.classList.add('hidden');
    if (app) {
      app.classList.add('hidden');
      app.innerHTML = '';
    }
    if (mobileMenuBtn) mobileMenuBtn.classList.add('hidden');
  }
}

// --- Router ---

/**
 * Hash-based Router for SPA navigation.
 */
export const Router = {
  routes: new Map(),
  currentRoute: '',

  /**
   * Registers a route with its render function.
   * @param {string} hash - Route pattern (e.g., '#/dashboard', '#/clientes/:id')
   * @param {Function} renderFn - Function that returns HTML or renders the view
   * @param {Object} [options] - Route options
   * @param {boolean} [options.requiresAuth=true] - Whether route requires authentication
   */
  register(hash, renderFn, options = {}) {
    const { requiresAuth = true } = options;
    this.routes.set(hash, { renderFn, requiresAuth });
  },

  /**
   * Initializes the router: sets up event listeners and handles initial route.
   */
  init() {
    window.addEventListener('hashchange', () => this.handleRouteChange());

    // Handle initial route on load
    this.handleRouteChange();
  },

  /**
   * Navigates to a given hash route.
   * @param {string} hash - Target route hash
   */
  navigate(hash) {
    window.location.hash = hash;
  },

  /**
   * Handles route changes: matches route, checks auth, renders view.
   */
  handleRouteChange() {
    const hash = window.location.hash || '#/';
    const { route, params } = this.matchRoute(hash);

    if (!route) {
      // No matching route — redirect to landing or dashboard
      if (_isAuthenticated) {
        this.navigate('#/dashboard');
      } else {
        this.navigate('#/');
      }
      return;
    }

    const { renderFn, requiresAuth } = route;

    // Auth guard: redirect to landing if not authenticated
    if (requiresAuth && !_isAuthenticated) {
      this.navigate('#/');
      return;
    }

    // If authenticated and trying to access landing, redirect to dashboard
    if (hash === '#/' && _isAuthenticated) {
      this.navigate('#/dashboard');
      return;
    }

    this.currentRoute = hash;
    this.updateActiveNav(hash);

    const view = renderFn(params);
    if (view !== undefined) {
      this.render(view);
    }
  },

  /**
   * Matches a hash to a registered route, extracting dynamic params.
   * @param {string} hash - The current hash
   * @returns {{ route: Object|null, params: Object }}
   */
  matchRoute(hash) {
    // Try exact match first
    if (this.routes.has(hash)) {
      return { route: this.routes.get(hash), params: {} };
    }

    // Try pattern matching for dynamic routes (e.g., #/clientes/:id)
    for (const [pattern, route] of this.routes) {
      const params = this.extractParams(pattern, hash);
      if (params) {
        return { route, params };
      }
    }

    return { route: null, params: {} };
  },

  /**
   * Extracts dynamic parameters from a route pattern.
   * @param {string} pattern - Route pattern (e.g., '#/clientes/:id')
   * @param {string} hash - Actual hash (e.g., '#/clientes/abc123')
   * @returns {Object|null} Extracted params or null if no match
   */
  extractParams(pattern, hash) {
    const patternParts = pattern.split('/');
    const hashParts = hash.split('/');

    if (patternParts.length !== hashParts.length) return null;

    const params = {};
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].substring(1)] = hashParts[i];
      } else if (patternParts[i] !== hashParts[i]) {
        return null;
      }
    }

    // Only return params if at least one dynamic segment was found
    return Object.keys(params).length > 0 ? params : null;
  },

  /**
   * Renders a view (HTML string) into the main app container.
   * @param {string} html - HTML content to render
   */
  render(html) {
    const app = document.getElementById('app');
    if (app) {
      app.innerHTML = html;
    }
  },

  /**
   * Updates the active class on navigation links.
   * @param {string} hash - Current route hash
   */
  updateActiveNav(hash) {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
      const linkRoute = link.getAttribute('data-route');
      if (linkRoute && hash.includes(linkRoute)) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }
};

// --- Default Routes ---

// Landing page (no auth required)
Router.register('#/', () => {
  // Landing is handled by the static HTML, no need to render in #app
  return undefined;
}, { requiresAuth: false });

// Dashboard
Router.register('#/dashboard', () => {
  renderDashboard();
  return undefined;
});

// Clients list
Router.register('#/clientes', () => {
  renderClientList();
  return undefined;
});

// New client
Router.register('#/clientes/nuevo', () => {
  renderClientForm();
  return undefined;
});

// Edit client
Router.register('#/clientes/:id/editar', (params) => {
  renderClientForm(params);
  return undefined;
});

// Client detail
Router.register('#/clientes/:id', (params) => {
  renderClientDetail(params);
  return undefined;
});

// Orders list
Router.register('#/ordenes', () => {
  renderOrderList();
  return undefined;
});

// New order
Router.register('#/ordenes/nueva', () => {
  renderOrderForm();
  return undefined;
});

// Edit order
Router.register('#/ordenes/:id/editar', (params) => {
  renderOrderForm(params);
  return undefined;
});

// Order detail
Router.register('#/ordenes/:id', (params) => {
  renderOrderDetail(params);
  return undefined;
});

// Calculator
Router.register('#/calculadora', () => {
  const html = renderCalculator();
  // Use setTimeout to attach handlers after DOM update
  setTimeout(() => attachCalculatorHandlers(), 0);
  return html;
});

// History
Router.register('#/historial', () => {
  renderHistory();
  return undefined;
});

// --- Dashboard ---

/**
 * Renders the dashboard view with summary cards.
 */
async function renderDashboard() {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `<div class="loading"><div class="loading-spinner"></div> Cargando dashboard...</div>`;

  try {
    const [clients, orders] = await Promise.all([getAllClients(), getAllOrders()]);

    const totalClients = clients.length;
    const totalOrders = orders.length;

    // Count orders by state
    const ordersByState = {};
    STATES.forEach(s => { ordersByState[s] = 0; });
    orders.forEach(o => {
      if (ordersByState[o.estado] !== undefined) {
        ordersByState[o.estado]++;
      }
    });

    // Calculate pending payments (precioCliente - pagos realizados)
    let totalPendiente = 0;
    for (const o of orders) {
      const precio = o.precioCliente || 0;
      if (precio > 0) {
        const pagos = await getPaymentsByOrder(o.id);
        const totalPagado = pagos.reduce((sum, p) => sum + (p.monto || 0), 0);
        const saldo = precio - totalPagado;
        if (saldo > 0) {
          totalPendiente += saldo;
        }
      }
    }

    // Calculate profit and products sold
    const totalGanancia = orders.reduce((sum, o) => {
      return sum + ((o.precioCliente || 0) - (o.costoPropio || 0));
    }, 0);

    const productosVendidos = ordersByState.entregado || 0;

    // Calculate profit by month
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Build month options (last 12 months)
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    let monthOptions = '';
    for (let i = 0; i < 12; i++) {
      let m = currentMonth - i;
      let y = currentYear;
      if (m < 0) { m += 12; y--; }
      const selected = i === 0 ? 'selected' : '';
      monthOptions += `<option value="${y}-${m}" ${selected}>${monthNames[m]} ${y}</option>`;
    }

    // Current month profit
    const currentMonthOrders = orders.filter(o => {
      if (!o.creadoEn) return false;
      const fecha = o.creadoEn.seconds ? new Date(o.creadoEn.seconds * 1000) : new Date(o.creadoEn);
      return fecha.getMonth() === currentMonth && fecha.getFullYear() === currentYear;
    });
    const gananciaDelMes = currentMonthOrders.reduce((sum, o) => {
      return sum + ((o.precioCliente || 0) - (o.costoPropio || 0));
    }, 0);
    const ventasDelMes = currentMonthOrders.filter(o => o.estado === 'entregado').length;

    const html = `
      <div class="page-header">
        <h1 class="page-title">Dashboard</h1>
      </div>
      <div class="card-grid">
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">👥 Clientes</h2>
          </div>
          <div class="card-body">
            <p style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); color: var(--color-primary);">${totalClients}</p>
            <p>clientes registrados</p>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">📋 Órdenes</h2>
          </div>
          <div class="card-body">
            <p style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); color: var(--color-primary);">${totalOrders}</p>
            <p>órdenes totales</p>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">💰 Saldo Pendiente</h2>
          </div>
          <div class="card-body">
            <p style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); color: var(--color-warning);">${formatCurrency(totalPendiente)}</p>
            <p>por cobrar</p>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">🎯 Productos Vendidos</h2>
          </div>
          <div class="card-body">
            <p style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); color: var(--color-secondary);">${productosVendidos}</p>
            <p>órdenes entregadas</p>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">📊 Por Estado</h2>
          </div>
          <div class="card-body">
            <p><span class="badge badge-pedido">pedido</span> ${ordersByState.pedido}</p>
            <p><span class="badge badge-trabajando">trabajando</span> ${ordersByState.trabajando}</p>
            <p><span class="badge badge-terminado">terminado</span> ${ordersByState.terminado}</p>
            <p><span class="badge badge-entregado">entregado</span> ${ordersByState.entregado}</p>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">💵 Ganancia Total</h2>
          </div>
          <div class="card-body">
            <p style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); color: var(--color-success);">${formatCurrency(totalGanancia)}</p>
            <p>acumulada</p>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top: var(--space-lg);">
        <div class="card-header">
          <h2 class="card-title">📅 Ganancia por Mes</h2>
          <select id="month-filter" class="form-select" style="width: auto; min-width: 160px;">
            ${monthOptions}
          </select>
        </div>
        <div class="card-body" id="month-stats">
          <p><strong>Ganancia:</strong> <span style="color: var(--color-success); font-weight: var(--font-weight-bold);">${formatCurrency(gananciaDelMes)}</span></p>
          <p><strong>Productos vendidos:</strong> ${ventasDelMes}</p>
          <p><strong>Órdenes creadas:</strong> ${currentMonthOrders.length}</p>
        </div>
      </div>

      <div class="card-grid" style="margin-top: var(--space-lg);">
        <div class="card">
          <div class="card-body" style="text-align: center;">
            <a href="#/clientes/nuevo" class="btn btn-primary">+ Nuevo Cliente</a>
          </div>
        </div>
        <div class="card">
          <div class="card-body" style="text-align: center;">
            <a href="#/ordenes/nueva" class="btn btn-primary">+ Nueva Orden</a>
          </div>
        </div>
      </div>
    `;

    app.innerHTML = html;

    // Attach month filter handler
    const monthFilter = document.getElementById('month-filter');
    if (monthFilter) {
      monthFilter.addEventListener('change', () => {
        const [year, month] = monthFilter.value.split('-').map(Number);
        const filtered = orders.filter(o => {
          if (!o.creadoEn) return false;
          const fecha = o.creadoEn.seconds ? new Date(o.creadoEn.seconds * 1000) : new Date(o.creadoEn);
          return fecha.getMonth() === month && fecha.getFullYear() === year;
        });
        const ganancia = filtered.reduce((sum, o) => sum + ((o.precioCliente || 0) - (o.costoPropio || 0)), 0);
        const ventas = filtered.filter(o => o.estado === 'entregado').length;
        const statsEl = document.getElementById('month-stats');
        if (statsEl) {
          statsEl.innerHTML = `
            <p><strong>Ganancia:</strong> <span style="color: var(--color-success); font-weight: var(--font-weight-bold);">${formatCurrency(ganancia)}</span></p>
            <p><strong>Productos vendidos:</strong> ${ventas}</p>
            <p><strong>Órdenes creadas:</strong> ${filtered.length}</p>
          `;
        }
      });
    }
  } catch (error) {
    console.error('Error loading dashboard:', error);
    app.innerHTML = `<div class="empty-state"><p class="empty-state-text">Error al cargar dashboard</p></div>`;
    showToast('Error al cargar dashboard', 'error');
  }
}

// --- Mobile Menu ---

function initMobileMenu() {
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const sidebar = document.getElementById('sidebar');
  const menuToggle = document.getElementById('menu-toggle');
  const overlay = document.getElementById('sidebar-overlay');

  function openSidebar() {
    if (sidebar) sidebar.classList.add('sidebar-open');
    if (overlay) overlay.classList.add('active');
    if (mobileMenuBtn) mobileMenuBtn.setAttribute('aria-expanded', 'true');
  }

  function closeSidebar() {
    if (sidebar) sidebar.classList.remove('sidebar-open');
    if (overlay) overlay.classList.remove('active');
    if (mobileMenuBtn) mobileMenuBtn.setAttribute('aria-expanded', 'false');
  }

  if (mobileMenuBtn && sidebar) {
    mobileMenuBtn.addEventListener('click', () => {
      const isOpen = sidebar.classList.contains('sidebar-open');
      if (isOpen) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });
  }

  if (menuToggle) {
    menuToggle.addEventListener('click', () => {
      closeSidebar();
    });
  }

  // Close sidebar when clicking the overlay
  if (overlay) {
    overlay.addEventListener('click', () => {
      closeSidebar();
    });
  }

  // Close sidebar when a nav link is clicked (mobile)
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      if (sidebar && sidebar.classList.contains('sidebar-open')) {
        closeSidebar();
      }
    });
  });
}

// --- App Initialization ---

function initApp() {
  updateUIForAuthState();
  initMobileMenu();
  Router.init();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
