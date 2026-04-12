/**
 * resident.service.js — All resident data operations.
 * Always checks cache before hitting Firestore.
 * Always invalidates cache after writes.
 */

import { db }                                               from '../core/firebase.js';
import { doc, getDoc, setDoc, updateDoc, collection,
         query, where, getDocs, serverTimestamp, addDoc }   from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import cache                                                from '../core/cache.js';
import logger                                               from '../core/logger.js';
import { COLLECTIONS, TTL_5_MIN, ACCOUNT_STATUSES,
         MAX_RESIDENTS_PER_FLAT }                           from '../config/constants.js';

const ResidentService = {

  /**
   * Get resident by UID. Cache-first.
   */
  async get(uid) {
    const key = cache.keys.resident(uid);
    const hit = cache.get(key);
    if (hit) return hit;

    try {
      const snap = await getDoc(doc(db, COLLECTIONS.RESIDENTS, uid));
      if (!snap.exists()) return null;
      const data = { id: snap.id, ...snap.data() };
      cache.set(key, data, TTL_5_MIN);
      return data;
    } catch (e) {
      throw new Error(logger.error(e, 'ResidentService.get'));
    }
  },

  /**
   * Create new resident record.
   */
  async create(uid, data) {
    try {
      const record = {
        ...data,
        uid,
        isActive:         false,
        movedOut:         false,
        rejectionCount:   0,
        appealStatus:     'none',
        badges: {
          blueTick:    false,
          goldStar:    false,
          isAdmin:     false,
          nudgePending: false,
        },
        createdAt:    serverTimestamp(),
        updatedAt:    serverTimestamp(),
        memberSince:  serverTimestamp(),
      };
      await setDoc(doc(db, COLLECTIONS.RESIDENTS, uid), record);
      cache.invalidate(cache.keys.resident(uid));

      logger.audit('registration_submitted', {
        uid,
        flatNumber: data.flatNumber,
        role:       data.role,
        residentType: data.residentType,
      });

      return record;
    } catch (e) {
      throw new Error(logger.error(e, 'ResidentService.create'));
    }
  },

  /**
   * Update resident fields. Invalidates cache.
   */
  async update(uid, changes) {
    try {
      await updateDoc(doc(db, COLLECTIONS.RESIDENTS, uid), {
        ...changes,
        updatedAt: serverTimestamp(),
      });
      cache.invalidate(cache.keys.resident(uid));
    } catch (e) {
      throw new Error(logger.error(e, 'ResidentService.update'));
    }
  },

  /**
   * Check how many approved/pending residents exist for a flat.
   */
  async countForFlat(flatNumber) {
    try {
      const q = query(
        collection(db, COLLECTIONS.RESIDENTS),
        where('flatNumber', '==', flatNumber),
        where('status', 'in', [
          ACCOUNT_STATUSES.PENDING,
          ACCOUNT_STATUSES.PENDING_PRIMARY,
          ACCOUNT_STATUSES.PENDING_OWNER,
          ACCOUNT_STATUSES.APPROVED,
        ])
      );
      const snap = await getDocs(q);
      return snap.size;
    } catch (e) {
      throw new Error(logger.error(e, 'ResidentService.countForFlat'));
    }
  },

  /**
   * Get the primary resident of a flat (for secondary approval flow).
   */
  async getPrimaryForFlat(flatNumber) {
    try {
      const q = query(
        collection(db, COLLECTIONS.RESIDENTS),
        where('flatNumber', '==', flatNumber),
        where('role',       '==', 'primary'),
        where('status',     '==', ACCOUNT_STATUSES.APPROVED)
      );
      const snap = await getDocs(q);
      if (snap.empty) return null;
      return { id: snap.docs[0].id, ...snap.docs[0].data() };
    } catch (e) {
      throw new Error(logger.error(e, 'ResidentService.getPrimaryForFlat'));
    }
  },

  /**
   * Get the registered owner of a flat (for tenant validation).
   */
  async getOwnerForFlat(flatNumber) {
    try {
      const q = query(
        collection(db, COLLECTIONS.RESIDENTS),
        where('flatNumber',   '==', flatNumber),
        where('residentType', '==', 'owner'),
        where('status',       '==', ACCOUNT_STATUSES.APPROVED)
      );
      const snap = await getDocs(q);
      if (snap.empty) return null;
      return { id: snap.docs[0].id, ...snap.docs[0].data() };
    } catch (e) {
      throw new Error(logger.error(e, 'ResidentService.getOwnerForFlat'));
    }
  },

  /**
   * Check if flat is at max capacity.
   */
  async isFlatFull(flatNumber) {
    const count = await this.countForFlat(flatNumber);
    return count >= MAX_RESIDENTS_PER_FLAT;
  },

  /**
   * Submit appeal for rejected resident.
   */
  async submitAppeal(uid, flatNumber, originalReason, appealText, name) {
    try {
      // Check for existing appeal
      const q = query(
        collection(db, COLLECTIONS.APPEALS),
        where('residentUid', '==', uid)
      );
      const existing = await getDocs(q);
      if (!existing.empty) {
        throw new Error('You have already submitted an appeal. Only one appeal is allowed.');
      }

      await addDoc(collection(db, COLLECTIONS.APPEALS), {
        residentUid:              uid,
        residentName:             name,
        flatNumber,
        originalRejectionReason:  originalReason,
        appealText,
        status:                   'pending',
        isFirstAppeal:            true,
        submittedAt:              serverTimestamp(),
      });

      logger.audit('appeal_submitted', { uid, flatNumber });
    } catch (e) {
      throw new Error(e.message || logger.error(e, 'ResidentService.submitAppeal'));
    }
  },

  /**
   * Request data export before suspension/move-out.
   */
  async requestDataExport(uid, reason = 'user_request') {
    try {
      await setDoc(doc(db, COLLECTIONS.DATA_EXPORTS, uid), {
        uid,
        requestedAt:   serverTimestamp(),
        status:        'pending',
        triggerReason: reason,
        downloadUrl:   null,
        downloadedAt:  null,
      });
      logger.audit('data_export_requested', { uid, reason });
    } catch (e) {
      throw new Error(logger.error(e, 'ResidentService.requestDataExport'));
    }
  },
};

export default ResidentService;
