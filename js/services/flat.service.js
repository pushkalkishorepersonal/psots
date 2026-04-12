/**
 * flat.service.js — Flat validation and Firestore flat records.
 */

import { db }                                              from '../core/firebase.js';
import { doc, setDoc, getDoc, serverTimestamp }            from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import cache                                               from '../core/cache.js';
import logger                                              from '../core/logger.js';
import { TOWERS, VALID_TOWERS, SKIPPED_FLOORS, COLLECTIONS, TTL_5_MIN } from '../config/constants.js';

const FlatService = {

  /**
   * Validate flat details. Returns { valid, error } or { valid: true, flatNumber }.
   */
  validate(tower, floor, unit) {
    const t = parseInt(tower);
    const f = parseInt(floor);
    const u = parseInt(unit);

    if (!VALID_TOWERS.includes(t))    return { valid: false, error: `Tower ${t} does not exist in PSOTS.` };
    if (SKIPPED_FLOORS.includes(f))   return { valid: false, error: `Floor ${f} does not exist in any PSOTS tower.` };

    const cfg = TOWERS[t];
    if (f < 1 || f > cfg.maxFloor)   return { valid: false, error: `Tower ${t} has floors 1–${cfg.maxFloor} (no floor 13).` };
    if (u < 1 || u > cfg.maxUnit)    return { valid: false, error: `Tower ${t} has units 1–${cfg.maxUnit} per floor.` };

    return { valid: true, flatNumber: `${t}${f}${u}` };
  },

  /**
   * Build flat number string from parts.
   * Format: {tower}{floor}{unit} — no padding.
   * Example: Tower 15, Floor 16, Unit 7 = "15167"
   */
  buildFlatNumber(tower, floor, unit) {
    return `${parseInt(tower)}${parseInt(floor)}${parseInt(unit)}`;
  },

  /**
   * Parse flat number back to components.
   * Handles both 4-digit and 5-digit flat numbers.
   */
  parseFlatNumber(flatNumber) {
    // Find matching tower by trying valid tower prefixes
    const str = String(flatNumber);
    for (const tower of VALID_TOWERS.sort((a,b) => b-a)) { // longest first
      const prefix = String(tower);
      if (str.startsWith(prefix)) {
        const remainder = str.slice(prefix.length);
        // remainder is floorUnit — split at unit boundary
        // unit is 1 digit for most towers, up to 2 for T12/T14
        const cfg = TOWERS[tower];
        const unitDigits = cfg.maxUnit >= 10 ? 2 : 1;
        const floor = parseInt(remainder.slice(0, remainder.length - unitDigits));
        const unit  = parseInt(remainder.slice(-unitDigits));
        return { tower, floor, unit };
      }
    }
    return null;
  },

  /**
   * Get floor options for a tower (skipping floor 13).
   */
  getFloors(tower) {
    const cfg = TOWERS[parseInt(tower)];
    if (!cfg) return [];
    const floors = [];
    for (let f = 1; f <= cfg.maxFloor; f++) {
      if (!SKIPPED_FLOORS.includes(f)) floors.push(f);
    }
    return floors;
  },

  /**
   * Get unit options for a tower.
   */
  getUnits(tower) {
    const cfg = TOWERS[parseInt(tower)];
    if (!cfg) return [];
    return Array.from({ length: cfg.maxUnit }, (_, i) => i + 1);
  },

  /**
   * Upsert flat record in Firestore (create or update).
   * Called when a resident registers.
   */
  async upsert(flatNumber, changes = {}) {
    try {
      const parsed = this.parseFlatNumber(flatNumber);
      await setDoc(doc(db, COLLECTIONS.FLATS, flatNumber), {
        flatNumber,
        ...parsed,
        ...changes,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      cache.invalidate(cache.keys.flat(flatNumber));
    } catch (e) {
      // Non-critical — log silently
      logger.log('flat.upsert failed:', e);
    }
  },

  /**
   * Get flat record. Cache-first.
   */
  async get(flatNumber) {
    const key = cache.keys.flat(flatNumber);
    const hit = cache.get(key);
    if (hit) return hit;

    try {
      const snap = await getDoc(doc(db, COLLECTIONS.FLATS, flatNumber));
      if (!snap.exists()) return null;
      const data = { id: snap.id, ...snap.data() };
      cache.set(key, data, TTL_5_MIN);
      return data;
    } catch (e) {
      throw new Error(logger.error(e, 'FlatService.get'));
    }
  },
};

export default FlatService;
