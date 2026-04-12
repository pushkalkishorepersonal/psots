/**
 * FlatSelector.js — Tower / Floor / Unit dropdowns with live validation.
 *
 * Usage:
 *   FlatSelector.init('flatSelectorContainer', {
 *     onChange: ({ tower, floor, unit, flatNumber, valid }) => {}
 *   })
 */

import FlatService from '../../services/flat.service.js';
import { VALID_TOWERS } from '../../config/constants.js';

const FlatSelector = {
  /**
   * @param {string} containerId
   * @param {{ onChange: Function, onMemberCheck: Function }} options
   */
  init(containerId, { onChange, onMemberCheck } = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="field">
        <label class="field-label">Tower</label>
        <select class="field-select" id="fs_tower">
          <option value="">Select Tower</option>
          ${VALID_TOWERS.sort((a,b)=>a-b).map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
      </div>
      <div class="field-row-3">
        <div class="field">
          <label class="field-label">Floor</label>
          <select class="field-select" id="fs_floor" disabled>
            <option value="">Floor</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label">Unit</label>
          <select class="field-select" id="fs_unit" disabled>
            <option value="">Unit</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label">Move-in Date</label>
          <input type="date" class="field-input" id="fs_movein" max="${new Date().toISOString().split('T')[0]}"/>
        </div>
      </div>
      <div class="flat-preview" id="fs_preview">
        <div>
          <div style="font-size:9px;color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:1px;margin-bottom:1px">Flat Number</div>
          <div class="flat-preview-num" id="fs_flatnum">—</div>
        </div>
        <div class="flat-preview-desc" id="fs_flatdesc">—</div>
      </div>
      <div id="fs_memberinfo" style="margin-top:8px"></div>`;

    const towerSel = document.getElementById('fs_tower');
    const floorSel = document.getElementById('fs_floor');
    const unitSel  = document.getElementById('fs_unit');

    towerSel.addEventListener('change', () => {
      const tower = parseInt(towerSel.value);
      if (!tower) { floorSel.disabled = true; unitSel.disabled = true; return; }

      floorSel.innerHTML = '<option value="">Floor</option>';
      FlatService.getFloors(tower).forEach(f => {
        floorSel.innerHTML += `<option value="${f}">${f}</option>`;
      });
      floorSel.disabled = false;

      unitSel.innerHTML  = '<option value="">Unit</option>';
      FlatService.getUnits(tower).forEach(u => {
        unitSel.innerHTML += `<option value="${u}">${u}</option>`;
      });
      unitSel.disabled = false;

      refreshPreview();
    });

    floorSel.addEventListener('change', refreshPreview);
    unitSel.addEventListener('change',  refreshPreview);

    async function refreshPreview() {
      const t = towerSel.value, f = floorSel.value, u = unitSel.value;
      const preview  = document.getElementById('fs_preview');
      const memberEl = document.getElementById('fs_memberinfo');

      if (!t || !f || !u) {
        preview.classList.remove('show');
        memberEl.innerHTML = '';
        return;
      }

      const result = FlatService.validate(t, f, u);
      if (!result.valid) {
        memberEl.innerHTML = `<div class="info-box warn">${result.error}</div>`;
        preview.classList.remove('show');
        return;
      }

      document.getElementById('fs_flatnum').textContent  = result.flatNumber;
      document.getElementById('fs_flatdesc').textContent = `Tower ${t} · Floor ${f} · Unit ${u}`;
      preview.classList.add('show');

      // Check members
      if (onMemberCheck) {
        memberEl.innerHTML = '<div style="font-size:11.5px;color:var(--muted)">Checking flat occupancy...</div>';
        try {
          await onMemberCheck(result.flatNumber, memberEl);
        } catch (_) {
          memberEl.innerHTML = '';
        }
      }

      onChange?.({ tower: parseInt(t), floor: parseInt(f), unit: parseInt(u), flatNumber: result.flatNumber, valid: true });
    }

    return {
      getValue() {
        const t = towerSel.value, f = floorSel.value, u = unitSel.value;
        if (!t || !f || !u) return null;
        const result = FlatService.validate(t, f, u);
        return result.valid ? { tower: parseInt(t), floor: parseInt(f), unit: parseInt(u), flatNumber: result.flatNumber, moveIn: document.getElementById('fs_movein').value } : null;
      },
      reset() {
        towerSel.value = ''; floorSel.value = ''; unitSel.value = '';
        floorSel.disabled = true; unitSel.disabled = true;
        document.getElementById('fs_preview').classList.remove('show');
        document.getElementById('fs_memberinfo').innerHTML = '';
      }
    };
  }
};

export default FlatSelector;
