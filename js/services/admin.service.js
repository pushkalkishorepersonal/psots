/**
 * admin.service.js — Admin panel operations.
 * Approval, rejection, admin management, audit log reads.
 */

import { db }                                               from '../core/firebase.js';
import { collection, getDocs, doc, updateDoc, setDoc,
         deleteDoc, onSnapshot, query, orderBy,
         limit, serverTimestamp, addDoc }                   from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import cache                                                from '../core/cache.js';
import logger                                               from '../core/logger.js';
import { COLLECTIONS, TTL_15_MIN, SUPER_ADMIN,
         ACCOUNT_STATUSES }                                 from '../config/constants.js';

const AdminService = {

  /**
   * Check if an email is an admin (super admin or in admins collection).
   * Cache-first — admin list doesn't change often.
   */
  async isAdmin(email) {
    if (!email) return false;
    if (email === SUPER_ADMIN) return true;
    const admins = await this.getAdmins();
    return admins.some(a => a.email === email);
  },

  /**
   * Get all admins. Cache-first (15 min TTL).
   */
  async getAdmins() {
    const key = cache.keys.admins();
    const hit = cache.get(key);
    if (hit) return hit;

    try {
      const snap = await getDocs(collection(db, COLLECTIONS.ADMINS));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      cache.set(key, list, TTL_15_MIN);
      return list;
    } catch (e) {
      throw new Error(logger.error(e, 'AdminService.getAdmins'));
    }
  },

  /**
   * Add a new admin. Super admin only.
   */
  async addAdmin(email, addedByEmail) {
    try {
      await addDoc(collection(db, COLLECTIONS.ADMINS), {
        email,
        addedBy:   addedByEmail,
        addedAt:   serverTimestamp(),
        isActive:  true,
      });
      cache.invalidate(cache.keys.admins());
      logger.audit('admin_added', { name: email, adminEmail: addedByEmail });
    } catch (e) {
      throw new Error(logger.error(e, 'AdminService.addAdmin'));
    }
  },

  /**
   * Remove admin. Super admin only.
   */
  async removeAdmin(adminDocId, email, removedByEmail) {
    try {
      await deleteDoc(doc(db, COLLECTIONS.ADMINS, adminDocId));
      cache.invalidate(cache.keys.admins());
      logger.audit('admin_removed', { name: email, adminEmail: removedByEmail });
    } catch (e) {
      throw new Error(logger.error(e, 'AdminService.removeAdmin'));
    }
  },

  /**
   * Approve a resident.
   */
  async approve(uid, name, adminEmail, flatNumber) {
    try {
      await updateDoc(doc(db, COLLECTIONS.RESIDENTS, uid), {
        status:          ACCOUNT_STATUSES.APPROVED,
        isActive:        true,
        'badges.blueTick': true,
        approvedAt:      serverTimestamp(),
        approvedBy:      adminEmail,
        rejectionReason: null,
        updatedAt:       serverTimestamp(),
      });
      cache.invalidate(cache.keys.resident(uid));
      logger.audit('approved', { uid, name, flatNumber, adminEmail });
    } catch (e) {
      throw new Error(logger.error(e, 'AdminService.approve'));
    }
  },

  /**
   * Reject a resident with reason (category + optional note).
   */
  async reject(uid, name, adminEmail, flatNumber, reasonCategory, reasonNote = '') {
    try {
      const fullReason = reasonNote.trim()
        ? `${reasonCategory} — ${reasonNote.trim()}`
        : reasonCategory;

      await updateDoc(doc(db, COLLECTIONS.RESIDENTS, uid), {
        status:              ACCOUNT_STATUSES.REJECTED,
        isActive:            false,
        'badges.blueTick':   false,
        rejectionReason:     fullReason,
        rejectionCategory:   reasonCategory,
        rejectedAt:          serverTimestamp(),
        rejectedBy:          adminEmail,
        updatedAt:           serverTimestamp(),
      });
      cache.invalidate(cache.keys.resident(uid));
      logger.audit('rejected', { uid, name, flatNumber, adminEmail, reason: fullReason });
    } catch (e) {
      throw new Error(logger.error(e, 'AdminService.reject'));
    }
  },

  /**
   * Mark resident as moved out.
   */
  async markMovedOut(uid, name, adminEmail, flatNumber, reason = '') {
    try {
      await updateDoc(doc(db, COLLECTIONS.RESIDENTS, uid), {
        status:            ACCOUNT_STATUSES.INACTIVE,
        isActive:          false,
        movedOut:          true,
        movedOutDate:      new Date().toISOString(),
        movedOutReason:    reason,
        'badges.blueTick': false,
        updatedAt:         serverTimestamp(),
      });
      cache.invalidate(cache.keys.resident(uid));
      logger.audit('moved_out', { uid, name, flatNumber, adminEmail, reason });
    } catch (e) {
      throw new Error(logger.error(e, 'AdminService.markMovedOut'));
    }
  },

  /**
   * Resolve appeal — approve or reject.
   */
  async resolveAppeal(appealId, residentUid, decision, adminEmail, note = '') {
    try {
      await updateDoc(doc(db, COLLECTIONS.APPEALS, appealId), {
        status:          decision, // 'approved' or 'rejected'
        resolvedAt:      serverTimestamp(),
        resolvedBy:      adminEmail,
        adminNote:       note,
      });

      if (decision === 'approved') {
        await updateDoc(doc(db, COLLECTIONS.RESIDENTS, residentUid), {
          status:   ACCOUNT_STATUSES.PENDING,
          updatedAt: serverTimestamp(),
        });
        cache.invalidate(cache.keys.resident(residentUid));
      }

      logger.audit('appeal_resolved', { appealId, residentUid, decision, adminEmail });
    } catch (e) {
      throw new Error(logger.error(e, 'AdminService.resolveAppeal'));
    }
  },

  /**
   * Subscribe to residents collection (realtime).
   * Returns unsubscribe function.
   */
  subscribeResidents(callback) {
    return onSnapshot(collection(db, COLLECTIONS.RESIDENTS), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(list);
    });
  },

  /**
   * Subscribe to admins collection (realtime).
   */
  subscribeAdmins(callback) {
    return onSnapshot(collection(db, COLLECTIONS.ADMINS), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      cache.set(cache.keys.admins(), list, TTL_15_MIN);
      callback(list);
    });
  },

  /**
   * Subscribe to audit log (realtime, last 50).
   */
  subscribeAuditLog(callback) {
    const q = query(
      collection(db, COLLECTIONS.AUDIT_LOG),
      orderBy('timestamp', 'desc'),
      limit(50)
    );
    return onSnapshot(q, snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  },
};

export default AdminService;
