// ============================================================
// js/pages/admin/index.js
// Admin panel orchestrator — tabs, auth guard, all admin ops
// ============================================================

import { auth }            from '../../core/firebase.js';
import { session }         from '../../core/auth.js';
import { logger }          from '../../core/logger.js';
import { Toast }           from '../../components/shared/Toast.js';
import { adminService }    from '../../services/admin.service.js';
import { SUPER_ADMIN, REJECTION_REASONS } from '../../config/constants.js';
import {
  GoogleAuthProvider, signInWithPopup, signOut
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// ── STATE ─────────────────────────────────────────────────
let _allResidents  = [];
let _currentFilter = 'all';
let _pendingReject = null;  // { uid, name }
let _unsubscribers = [];    // realtime listeners to clean up

// ── AUTH GUARD ────────────────────────────────────────────
session.onChange(({ user, role }) => {
  if (!user) {
    _showLogin(); return;
  }
  if (role !== 'admin' && role !== 'superadmin') {
    document.getElementById('loginErr').className = 'alert alert-error show';
    document.getElementById('loginErr').textContent = '⛔ This account is not an admin.';
    signOut(auth);
    return;
  }
  _showPanel(user, role);
});

// ── LOGIN ─────────────────────────────────────────────────
document.getElementById('btnAdminLogin').onclick = async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { logger.error('adminLogin', e); }
};

function _showLogin() {
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('adminApp').classList.add('hidden');
}

function _showPanel(user, role) {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('adminApp').classList.remove('hidden');
  document.getElementById('adminEmailDisp').textContent = user.email;
  if (role === 'superadmin') document.getElementById('addAdminSection').classList.remove('hidden');
  _initTabs();
  _loadAll();
}

// ── SIGN OUT ──────────────────────────────────────────────
document.getElementById('btnAdminLogout').onclick = () => {
  _unsubscribers.forEach(u => u());
  session.signOut();
};

// ── TABS ──────────────────────────────────────────────────
function _initTabs() {
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const pageId = 'page' + tab.dataset.page.charAt(0).toUpperCase() + tab.dataset.page.slice(1);
      document.getElementById(pageId)?.classList.add('active');
    };
  });
}

// ── LOAD ALL DATA ─────────────────────────────────────────
function _loadAll() {
  // Residents — realtime
  const unsubRes = adminService.subscribeResidents(data => {
    _allResidents = data;
    _updateStats();
    _renderResidents();
    _renderFlats();
  });

  // Admins — realtime
  const unsubAdm = adminService.subscribeAdmins(data => _renderAdmins(data));

  // Audit — realtime
  const unsubAudit = adminService.subscribeAudit(data => _renderAudit(data));

  _unsubscribers = [unsubRes, unsubAdm, unsubAudit];

  // Filters
  document.getElementById('resSearch').oninput = _renderResidents;
  document.getElementById('towerFilter').onchange = _renderResidents;
  document.getElementById('typeFilter').onchange = _renderResidents;
  document.querySelectorAll('.tab-btn').forEach(t => {
    t.onclick = () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      t.classList.add('active');
      _currentFilter = t.dataset.filter;
      _renderResidents();
    };
  });

  // Reject modal
  const cats = document.getElementById('rejectCategory');
  REJECTION_REASONS.forEach(r => cats.innerHTML += `<option value="${r}">${r}</option>`);
  document.getElementById('btnCancelReject').onclick = _closeRejectModal;
  document.getElementById('btnConfirmReject').onclick = _confirmReject;

  // Add admin
  document.getElementById('btnAddAdmin')?.addEventListener('click', _handleAddAdmin);

  // Load appeals
  _loadAppeals();
}

// ── STATS ─────────────────────────────────────────────────
function _updateStats() {
  document.getElementById('stTotal').textContent = _allResidents.length;
  document.getElementById('stPend').textContent  = _allResidents.filter(r =>
    ['pending','pending_primary','pending_owner'].includes(r.status)).length;
  document.getElementById('stAppr').textContent  = _allResidents.filter(r => r.status === 'approved').length;
  document.getElementById('stRejt').textContent  = _allResidents.filter(r => r.status === 'rejected').length;
}

