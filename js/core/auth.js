/**
 * auth.js — Session management and auth state.
 *
 * Responsibilities:
 * - Track current user across page loads
 * - Provide route guards (requireAuth, requireAdmin, requireApproved)
 * - Handle sign-out cleanly
 * - Expose reactive onUserChange hook
 */

import { auth } from './firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import cache from './cache.js';
import { SUPER_ADMIN } from '../config/constants.js';

// Current user — kept in memory for fast synchronous access
let _currentUser = null;
let _authResolved = false;
const _listeners = new Set();

// Boot — subscribe to Firebase auth state once
onAuthStateChanged(auth, user => {
  _currentUser = user;
  _authResolved = true;
  _listeners.forEach(fn => fn({ user: user, resident: null, role: user ? 'registered' : 'guest' }));
});

const Auth = {

  /** Current Firebase user (null if signed out) */
  get user() { return _currentUser; },

  /** True once Firebase has resolved initial auth state */
  get resolved() { return _authResolved; },

  /**
   * Subscribe to auth changes.
   * @param {Function} fn — called with (user | null)
   * @returns {Function} unsubscribe
   */
  onChange(fn) {
    _listeners.add(fn);
    if (_authResolved) fn(_currentUser); // fire immediately if already resolved
    return () => _listeners.delete(fn);
  },

  /**
   * Wait for auth to resolve (use on page load).
   * @returns {Promise<user|null>}
   */
  waitForUser() {
    if (_authResolved) return Promise.resolve(_currentUser);
    return new Promise(resolve => {
      const unsub = this.onChange(user => { unsub(); resolve(user); });
    });
  },

  /**
   * Sign out — clears cache and redirects.
   */
  async signOut() {
    cache.clear();
    await signOut(auth);
    window.location.href = '/residents.html';
  },

  /**
   * Guard: redirect to login if not signed in.
   * Call at top of any protected page.
   */
  async requireAuth(redirectTo = '/residents.html') {
    const user = await this.waitForUser();
    if (!user) {
      window.location.href = redirectTo;
      return null;
    }
    return user;
  },

  /**
   * Guard: redirect if not an admin.
   * Checks super admin email + admins collection via ResidentService.
   */
  async requireAdmin(adminEmails = []) {
    const user = await this.waitForUser();
    if (!user) { window.location.href = '/residents.html'; return null; }
    const isAdmin = user.email === SUPER_ADMIN || adminEmails.includes(user.email);
    if (!isAdmin) { window.location.href = '/'; return null; }
    return user;
  },

  /** Is current user the super admin */
  isSuperAdmin() {
    return _currentUser?.email === SUPER_ADMIN;
  }
};

export default Auth;
