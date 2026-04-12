// ============================================================
// js/pages/profile/index.js
// Resident profile page — view, edit, consent, lifecycle
// ============================================================

import session               from '../../core/auth.js';
import logger                from '../../core/logger.js';
import { Toast }             from '../../components/shared/Toast.js';
import { Modal }             from '../../components/shared/Modal.js';
import residentService       from '../../services/resident.service.js';

const app = document.getElementById('app');

// ── GUARD: must be logged in ──────────────────────────────
session.onChange(({ user, resident, role }) => {
  if (!user) { window.location.href = '/residents.html'; return; }
  if (!resident) { window.location.href = '/residents.html'; return; }
  _render(user, resident, role);
});

document.getElementById('btnNavSignOut').onclick = () => session.signOut();

// ── RENDER FULL PROFILE PAGE ──────────────────────────────
function _render(user, d, role) {
  const tick      = d.badges?.blueTick ? '<span class="blue-tick">✓</span>' : '';
  const photo     = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(d.name)}&background=1a4a3a&color=f0d898&size=128`;
  const isApproved = d.status === 'approved';

  app.innerHTML = `
    <div style="background:var(--jade);height:180px;position:relative"></div>
    <div class="page-wide" style="margin-top:-80px;padding-bottom:4rem">

      <!-- PROFILE HEADER -->
      <div style="display:flex;align-items:flex-end;gap:1.5rem;margin-bottom:2rem;flex-wrap:wrap">
        <img src="${photo}" class="profile-avatar" style="width:100px;height:100px;border-width:4px" alt="${d.name}"/>
        <div style="flex:1;min-width:200px;padding-bottom:.5rem">
          <div class="profile-name-row">
            <span class="profile-name">${d.name}</span>
            ${tick}
            ${d.role === 'primary' ? '<span class="badge badge-primary">⭐ Primary</span>' : ''}
          </div>
          <div class="profile-flat-info">Flat ${d.flatNumber} · Tower ${d.tower} · Floor ${d.floor} · Unit ${d.unit}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <span class="badge ${d.residentType === 'owner' ? 'badge-owner' : 'badge-tenant'}">${d.residentType === 'owner' ? '🏠 Owner' : '🔑 Tenant'}</span>
            ${d.isNRI ? '<span class="badge badge-nri">🌍 NRI</span>' : ''}
            ${d.ownerStatus === 'non_resident' ? '<span class="badge badge-blue">🏢 Non-Resident</span>' : ''}
            <span class="badge ${_statusBadgeClass(d.status)}">${_statusLabel(d.status)}</span>
          </div>
        </div>
        ${isApproved ? `<button class="btn btn-outline btn-sm" id="btnEditProfile">✏️ Edit Profile</button>` : ''}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem">

        <!-- LEFT COLUMN -->
        <div>
          <!-- About -->
          <div class="card" style="margin-bottom:1.5rem">
            <div class="card-body">
              <p class="t-label" style="margin-bottom:.8rem">About</p>
              <p style="font-size:13.5px;color:var(--ink-soft);line-height:1.75">
                ${d.aboutMe || '<span style="color:var(--muted)">No bio yet.</span>'}
              </p>
              ${(d.linkedIn || d.website || d.instagram || d.twitter) ? `
              <div class="profile-social" style="margin-top:1rem">
                ${d.linkedIn ? `<a class="social-link" href="${d.linkedIn}" target="_blank">💼 LinkedIn</a>` : ''}
                ${d.website  ? `<a class="social-link" href="${d.website}"  target="_blank">🌐 Website</a>`  : ''}
                ${d.instagram ? `<a class="social-link" href="https://instagram.com/${d.instagram.replace('@','')}" target="_blank">📸 Instagram</a>` : ''}
                ${d.twitter  ? `<a class="social-link" href="https://x.com/${d.twitter.replace('@','')}" target="_blank">𝕏 Twitter</a>` : ''}
              </div>` : ''}
            </div>
          </div>

          <!-- Flat & Lease -->
          <div class="card" style="margin-bottom:1.5rem">
            <div class="card-body">
              <p class="t-label" style="margin-bottom:.8rem">Flat Details</p>
              ${_infoRow('Flat Number', d.flatNumber)}
              ${_infoRow('Tower', d.tower)}
              ${_infoRow('Move-in Date', d.moveInDate || '—')}
              ${_infoRow('Resident Since', _formatDate(d.memberSince?.toDate?.()))}
              ${d.residentType === 'tenant' ? `
                ${_infoRow('Lease Start', d.leaseStartDate || '—')}
                ${_infoRow('Lease End', d.leaseEndDate || '—')}
                ${_leaseStatus(d)}
              ` : ''}
              ${d.isNRI ? `${_infoRow('POA Name', d.poaName || '—')}${_infoRow('POA Phone', d.poaPhone || '—')}` : ''}
            </div>
          </div>

          <!-- Emergency Contact -->
          <div class="card">
            <div class="card-body">
              <p class="t-label" style="margin-bottom:.8rem">Emergency Contact</p>
              ${_infoRow('Name', d.emergencyContactName || '—')}
              ${_infoRow('Phone', d.emergencyContactPhone || '—')}
              ${_infoRow('Relation', d.emergencyContactRelation || '—')}
            </div>
          </div>
        </div>

        <!-- RIGHT COLUMN -->
        <div>
          <!-- Privacy & Consent -->
          <div class="card" style="margin-bottom:1.5rem">
            <div class="card-body">
              <p class="t-label" style="margin-bottom:.8rem">Privacy Settings</p>
              ${_consentRow('Phone visible to residents', d.consent?.phone)}
              ${_consentRow('Email visible to residents', d.consent?.email)}
              ${_consentRow('Telegram listing consent', d.consent?.tgListing)}
              ${_consentRow('Phone on listings', d.consent?.phoneListing)}
              ${_consentRow('Telegram notifications', d.consent?.tgNotif)}
              ${_consentRow('Email notifications', d.consent?.emailNotif)}
              <p class="t-small" style="margin-top:.8rem">Recorded: ${d.consent?.recordedAt ? new Date(d.consent.recordedAt).toLocaleDateString('en-IN') : '—'}</p>
              ${isApproved ? `<button class="btn btn-outline btn-sm" id="btnEditConsent" style="margin-top:.8rem;width:100%">Update Privacy Settings</button>` : ''}
            </div>
          </div>

          <!-- Family / Dependents -->
          <div class="card" style="margin-bottom:1.5rem">
            <div class="card-body">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.8rem">
                <p class="t-label">Family Members</p>
                ${isApproved ? `<button class="btn btn-outline btn-sm" id="btnAddDependent">+ Add</button>` : ''}
              </div>
              ${(d.dependents || []).length === 0
                ? `<p class="t-small">No family members added.</p>`
                : (d.dependents || []).map((dep, i) => `
                  <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
                    <div>
                      <div style="font-size:13px;font-weight:600">${dep.name}</div>
                      <div class="t-small">${dep.relation} · Age ${dep.age}</div>
                    </div>
                    <button class="btn btn-ghost btn-sm" data-dep-index="${i}" onclick="removeDependent(${i})">✕</button>
                  </div>`).join('')}
            </div>
          </div>

          <!-- Account Actions -->
          <div class="card">
            <div class="card-body">
              <p class="t-label" style="margin-bottom:.8rem">Account</p>
              ${d.residentType === 'owner' ? `
                <button class="btn btn-outline btn-sm" id="btnNudgeSnooze" style="width:100%;margin-bottom:8px">
                  🔔 Confirm Residency (Annual)
                </button>` : ''}
              <button class="btn btn-outline btn-sm" id="btnDownloadData" style="width:100%;margin-bottom:8px">
                📥 Download My Data
              </button>
              <button class="btn btn-outline btn-sm" id="btnMoveOut" style="width:100%;margin-bottom:8px;color:var(--amber);border-color:var(--amber)">
                🚚 I'm Moving Out
              </button>
              <button class="btn btn-outline btn-sm" id="btnDeleteAccount" style="width:100%;color:var(--red);border-color:var(--red)">
                🗑️ Delete Account
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>`;

  _bindActions(d);
}

// ── BIND ACTION BUTTONS ───────────────────────────────────
function _bindActions(d) {
  const user = session.getUser();

  document.getElementById('btnEditProfile')?.addEventListener('click', () => _openEditProfile(d));
  document.getElementById('btnEditConsent')?.addEventListener('click', () => _openEditConsent(d));
  document.getElementById('btnAddDependent')?.addEventListener('click', () => _openAddDependent(d));

  document.getElementById('btnNudgeSnooze')?.addEventListener('click', () => {
    Modal.confirm({
      title: 'Confirm Residency',
      body: `<p style="font-size:13.5px;color:var(--muted);line-height:1.7">Are you still a resident of PSOTS? Confirming keeps your account active for another year.</p>
             <p style="font-size:12px;color:var(--muted);margin-top:.8rem">Or choose to snooze this reminder for up to 5 years.</p>`,
      confirmLabel: '✅ Yes, I still live here',
      onConfirm: async () => {
        await residentService.updateProfile(user.uid, {
          lastNudgeConfirmed: new Date().toISOString(),
          nudgeSnoozedUntil: null,
          'badges.nudgePending': false,
        });
        Toast.success('Residency confirmed for another year.');
      }
    });
  });

  document.getElementById('btnDownloadData')?.addEventListener('click', async () => {
    const result = await residentService.requestDataExport(user.uid);
    result.ok
      ? Toast.success('Export requested. Email with download link within 24 hours.')
      : Toast.error('Request failed. Try again.');
  });

  document.getElementById('btnMoveOut')?.addEventListener('click', () => {
    Modal.confirm({
      title: '🚚 Moving Out?',
      body: `<p style="font-size:13.5px;color:var(--muted);line-height:1.7">Before we deactivate your account, you can download all your data.</p>
             <p style="font-size:12px;color:var(--red);margin-top:.8rem">Your listings, recommendations and community posts will be archived.</p>`,
      confirmLabel: 'Yes, I\'m Moving Out',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        await residentService.requestDataExport(user.uid, 'move_out');
        await residentService.updateProfile(user.uid, {
          movedOut: true,
          movedOutDate: new Date().toISOString(),
          status: 'inactive',
          isActive: false,
          'badges.blueTick': false,
        });
        await logger.audit('self_moved_out', { uid: user.uid, flatNumber: d.flatNumber });
        Toast.success('Move-out recorded. Download link sent to your email.');
        setTimeout(() => session.signOut(), 2000);
      }
    });
  });

  document.getElementById('btnDeleteAccount')?.addEventListener('click', () => {
    Modal.confirm({
      title: '🗑️ Delete Account',
      body: `<p style="font-size:13.5px;color:var(--muted);line-height:1.7">
               Your account will be queued for deletion after a <strong>7-day cooling-off period</strong>. You can cancel during this time.
             </p>
             <p style="font-size:12px;color:var(--red);margin-top:.8rem">
               All your data will be permanently deleted after 7 days. Download your data first.
             </p>`,
      confirmLabel: 'Request Deletion',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        await residentService.requestDataExport(user.uid, 'pre_deletion');
        await residentService.updateProfile(user.uid, {
          deletionRequested: true,
          deletionRequestedAt: new Date().toISOString(),
        });
        await logger.audit('deletion_requested', { uid: user.uid });
        Toast.warn('Deletion requested. You have 7 days to cancel. Data export link sent to email.');
      }
    });
  });
}

// ── EDIT PROFILE MODAL ────────────────────────────────────
function _openEditProfile(d) {
  Modal.form({
    title: 'Edit Profile',
    html: `
      <div class="field"><label class="field-label">About Me</label>
        <textarea class="field-textarea" id="me_about" maxlength="300">${d.aboutMe || ''}</textarea>
        <div class="field-hint">Max 300 characters</div></div>
      <div class="field-row field-row-2">
        <div class="field"><label class="field-label">LinkedIn</label><input class="field-input" id="me_li" type="url" value="${d.linkedIn || ''}"/></div>
        <div class="field"><label class="field-label">Website</label><input class="field-input" id="me_web" type="url" value="${d.website || ''}"/></div>
      </div>
      <div class="field-row field-row-2">
        <div class="field"><label class="field-label">Instagram</label><input class="field-input" id="me_ig" value="${d.instagram || ''}"/></div>
        <div class="field"><label class="field-label">Twitter/X</label><input class="field-input" id="me_tw" value="${d.twitter || ''}"/></div>
      </div>
      <div class="field"><label class="field-label">Emergency Contact Name</label><input class="field-input" id="me_emn" value="${d.emergencyContactName || ''}"/></div>
      <div class="field-row field-row-2">
        <div class="field"><label class="field-label">Emergency Phone</label><input class="field-input" id="me_emp" type="tel" value="${d.emergencyContactPhone || ''}"/></div>
        <div class="field"><label class="field-label">Relation</label><input class="field-input" id="me_emr" value="${d.emergencyContactRelation || ''}"/></div>
      </div>`,
    confirmLabel: 'Save Changes',
    onConfirm: async () => {
      const user = session.getUser();
      const result = await residentService.updateProfile(user.uid, {
        aboutMe:                  Modal.val('me_about'),
        linkedIn:                 Modal.val('me_li'),
        website:                  Modal.val('me_web'),
        instagram:                Modal.val('me_ig'),
        twitter:                  Modal.val('me_tw'),
        emergencyContactName:     Modal.val('me_emn'),
        emergencyContactPhone:    Modal.val('me_emp'),
        emergencyContactRelation: Modal.val('me_emr'),
      });
      Modal.close();
      if (result.ok) {
        await session.refreshResident();
        Toast.success('Profile updated.');
      } else { Toast.error('Update failed. Try again.'); }
    }
  });
}

// ── EDIT CONSENT MODAL ────────────────────────────────────
function _openEditConsent(d) {
  const c = d.consent || {};
  Modal.form({
    title: 'Privacy Settings',
    html: `
      <p style="font-size:12px;color:var(--muted);margin-bottom:1rem;line-height:1.6">Changes recorded with timestamp. Effective immediately.</p>
      ${_consentCheck('cp_phone',   'Show phone to verified residents',    c.phone)}
      ${_consentCheck('cp_email',   'Show email to verified residents',    c.email)}
      ${_consentCheck('cp_tglist',  'Telegram bot listing consent',        c.tgListing, true)}
      ${_consentCheck('cp_phonelist','Show phone on marketplace listings', c.phoneListing)}
      ${_consentCheck('cp_tgnotif', 'Telegram notifications',              c.tgNotif, true)}
      ${_consentCheck('cp_emailn',  'Email notifications',                 c.emailNotif, true)}`,
    confirmLabel: 'Save Preferences',
    onConfirm: async () => {
      const user = session.getUser();
      const newConsent = {
        ...c,
        phone:        document.getElementById('cp_phone').checked,
        email:        document.getElementById('cp_email').checked,
        tgListing:    document.getElementById('cp_tglist').checked,
        phoneListing: document.getElementById('cp_phonelist').checked,
        tgNotif:      document.getElementById('cp_tgnotif').checked,
        emailNotif:   document.getElementById('cp_emailn').checked,
        lastUpdated:  new Date().toISOString(),
      };
      const result = await residentService.updateProfile(user.uid, { consent: newConsent });
      Modal.close();
      if (result.ok) {
        await session.refreshResident();
        Toast.success('Privacy settings updated.');
      } else { Toast.error('Update failed. Try again.'); }
    }
  });
}

// ── ADD DEPENDENT ─────────────────────────────────────────
function _openAddDependent(d) {
  Modal.form({
    title: 'Add Family Member',
    html: `
      <div class="info-box" style="font-size:12px">Family members under 18 are added as dependents. They don't get separate logins.</div>
      <div class="field"><label class="field-label">Name</label><input class="field-input" id="dep_name" placeholder="Full name"/></div>
      <div class="field-row field-row-2">
        <div class="field"><label class="field-label">Relation</label>
          <select class="field-select" id="dep_rel">
            <option>Son</option><option>Daughter</option><option>Spouse</option>
            <option>Parent</option><option>Sibling</option><option>Other</option>
          </select>
        </div>
        <div class="field"><label class="field-label">Age</label><input class="field-input" id="dep_age" type="number" placeholder="Age" min="0" max="17"/></div>
      </div>`,
    confirmLabel: 'Add Member',
    onConfirm: async () => {
      const name = Modal.val('dep_name');
      const rel  = document.getElementById('dep_rel')?.value;
      const age  = parseInt(document.getElementById('dep_age')?.value);
      if (!name) { Toast.error('Enter a name'); return; }
      const user       = session.getUser();
      const current    = session.getResident();
      const dependents = [...(current.dependents || []), { name, relation: rel, age, addedAt: new Date().toISOString() }];
      const result     = await residentService.updateProfile(user.uid, { dependents });
      Modal.close();
      if (result.ok) { await session.refreshResident(); Toast.success(`${name} added.`); }
      else { Toast.error('Failed. Try again.'); }
    }
  });
}

// Make removeDependent globally callable (called from inline onclick)
window.removeDependent = async (index) => {
  const user       = session.getUser();
  const current    = session.getResident();
  const dependents = (current.dependents || []).filter((_, i) => i !== index);
  const result     = await residentService.updateProfile(user.uid, { dependents });
  if (result.ok) { await session.refreshResident(); Toast.success('Removed.'); }
  else { Toast.error('Failed.'); }
};

// ── HELPERS ───────────────────────────────────────────────
function _infoRow(label, value) {
  return `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px">
    <span style="color:var(--muted)">${label}</span>
    <span style="font-weight:600">${value}</span>
  </div>`;
}

function _consentRow(label, value) {
  return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:12.5px">
    <span style="color:var(--ink-soft)">${label}</span>
    <span style="${value ? 'color:var(--green)' : 'color:var(--muted)'}">${value ? '✓ On' : '✗ Off'}</span>
  </div>`;
}