// ── RESIDENTS TABLE ───────────────────────────────────────
function _renderResidents() {
  const search = document.getElementById('resSearch').value.toLowerCase();
  const tower  = document.getElementById('towerFilter').value;
  const type   = document.getElementById('typeFilter').value;

  let data = _allResidents.filter(r => {
    if (_currentFilter !== 'all' && r.status !== _currentFilter) return false;
    if (tower && String(r.tower) !== tower) return false;
    if (type  && r.residentType !== type)   return false;
    if (search) {
      const hay = `${r.name||''} ${r.flatNumber||''} ${r.phone||''} ${r.email||''}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  }).sort((a, b) => {
    const order = { pending:0, pending_owner:1, pending_primary:2, approved:3, rejected:4, inactive:5 };
    return (order[a.status] ?? 9) - (order[b.status] ?? 9);
  });

  const tbody = document.getElementById('resTableBody');
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="table-empty">📭 No residents found</div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(r => {
    const date = r.createdAt?.toDate?.()?.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'2-digit' }) || '—';
    const statusHtml = _statusBadge(r.status);
    const leaseNote  = r.residentType === 'tenant' && r.leaseEndDate
      ? `<div class="t-small">Lease: ${r.leaseEndDate}</div>` : '';
    const rejReason  = r.rejectionReason
      ? `<div style="font-size:11px;color:var(--red);margin-top:3px">${r.rejectionReason}</div>` : '';

    let actions = '';
    if (['pending','pending_owner','pending_primary'].includes(r.status)) {
      actions = `<button class="btn btn-jade btn-sm" style="margin-bottom:4px" onclick="approveRes('${r.id}','${_esc(r.name)}')">✓ Approve</button>
                 <button class="btn btn-danger btn-sm" onclick="openReject('${r.id}','${_esc(r.name)}')">✗ Reject</button>`;
    } else if (r.status === 'approved') {
      actions = `<button class="btn btn-outline btn-sm" style="margin-bottom:4px;color:var(--amber);border-color:var(--amber)" onclick="openReject('${r.id}','${_esc(r.name)}')">Revoke</button>
                 <button class="btn btn-outline btn-sm" onclick="markMovedOut('${r.id}','${_esc(r.name)}')">Moved Out</button>`;
    } else if (r.status === 'rejected') {
      actions = `<button class="btn btn-jade btn-sm" onclick="approveRes('${r.id}','${_esc(r.name)}')">Re-approve</button>`;
    }

    return `<tr>
      <td>
        <div style="font-weight:600;font-size:13px">${r.name || '—'}${r.badges?.blueTick ? ' <span class="blue-tick">✓</span>' : ''}</div>
        <div class="t-small">${r.phone || ''}${r.email ? ' · ' + r.email : ''}</div>
      </td>
      <td>
        <div style="font-family:var(--font-serif);font-size:1.05rem;font-weight:500;color:var(--jade)">${r.flatNumber || '—'}</div>
        <div class="t-small">T${r.tower} · F${r.floor} · U${r.unit}</div>
      </td>
      <td>
        <span class="badge ${r.residentType === 'owner' ? 'badge-owner' : 'badge-tenant'}">${r.residentType || '—'}</span>
        <span class="badge ${r.role === 'primary' ? 'badge-primary' : 'badge-blue'}" style="margin-top:3px">${r.role || '—'}</span>
        ${r.isNRI ? '<span class="badge badge-nri">NRI</span>' : ''}
      </td>
      <td>${statusHtml}${rejReason}</td>
      <td>${leaseNote || '<span class="t-small">—</span>'}</td>
      <td class="t-small">${date}</td>
      <td><div style="display:flex;flex-direction:column;gap:4px">${actions}</div></td>
    </tr>`;
  }).join('');
}

// ── FLATS TABLE ───────────────────────────────────────────
function _renderFlats() {
  const search = document.getElementById('flatSearch')?.value.toLowerCase() || '';
  const flatMap = {};
  _allResidents.forEach(r => {
    if (!r.flatNumber) return;
    if (!flatMap[r.flatNumber]) flatMap[r.flatNumber] = { flatNumber: r.flatNumber, tower: r.tower, residents: [] };
    flatMap[r.flatNumber].residents.push(r);
  });

  let flats = Object.values(flatMap).filter(f =>
    !search || f.flatNumber.includes(search) || String(f.tower).includes(search)
  ).sort((a, b) => a.flatNumber.localeCompare(b.flatNumber));

  const tbody = document.getElementById('flatTableBody');
  if (!flats.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="table-empty">No flats found</div></td></tr>`;
    return;
  }

  tbody.innerHTML = flats.map(f => {
    const owner   = f.residents.find(r => r.residentType === 'owner' && r.status === 'approved');
    const tenants = f.residents.filter(r => r.residentType === 'tenant' && r.status === 'approved');
    const pending = f.residents.filter(r => ['pending','pending_owner','pending_primary'].includes(r.status));
    const status  = pending.length
      ? `<span class="badge badge-pending">⏳ ${pending.length} Pending</span>`
      : owner ? '<span class="badge badge-approved">✅ Active</span>'
      : '<span class="badge badge-inactive">⚫ No Owner</span>';

    return `<tr>
      <td style="font-family:var(--font-serif);font-size:1.05rem;font-weight:500;color:var(--jade)">${f.flatNumber}</td>
      <td>Tower ${f.tower}</td>
      <td>${f.residents.length} / 4</td>
      <td>${owner ? owner.name + (owner.badges?.blueTick ? ' ✓' : '') : '<span class="t-small">Not registered</span>'}</td>
      <td>${tenants.length ? tenants.map(t => t.name).join(', ') : '<span class="t-small">—</span>'}</td>
      <td>${status}</td>
      <td><button class="btn btn-outline btn-sm" onclick="viewFlatHistory('${f.flatNumber}')">History</button></td>
    </tr>`;
  }).join('');
}

// ── APPEALS ───────────────────────────────────────────────
async function _loadAppeals() {
  const { db } = await import('../../core/firebase.js');
  const { collection, getDocs, query, where } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
  const { onSnapshot } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
  const q = query(collection(db, 'appeals'), where('status', '==', 'pending'));
  onSnapshot(q, snap => {
    const appeals = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const list    = document.getElementById('appealsList');
    if (!appeals.length) { list.innerHTML = `<div class="table-empty">✅ No pending appeals</div>`; return; }
    list.innerHTML = appeals.map(a => `
      <div class="card" style="margin-bottom:1rem;padding:1.5rem">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:1rem">
          <div>
            <div style="font-weight:700;font-size:13.5px;margin-bottom:4px">${a.residentName} — Flat ${a.flatNumber}</div>
            <div class="t-small" style="margin-bottom:.8rem">Original rejection: <em>${a.originalRejectionReason}</em></div>
            <div style="background:var(--cream);border-radius:9px;padding:10px 13px;font-size:13px;line-height:1.65;color:var(--ink-soft)">${a.appealText}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
            <button class="btn btn-jade btn-sm" onclick="resolveAppeal('${a.id}','${a.residentUid}','approved')">✓ Approve</button>
            <button class="btn btn-danger btn-sm" onclick="resolveAppeal('${a.id}','${a.residentUid}','rejected')">✗ Reject Appeal</button>
          </div>
        </div>
      </div>`).join('');
  });
}

// ── ADMINS ────────────────────────────────────────────────
function _renderAdmins(admins) {
  const wrap = document.getElementById('adminListWrap');
  let html = `
    <div style="padding:1rem 1.2rem;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
      <div><div style="font-weight:700;font-size:13.5px">${SUPER_ADMIN}</div><div class="t-small">Super Admin · Permanent</div></div>
      <span class="badge badge-admin">SUPER</span>
    </div>`;
  html += admins.map(a => `
    <div style="padding:1rem 1.2rem;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-weight:700;font-size:13.5px">${a.email}</div>
        <div class="t-small">Added by ${a.addedBy || 'admin'}</div>
      </div>
      ${session.isSuperAdmin()
        ? `<button class="btn btn-outline btn-sm" style="color:var(--red);border-color:var(--red)" onclick="removeAdmin('${a.id}','${a.email}')">Remove</button>`
        : '<span class="badge badge-admin">ADMIN</span>'}
    </div>`).join('');
  wrap.innerHTML = html || '<div class="table-empty">No additional admins</div>';
}

async function _handleAddAdmin() {
  const email = document.getElementById('newAdminEmail').value.trim().toLowerCase();
  if (!email || !email.includes('@')) { Toast.error('Enter a valid email'); return; }
  if (email === SUPER_ADMIN) { Toast.error('Already super admin'); return; }
  const result = await adminService.addAdmin(email);
  result.ok
    ? (document.getElementById('newAdminEmail').value = '', Toast.success(`${email} added as admin`))
    : Toast.error('Failed to add admin');
}

// ── AUDIT LOG ─────────────────────────────────────────────
function _renderAudit(entries) {
  const icons = { approved:'✅', rejected:'❌', registration_submitted:'📝', admin_added:'👤', admin_removed:'🗑️', appeal_submitted:'📋', marked_moved_out:'🚚', self_moved_out:'🚚', deletion_requested:'🗑️' };
  document.getElementById('auditList').innerHTML = entries.map(a => {
    const dt = a.timestamp?.toDate?.()?.toLocaleString('en-IN') || '—';
    return `<div style="display:flex;align-items:flex-start;gap:12px;padding:10px;background:var(--white);border-radius:10px;border:1px solid var(--border);margin-bottom:8px">
      <div style="width:32px;height:32px;border-radius:8px;background:var(--cream);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">${icons[a.action] || '📋'}</div>
      <div>
        <div style="font-weight:700;font-size:12.5px;text-transform:uppercase;letter-spacing:.5px">${(a.action||'').replace(/_/g,' ')}</div>
        <div class="t-small">${a.name || a.flatNumber || ''} · by ${a.adminEmail || 'system'} · ${dt}${a.reason ? ' · ' + a.reason : ''}</div>
      </div>
    </div>`;
  }).join('') || '<div class="table-empty">No audit entries yet</div>';
}

// ── GLOBAL ACTION HANDLERS (called from table onclick) ────
window.approveRes = async (uid, name) => {
  const result = await adminService.approve(uid, name);
  result.ok ? Toast.success(`✅ ${name} approved`) : Toast.error('Approval failed');
};

window.openReject = (uid, name) => {
  _pendingReject = { uid, name };
  document.getElementById('rejectResName').textContent = name;
  document.getElementById('rejectCategory').value = '';
  document.getElementById('rejectNote').value = '';
  document.getElementById('rejectModal').classList.add('show');
};

window.markMovedOut = (uid, name) => {
  if (!confirm(`Mark ${name} as moved out?`)) return;
  adminService.markMovedOut(uid, name).then(r =>
    r.ok ? Toast.success(`${name} marked as moved out`) : Toast.error('Failed')
  );
};

window.removeAdmin = (id, email) => {
  if (!confirm(`Remove ${email} as admin?`)) return;
  adminService.removeAdmin(id, email).then(r =>
    r.ok ? Toast.success(`${email} removed`) : Toast.error('Failed')
  );
};

window.resolveAppeal = async (appealId, residentUid, decision) => {
  const result = await adminService.resolveAppeal(appealId, residentUid, decision);
  result.ok
    ? Toast.success(`Appeal ${decision}`)
    : Toast.error('Failed to resolve appeal');
};

window.viewFlatHistory = (flatNumber) => {
  const residents = _allResidents.filter(r => r.flatNumber === flatNumber);
  const content = residents.map(r => `
    <div style="padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="font-weight:600;font-size:13px">${r.name}</div>
      <div class="t-small">${r.residentType} · ${r.role} · ${_statusLabel(r.status)}</div>
      <div class="t-small">Joined: ${r.createdAt?.toDate?.()?.toLocaleDateString('en-IN') || '—'}</div>
    </div>`).join('');
  alert(`Flat ${flatNumber} History\n\n${residents.map(r => `${r.name} (${r.residentType}/${r.role}/${r.status})`).join('\n')}`);
};

function _closeRejectModal() {
  document.getElementById('rejectModal').classList.remove('show');
  _pendingReject = null;
}

async function _confirmReject() {
  if (!_pendingReject) return;
  const category = document.getElementById('rejectCategory').value;
  const note     = document.getElementById('rejectNote').value.trim();
  if (!category) { Toast.error('Select a rejection reason'); return; }
  const result = await adminService.reject(_pendingReject.uid, _pendingReject.name, category, note);
  _closeRejectModal();
  result.ok ? Toast.error(`❌ ${_pendingReject?.name} rejected`) : Toast.error('Rejection failed');
}

// ── HELPERS ───────────────────────────────────────────────
function _statusBadge(status) {
  const map = {
    pending:         '<span class="badge badge-pending">⏳ Pending Admin</span>',
    pending_owner:   '<span class="badge badge-blue">🔄 Pending Owner</span>',
    pending_primary: '<span class="badge badge-pending">⏳ Pending Primary</span>',
    approved:        '<span class="badge badge-approved">✅ Approved</span>',
    rejected:        '<span class="badge badge-rejected">❌ Rejected</span>',
    inactive:        '<span class="badge badge-inactive">⚫ Inactive</span>',
    suspended:       '<span class="badge badge-inactive">⚫ Suspended</span>',
  };
  return map[status] || `<span class="badge">${status}</span>`;
}

function _statusLabel(status) {
  const map = { pending:'Pending', pending_primary:'Pending Primary', pending_owner:'Pending Owner', approved:'Approved', rejected:'Rejected', inactive:'Inactive', suspended:'Suspended' };
  return map[status] || status;
}

function _esc(str) {
  return (str || '').replace(/'/g, "\\'");
}
