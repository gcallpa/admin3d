import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Router, setAuthenticated, isAuthenticated } from '../../public/js/app.js';

// Mock DOM environment
function setupDOM() {
  document.body.innerHTML = `
    <div id="toast-container"></div>
    <nav id="sidebar" class="sidebar hidden">
      <ul class="nav-list">
        <li><a href="#/dashboard" class="nav-link" data-route="dashboard">Dashboard</a></li>
        <li><a href="#/clientes" class="nav-link" data-route="clientes">Clientes</a></li>
        <li><a href="#/ordenes" class="nav-link" data-route="ordenes">Órdenes</a></li>
        <li><a href="#/calculadora" class="nav-link" data-route="calculadora">Calculadora</a></li>
        <li><a href="#/historial" class="nav-link" data-route="historial">Historial</a></li>
      </ul>
    </nav>
    <button id="mobile-menu-btn" class="mobile-menu-btn hidden"></button>
    <div id="sidebar-overlay" class="overlay"></div>
    <main id="app" class="main-content"></main>
    <div id="landing" class="landing"></div>
  `;
}

describe('Router', () => {
  beforeEach(() => {
    setupDOM();
    window.location.hash = '';
    // Reset auth state
    setAuthenticated(false);
  });

  describe('Route registration and matching', () => {
    it('registers and matches exact routes', () => {
      const { route } = Router.matchRoute('#/dashboard');
      expect(route).not.toBeNull();
    });

    it('matches dynamic routes with params', () => {
      const { route, params } = Router.matchRoute('#/clientes/abc123');
      expect(route).not.toBeNull();
      expect(params.id).toBe('abc123');
    });

    it('returns null for unregistered routes', () => {
      const { route } = Router.matchRoute('#/nonexistent');
      expect(route).toBeNull();
    });

    it('extracts params correctly from order detail route', () => {
      const { params } = Router.matchRoute('#/ordenes/order456');
      expect(params.id).toBe('order456');
    });

    it('does not match patterns with different segment counts', () => {
      const { route } = Router.matchRoute('#/clientes/abc/extra');
      expect(route).toBeNull();
    });
  });

  describe('Auth guard', () => {
    it('redirects to landing when accessing protected route without auth', () => {
      setAuthenticated(false);
      window.location.hash = '#/dashboard';
      Router.handleRouteChange();
      expect(window.location.hash).toBe('#/');
    });

    it('allows access to protected routes when authenticated', () => {
      setAuthenticated(true);
      window.location.hash = '#/clientes';
      Router.handleRouteChange();
      expect(window.location.hash).toBe('#/clientes');
    });

    it('redirects authenticated user from landing to dashboard', () => {
      setAuthenticated(true);
      window.location.hash = '#/';
      Router.handleRouteChange();
      expect(window.location.hash).toBe('#/dashboard');
    });
  });

  describe('UI state management', () => {
    it('shows landing and hides sidebar when not authenticated', () => {
      setAuthenticated(false);
      const landing = document.getElementById('landing');
      const sidebar = document.getElementById('sidebar');
      expect(landing.classList.contains('hidden')).toBe(false);
      expect(sidebar.classList.contains('hidden')).toBe(true);
    });

    it('hides landing and shows sidebar when authenticated', () => {
      setAuthenticated(true);
      const landing = document.getElementById('landing');
      const sidebar = document.getElementById('sidebar');
      expect(landing.classList.contains('hidden')).toBe(true);
      expect(sidebar.classList.contains('hidden')).toBe(false);
    });

    it('shows mobile menu button when authenticated', () => {
      setAuthenticated(true);
      const btn = document.getElementById('mobile-menu-btn');
      expect(btn.classList.contains('hidden')).toBe(false);
    });

    it('hides mobile menu button when not authenticated', () => {
      setAuthenticated(false);
      const btn = document.getElementById('mobile-menu-btn');
      expect(btn.classList.contains('hidden')).toBe(true);
    });
  });

  describe('Active nav link', () => {
    it('sets active class on matching nav link', () => {
      setAuthenticated(true);
      Router.updateActiveNav('#/dashboard');
      const dashLink = document.querySelector('[data-route="dashboard"]');
      expect(dashLink.classList.contains('active')).toBe(true);
    });

    it('removes active class from non-matching links', () => {
      setAuthenticated(true);
      Router.updateActiveNav('#/dashboard');
      const clientsLink = document.querySelector('[data-route="clientes"]');
      expect(clientsLink.classList.contains('active')).toBe(false);
    });
  });

  describe('Rendering', () => {
    it('renders HTML into the app container', () => {
      Router.render('<h1>Test View</h1>');
      const app = document.getElementById('app');
      expect(app.innerHTML).toBe('<h1>Test View</h1>');
    });

    it('renders view with dynamic params', () => {
      setAuthenticated(true);
      window.location.hash = '#/ordenes/test123';
      Router.handleRouteChange();
      const app = document.getElementById('app');
      // The order detail view is async and shows loading state first
      expect(app.innerHTML).toContain('Cargando');
    });
  });
});

describe('Auth state', () => {
  beforeEach(() => {
    setupDOM();
    window.location.hash = '';
  });

  it('starts as not authenticated', () => {
    setAuthenticated(false);
    expect(isAuthenticated()).toBe(false);
  });

  it('can be set to authenticated', () => {
    setAuthenticated(true);
    expect(isAuthenticated()).toBe(true);
  });
});