function _consentCheck(id, label, checked, defaultOn = false) {
  return `<label class="consent-row">
    <input type="checkbox" id="${id}" ${checked || (defaultOn && checked === undefined) ? 'checked' : ''}/>
    <span>${label}</span>
  </label>`;
}

function _leaseStatus(d) {
  if (!d.leaseEndDate) return '';
  const end   = new Date(d.leaseEndDate);
  const now   = new Date();
  const days  = Math.ceil((end - now) / 86400000);
  if (days < 0) return _infoRow('Lease Status', '<span style="color:var(--red)">⚠️ Expired</span>');
  if (days <= 30) return _infoRow('Lease Status', `<span style="color:var(--amber)">⚠️ Expires in ${days} days</span>`);
  return _infoRow('Lease Status', `<span style="color:var(--green)">✓ Active (${days} days left)</span>`);
}

function _statusBadgeClass(status) {
  const map = { approved:'badge-approved', rejected:'badge-rejected', suspended:'badge-inactive', inactive:'badge-inactive' };
  return map[status] || 'badge-pending';
}

function _statusLabel(status) {
  const map = { pending:'⏳ Pending', pending_primary:'⏳ Pending Primary', pending_owner:'🔄 Pending Owner', approved:'✅ Verified', rejected:'❌ Rejected', suspended:'⚫ Suspended', inactive:'⚫ Inactive' };
  return map[status] || status;
}

function _formatDate(date) {
  if (!date) return '—';
  return date.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
}

// Nav scroll
window.addEventListener('scroll', () => {
  document.getElementById('mainNav')?.classList.toggle('scrolled', window.scrollY > 10);
});
