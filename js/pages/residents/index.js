// ============================================================
// js/pages/residents/index.js
// Registration page orchestrator — 5 step flow
// Login → Type → Details → Privacy → Status
// ============================================================

import { session }           from '../../core/auth.js';
import { logger }            from '../../core/logger.js';
import { Toast }             from '../../components/shared/Toast.js';
import { Steps }             from '../../components/shared/Steps.js';
import FlatSelector      from '../../components/resident/FlatSelector.js';
import { residentService }   from '../../services/resident.service.js';
import { rateLimitService }  from '../../services/rateLimit.service.js';
import { flatService }       from '../../services/flat.service.js';
import { auth }              from '../../core/firebase.js';
import {
  GoogleAuthProvider, signInWithPopup,
  RecaptchaVerifier, signInWithPhoneNumber
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  WORKER_URL, ESCALATION_DAYS
} from '../../config/constants.js';

// ── STATE ─────────────────────────────────────────────────
let _step          = 1;
let _selType       = null;   // 'owner' | 'tenant'
let _selOwnerSt    = null;   // 'resident' | 'non_resident' | 'nri'
let _flatData      = {};
let _flatSelector  = null;
let _confirmResult = null;

const TOTAL_STEPS  = 5;

// ── AUTH LISTENER ─────────────────────────────────────────
session.onChange(({ user, resident }) => {
  if (!user)     { _goStep(1); return; }
  if (resident)  { _showStatus(resident); return; }
  _goStep(2);
  const el = document.getElementById('userDisp');
  if (el) el.textContent = user.displayName || user.email || user.phoneNumber || 'you';
});

// ── RENDER SHELL ──────────────────────────────────────────
document.getElementById('cardBody').innerHTML = `
  <div class="steps"
    data-step1="Login" data-step2="Type" data-step3="Details"
    data-step4="Privacy" data-step5="Done"
    id="stepsContainer"></div>

  <div class="rate-bar" id="rateBar">
    ⚠️ Too many attempts. Wait <span id="rateTimer">60</span>s.
  </div>

  <!-- PANEL 1: LOGIN -->
  <div class="reg-panel active" id="panel1">
    <div class="info-box">Sign in to register your flat. One account works across all PSOTS pages.</div>

    <button class="btn btn-google" id="btnGoogle">
      <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
      Continue with Google
    </button>

    <button class="btn btn-telegram" id="btnToggleTg" style="margin-top:8px">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.17 13.367l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.978.192z"/></svg>
      Continue with Telegram
    </button>

    <div id="tgSection" class="hidden" style="margin-top:1rem">
      <div class="info-box blue">Send <strong>/verify</strong> to <strong>@psots_telegram_bot</strong> on Telegram, then paste the OTP here.</div>
      <div class="field">
        <label class="field-label">Telegram Username</label>
        <input class="field-input" id="tgUser" type="text" placeholder="@yourusername"/>
      </div>
      <div class="field">
        <label class="field-label">OTP from Bot</label>
        <div class="otp-row">
          <input class="field-input" id="tgOTP" type="number" placeholder="——————"/>
          <button class="btn btn-outline btn-sm" id="btnReqTgOTP">Get OTP</button>
        </div>
      </div>
      <button class="btn btn-telegram" id="btnVerifyTg">Verify Telegram OTP</button>
      <button class="btn btn-ghost" id="btnHideTg">← Other options</button>
    </div>

    <div class="divider">or phone number</div>

    <div id="phoneSection">
      <div class="field">
        <label class="field-label">Mobile Number</label>
        <input class="field-input" id="phoneInp" type="tel" placeholder="+91 98765 43210"/>
        <div class="field-hint">With country code — e.g. +919876543210</div>
      </div>
      <div id="recaptcha-container"></div>
      <button class="btn btn-jade" id="btnSendOTP">Send OTP</button>
    </div>

    <div id="otpSection" class="hidden">
      <div class="info-box">OTP sent to <strong id="sentTo"></strong></div>
      <div class="field">
        <label class="field-label">Enter OTP</label>
        <div class="otp-row">
          <input class="field-input" id="otpInp" type="number" placeholder="——————"/>
          <button class="btn btn-outline btn-sm" id="btnChangeNum">Change</button>
        </div>
      </div>
      <button class="btn btn-jade" id="btnVerifyOTP">Verify OTP</button>
    </div>

    <div class="alert" id="loginAlert"></div>
  </div>

  <!-- PANEL 2: RESIDENT TYPE -->
  <div class="reg-panel" id="panel2">
    <div class="info-box">Signed in as <strong id="userDisp"></strong>. Select your resident type.</div>

    <div class="type-grid">
      <div class="type-card" id="tc_owner">
        <div class="type-card-icon">🏠</div>
        <div class="type-card-title">Owner</div>
        <div class="type-card-sub">I own this flat (self-occupied or rented out)</div>
      </div>
      <div class="type-card" id="tc_tenant">
        <div class="type-card-icon">🔑</div>
        <div class="type-card-title">Tenant</div>
        <div class="type-card-sub">I am renting / staying in this flat</div>
      </div>
    </div>

    <div id="ownerStatusSection" class="hidden">
      <p class="t-label" style="margin-bottom:.8rem">My living situation</p>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:1.2rem">
        <div class="type-card" id="os_resident" style="padding:.8rem">
          <div class="type-card-icon" style="font-size:1.2rem">🏡</div>
          <div class="type-card-title" style="font-size:12px">I live here</div>
        </div>
        <div class="type-card" id="os_non_resident" style="padding:.8rem">
          <div class="type-card-icon" style="font-size:1.2rem">🏢</div>
          <div class="type-card-title" style="font-size:12px">I don't live here</div>
        </div>
        <div class="type-card" id="os_nri" style="padding:.8rem">
          <div class="type-card-icon" style="font-size:1.2rem">🌍</div>
          <div class="type-card-title" style="font-size:12px">NRI Owner</div>
        </div>
      </div>
    </div>

    <label class="consent-row" style="margin-bottom:1rem">
      <input type="checkbox" id="isPG"/>
      <span>This flat has a <strong>PG / Co-living</strong> arrangement</span>
    </label>

    <button class="btn btn-jade" id="btnTypeNext" disabled>Next → Flat Details</button>
    <div class="alert" id="typeAlert"></div>
  </div>

  <!-- PANEL 3: FLAT DETAILS -->
  <div class="reg-panel" id="panel3">
    <div class="alert" id="detailsAlert"></div>

    <div class="field">
      <label class="field-label">Full Name</label>
      <input class="field-input" id="resName" placeholder="As registered in MyGate"/>
    </div>

    <div id="flatSelectorMount"></div>

    <div class="field">
      <label class="field-label">Move-in Date</label>
      <input class="field-input" id="moveInDate" type="date"/>
    </div>

    <!-- Tenant fields -->
    <div id="tenantFields" class="hidden">
      <p class="t-label" style="margin:1rem 0 .8rem">Lease Details</p>
      <div class="field-row field-row-2">
        <div class="field"><label class="field-label">Lease Start</label><input class="field-input" id="leaseStart" type="date"/></div>
        <div class="field"><label class="field-label">Lease End</label><input class="field-input" id="leaseEnd" type="date"/></div>
      </div>
      <div class="field">
        <label class="field-label">Owner's Name (if known)</label>
        <input class="field-input" id="ownerName" placeholder="Your landlord's name"/>
      </div>
      <div class="field">
        <label class="field-label">Owner's Contact (if known)</label>
        <input class="field-input" id="ownerPhone" type="tel" placeholder="+91 9876543210"/>
      </div>
      <div class="info-box blue">If your owner is registered on PSOTS, they will validate your tenancy. Otherwise admin verifies manually.</div>
    </div>

    <!-- NRI fields -->
    <div id="nriFields" class="hidden">
      <p class="t-label" style="margin:1rem 0 .8rem">POA (Local Representative) Details</p>
      <div class="info-box">As an NRI owner, provide your local POA contact — they receive nudges on your behalf.</div>
      <div class="field-row field-row-2">
        <div class="field"><label class="field-label">POA Name</label><input class="field-input" id="poaName" placeholder="Representative name"/></div>
        <div class="field"><label class="field-label">POA Phone</label><input class="field-input" id="poaPhone" type="tel" placeholder="+91 9876543210"/></div>
      </div>
    </div>

    <p class="t-label" style="margin:1rem 0 .8rem">Contact & Emergency</p>
    <div class="field">
      <label class="field-label">Your Contact Phone</label>
      <input class="field-input" id="contPhone" type="tel" placeholder="+91 9876543210"/>
      <div class="field-hint">For admin verification via MyGate. Not shown without your consent.</div>
    </div>
    <div class="field-row field-row-2">
      <div class="field"><label class="field-label">Emergency Contact Name</label><input class="field-input" id="emName" placeholder="Name"/></div>
      <div class="field"><label class="field-label">Their Phone</label><input class="field-input" id="emPhone" type="tel" placeholder="+91 9876543210"/></div>
    </div>
    <div class="field">
      <label class="field-label">Relation</label>
      <input class="field-input" id="emRelation" placeholder="Spouse / Parent / Sibling etc."/>
    </div>

    <button class="btn btn-jade" id="btnGoConsent">Next → Privacy Settings</button>
    <button class="btn btn-outline" id="btnBackToType" style="margin-top:8px">← Back</button>
  </div>

  <!-- PANEL 4: CONSENT & PROFILE -->
  <div class="reg-panel" id="panel4">
    <div class="alert" id="consentAlert"></div>
    <div class="info-box">Choose what verified residents can see about you. Update anytime from your profile.</div>

    <div class="consent-box">
      <div class="consent-title">Contact Visibility</div>
      <label class="consent-row"><input type="checkbox" id="cPhone"/><span>Show my <strong>phone number</strong> to verified residents</span></label>
      <label class="consent-row"><input type="checkbox" id="cEmail"/><span>Show my <strong>email address</strong> to verified residents</span></label>
    </div>

    <div class="consent-box">
      <div class="consent-title">Marketplace</div>
      <label class="consent-row"><input type="checkbox" id="cTgListing" checked/><span>Allow <strong>@psots_telegram_bot</strong> to ask before publishing my Telegram posts to marketplace</span></label>
      <label class="consent-row"><input type="checkbox" id="cPhoneListing"/><span>Show my phone on <strong>marketplace listings</strong></span></label>
      <label class="consent-row"><input type="checkbox" id="cPhoneConsent" checked/><span>Bot must ask for <strong>contact consent</strong> on each listing — required for marketplace</span></label>
    </div>

    <div class="consent-box">
      <div class="consent-title">Notifications</div>
      <label class="consent-row"><input type="checkbox" id="cTgNotif" checked/><span>Receive <strong>Telegram notifications</strong></span></label>
      <label class="consent-row"><input type="checkbox" id="cEmailNotif" checked/><span>Receive <strong>email notifications</strong></span></label>
    </div>

    <p class="t-label" style="margin:.8rem 0">Your Profile (Optional)</p>
    <div class="field">
      <label class="field-label">About Me</label>
      <textarea class="field-textarea" id="aboutMe" placeholder="A few lines about yourself" maxlength="300"></textarea>
      <div class="field-hint">Max 300 characters</div>
    </div>
    <div class="field-row field-row-2">
      <div class="field"><label class="field-label">LinkedIn</label><input class="field-input" id="linkedin" type="url" placeholder="https://linkedin.com/in/..."/></div>
      <div class="field"><label class="field-label">Website</label><input class="field-input" id="website" type="url" placeholder="https://yoursite.com"/></div>
    </div>
    <div class="field-row field-row-2">
      <div class="field"><label class="field-label">Instagram (optional)</label><input class="field-input" id="instagram" placeholder="@handle"/></div>
      <div class="field"><label class="field-label">Twitter/X (optional)</label><input class="field-input" id="twitter" placeholder="@handle"/></div>
    </div>

    <div class="info-box" style="font-size:11.5px;margin-top:.5rem">🔒 Consent recorded with timestamp. Never shared with third parties.</div>
    <button class="btn btn-jade" id="btnSubmit">Submit for Verification</button>
    <button class="btn btn-outline" id="btnBackToDetails" style="margin-top:8px">← Back</button>
    <p class="t-small" style="text-align:center;margin-top:1rem">Verification within 24–48 hours. Telegram + email notification on approval.</p>
  </div>

  <!-- PANEL 5: STATUS -->
  <div class="reg-panel" id="panel5">
    <div class="status-card" id="statusCard"></div>
    <div id="statusActions"></div>
  </div>
`;

// Render steps
Steps.render('#stepsContainer', TOTAL_STEPS, 1);

// Mount flat selector
_flatSelector = new FlatSelector(
  document.getElementById('flatSelectorMount'),
  () => {}
);

// ── EVENT BINDINGS ────────────────────────────────────────

// Google
document.getElementById('btnGoogle').onclick = async () => {
  try {
    _setAlert('loginAlert', 'info', 'Opening Google sign-in...');
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) {
    _setAlert('loginAlert', 'error', logger.friendlyMessage(e));
  }
};

// Telegram toggle
document.getElementById('btnToggleTg').onclick = () => {
  document.getElementById('tgSection').classList.toggle('hidden');
};
document.getElementById('btnHideTg').onclick = () => {
  document.getElementById('tgSection').classList.add('hidden');
};

// Telegram OTP request
document.getElementById('btnReqTgOTP').onclick = async () => {
  const u = document.getElementById('tgUser').value.trim().replace('@', '');
  if (!u) { _setAlert('loginAlert', 'error', 'Enter your Telegram username'); return; }
  try {
    await fetch(`${WORKER_URL}/send-otp?username=${u}`);
    _setAlert('loginAlert', 'info', 'OTP sent — check @psots_telegram_bot on Telegram');
  } catch (_) {
    _setAlert('loginAlert', 'warn', 'Worker URL not configured yet. Update WORKER_URL in constants.js');
  }
};

// Telegram OTP verify
document.getElementById('btnVerifyTg').onclick = async () => {
  const u   = document.getElementById('tgUser').value.trim().replace('@', '');
  const otp = document.getElementById('tgOTP').value.trim();
  if (!u || !otp) { _setAlert('loginAlert', 'error', 'Enter username and OTP'); return; }
  try {
    const res  = await fetch(`${WORKER_URL}/verify-otp?username=${u}&otp=${otp}`);
    const data = await res.json();
    if (data.token) {
      const { signInWithCustomToken } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
      await signInWithCustomToken(auth, data.token);
    } else {
      _setAlert('loginAlert', 'error', 'Invalid OTP. Try again.');
    }
  } catch (_) {
    _setAlert('loginAlert', 'warn', 'Telegram verification requires Worker URL to be configured.');
  }
};

// Phone OTP send
document.getElementById('btnSendOTP').onclick = async () => {
  const ph  = document.getElementById('phoneInp').value.trim();
  const fmt = ph.startsWith('+') ? ph.replace(/\s/g, '') : `+91${ph.replace(/\s/g, '')}`;
  if (fmt.length < 12) { _setAlert('loginAlert', 'error', 'Enter a valid number with country code'); return; }
  _btnLoading('btnSendOTP', true, 'Sending...');
  try {
    if (!window._rcv) window._rcv = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
    _confirmResult = await signInWithPhoneNumber(auth, fmt, window._rcv);
    document.getElementById('sentTo').textContent = fmt;
    document.getElementById('phoneSection').classList.add('hidden');
    document.getElementById('otpSection').classList.remove('hidden');
  } catch (e) {
    _setAlert('loginAlert', 'error', logger.friendlyMessage(e));
    _btnLoading('btnSendOTP', false, 'Send OTP');
  }
};

// Phone OTP verify
document.getElementById('btnVerifyOTP').onclick = async () => {
  const otp = document.getElementById('otpInp').value.trim();
  if (otp.length !== 6) { _setAlert('loginAlert', 'error', 'Enter 6-digit OTP'); return; }
  _btnLoading('btnVerifyOTP', true, 'Verifying...');
  try {
    await _confirmResult.confirm(otp);
  } catch (e) {
    _setAlert('loginAlert', 'error', logger.friendlyMessage(e));
    _btnLoading('btnVerifyOTP', false, 'Verify OTP');
  }
};

document.getElementById('btnChangeNum').onclick = () => {
  document.getElementById('phoneSection').classList.remove('hidden');
  document.getElementById('otpSection').classList.add('hidden');
};

// Type selection
document.getElementById('tc_owner').onclick  = () => _selectType('owner');
document.getElementById('tc_tenant').onclick = () => _selectType('tenant');
['resident', 'non_resident', 'nri'].forEach(s => {
  document.getElementById(`os_${s}`).onclick = () => _selectOwnerStatus(s);
});

document.getElementById('btnTypeNext').onclick = () => {
  if (!_selType) { _setAlert('typeAlert', 'error', 'Please select your resident type'); return; }
  if (_selType === 'owner' && !_selOwnerSt) { _setAlert('typeAlert', 'error', 'Please select your living situation'); return; }
  document.getElementById('tenantFields').classList.toggle('hidden', _selType !== 'tenant');
  document.getElementById('nriFields').classList.toggle('hidden', !(_selType === 'owner' && _selOwnerSt === 'nri'));
  _goStep(3);
};

document.getElementById('btnBackToType').onclick    = () => _goStep(2);
document.getElementById('btnBackToDetails').onclick = () => _goStep(3);

// Go to consent step
document.getElementById('btnGoConsent').onclick = async () => {
  const name  = document.getElementById('resName').value.trim();
  const vals  = _flatSelector.getValues();
  const phone = document.getElementById('contPhone').value.trim();

  if (!name)  { _setAlert('detailsAlert', 'error', 'Enter your full name'); return; }
  if (!vals)  { _setAlert('detailsAlert', 'error', 'Select your tower, floor and unit'); return; }
  if (!phone) { _setAlert('detailsAlert', 'error', 'Enter your contact phone'); return; }

  const { valid, errors } = flatService.validate(vals.tower, vals.floor, vals.unit);
  if (!valid) { _setAlert('detailsAlert', 'error', errors[0]); return; }

  if (_selType === 'tenant') {
    const ls = document.getElementById('leaseStart').value;
    const le = document.getElementById('leaseEnd').value;
    if (!ls || !le) { _setAlert('detailsAlert', 'error', 'Enter lease start and end dates'); return; }
  }

  if (_selOwnerSt === 'nri') {
    if (!document.getElementById('poaName').value.trim() ||
        !document.getElementById('poaPhone').value.trim()) {
      _setAlert('detailsAlert', 'error', 'Enter POA details for NRI registration'); return;
    }
  }

  _flatData = {
    ...vals, name, phone,
    moveIn:     document.getElementById('moveInDate').value,
    leaseStart: document.getElementById('leaseStart')?.value  || null,
    leaseEnd:   document.getElementById('leaseEnd')?.value    || null,
    ownerName:  document.getElementById('ownerName')?.value?.trim()  || null,
    ownerPhone: document.getElementById('ownerPhone')?.value?.trim() || null,
    poaName:    document.getElementById('poaName')?.value?.trim()    || null,
    poaPhone:   document.getElementById('poaPhone')?.value?.trim()   || null,
    emName:     document.getElementById('emName').value.trim(),
    emPhone:    document.getElementById('emPhone').value.trim(),
    emRelation: document.getElementById('emRelation').value.trim(),
    isPG:       document.getElementById('isPG').checked,
  };

  _goStep(4);
};

// Submit registration
document.getElementById('btnSubmit').onclick = async () => {
  const user = session.getUser();
  if (!user) { Toast.error('Session expired. Please sign in again.'); _goStep(1); return; }

  const { allowed, waitSeconds } = await rateLimitService.check(user.uid);
  if (!allowed) { _showRateBar(waitSeconds); return; }

  _btnLoading('btnSubmit', true, 'Submitting...');

  const capacity = await residentService.checkFlatCapacity(_flatData.flatNumber);
  if (capacity.isFull) {
    _setAlert('consentAlert', 'error', `Flat ${_flatData.flatNumber} is full (max 4). Contact admin.`);
    _btnLoading('btnSubmit', false, 'Submit for Verification');
    return;
  }

  const existing = await residentService.get(user.uid);
  if (existing && existing.status !== 'rejected') {
    _setAlert('consentAlert', 'error', 'You already have a registration. Refresh to check your status.');
    _btnLoading('btnSubmit', false, 'Submit for Verification');
    return;
  }

  const isSecondary  = capacity.count > 0;
  const isTenantFlow = _selType === 'tenant' && capacity.hasApprovedOwner;
  const role         = isSecondary ? 'secondary' : 'primary';
  const status       = isTenantFlow ? 'pending_owner'
                     : isSecondary  ? 'pending_primary'
                     : 'pending';

  const consent = {
    phone:        document.getElementById('cPhone').checked,
    email:        document.getElementById('cEmail').checked,
    tgListing:    document.getElementById('cTgListing').checked,
    phoneListing: document.getElementById('cPhoneListing').checked,
    phoneConsent: document.getElementById('cPhoneConsent').checked,
    tgNotif:      document.getElementById('cTgNotif').checked,
    emailNotif:   document.getElementById('cEmailNotif').checked,
    recordedAt:   new Date().toISOString(),
  };

  const escalationDate = new Date(Date.now() + ESCALATION_DAYS * 86400000).toISOString();

  const data = {
    uid: user.uid, name: _flatData.name,
    email: user.email || null, phone: _flatData.phone,
    tower: _flatData.tower, floor: _flatData.floor,
    unit: _flatData.unit, flatNumber: _flatData.flatNumber,
    residentType: _selType, ownerStatus: _selOwnerSt || null,
    role, status, isActive: false, movedOut: false,
    isPG:    _flatData.isPG  || false,
    isNRI:   _selOwnerSt === 'nri',
    poaName: _flatData.poaName, poaPhone: _flatData.poaPhone,
    leaseStartDate: _flatData.leaseStart, leaseEndDate: _flatData.leaseEnd,
    ownerNameField: _flatData.ownerName,
    moveInDate:     _flatData.moveIn,
    emergencyContactName:     _flatData.emName,
    emergencyContactPhone:    _flatData.emPhone,
    emergencyContactRelation: _flatData.emRelation,
    aboutMe:   document.getElementById('aboutMe').value.trim()  || null,
    linkedIn:  document.getElementById('linkedin').value.trim() || null,
    website:   document.getElementById('website').value.trim()  || null,
    instagram: document.getElementById('instagram').value.trim()|| null,
    twitter:   document.getElementById('twitter').value.trim()  || null,
    consent,
    badges: { blueTick: false, goldStar: false, isAdmin: false, nudgePending: false },
    rejectionCount: 0,
    ...(isSecondary ? { primaryEscalationAt: escalationDate } : {}),
  };

  const result = await residentService.create(user.uid, data);
  if (result.ok) {
    await rateLimitService.record(user.uid);
    await flatService.upsert(_flatData.flatNumber, {});
    await session.refreshResident();
  } else {
    _setAlert('consentAlert', 'error', result.error || 'Submission failed. Please try again.');
    _btnLoading('btnSubmit', false, 'Submit for Verification');
  }
};

// ── SHOW STATUS PANEL ─────────────────────────────────────
function _showStatus(d) {
  _goStep(5);

  const tick = d.badges?.blueTick ? '<span class="blue-tick">✓</span>' : '';

  const statusMap = {
    pending:         '<span class="badge badge-pending">⏳ Pending Admin Review</span>',
    pending_primary: '<span class="badge badge-pending">⏳ Pending Primary Resident</span>',
    pending_owner:   '<span class="badge badge-blue">🔄 Pending Owner Approval</span>',
    approved:        '<span class="badge badge-approved">✅ Verified Resident</span>',
    rejected:        '<span class="badge badge-rejected">❌ Not Approved</span>',
    suspended:       '<span class="badge badge-inactive">⚫ Suspended</span>',
    inactive:        '<span class="badge badge-inactive">⚫ Inactive</span>',
  };

  document.getElementById('statusCard').innerHTML = `
    <div class="status-card-name">${d.name} ${tick}</div>
    <div class="status-card-flat">Flat ${d.flatNumber} · Tower ${d.tower} · Floor ${d.floor} · Unit ${d.unit}</div>
    <div class="status-card-badges">
      <span class="badge ${d.residentType === 'owner' ? 'badge-owner' : 'badge-tenant'}">
        ${d.residentType === 'owner' ? '🏠 Owner' : '🔑 Tenant'}
      </span>
      <span class="badge badge-primary">${d.role === 'primary' ? '⭐ Primary' : '👤 Secondary'}</span>
      ${statusMap[d.status] || ''}
    </div>`;

  let actions = '';

  if (d.status === 'pending') {
    actions = `<div class="info-box">
      <strong>Request submitted.</strong><br>
      Admin verifies against MyGate within 24–48 hrs. You'll get Telegram + email notification on approval.
    </div>`;
  } else if (d.status === 'pending_owner') {
    actions = `<div class="info-box warn">
      <strong>Waiting for your owner's approval.</strong><br>
      The owner of Flat ${d.flatNumber} has been notified on Telegram.
      No response in 7 days → escalates to admin automatically.
    </div>`;
  } else if (d.status === 'pending_primary') {
    actions = `<div class="info-box warn">
      <strong>Waiting for Primary Resident approval.</strong><br>
      No response in 7 days → escalates to admin automatically.
    </div>`;
  } else if (d.status === 'approved') {
    actions = `<div class="info-box success">
      <strong>Welcome to PSOTS! 🔵</strong><br>
      Your blue tick is active. Access all resident features below.
    </div>
    <a href="/profile.html" class="btn btn-jade" style="text-decoration:none;margin-bottom:8px">👤 My Profile</a>
    <a href="/marketplace.html" class="btn btn-outline" style="text-decoration:none">🛒 Marketplace</a>`;
  } else if (d.status === 'rejected') {
    actions = `<div class="info-box error">
      <strong>Not approved.</strong><br>
      ${d.rejectionReason ? `Reason: <em>${d.rejectionReason}</em><br><br>` : ''}
      To appeal, use the button below. One appeal allowed — admin responds within 48 hours.
    </div>
    <button class="btn btn-jade" id="btnAppeal">Appeal Decision</button>`;
  } else if (d.status === 'suspended' || d.status === 'inactive') {
    actions = `<div class="info-box error">
      <strong>Account suspended.</strong><br>
      Contact your landlord or admin. Your data is available for download for 90 days.
    </div>
    <button class="btn btn-jade" id="btnDownload">📥 Download My Data</button>`;
  }

  actions += `<button class="btn btn-outline" id="btnSignOut" style="margin-top:10px">Sign Out</button>`;
  document.getElementById('statusActions').innerHTML = actions;

  document.getElementById('btnSignOut')?.addEventListener('click', () => session.signOut());

  document.getElementById('btnAppeal')?.addEventListener('click', async () => {
    const text = prompt('Explain why this decision should be reconsidered (max 500 characters):');
    if (!text?.trim()) return;
    if (text.length > 500) { Toast.error('Keep it under 500 characters.'); return; }
    const result = await residentService.submitAppeal(session.getUser().uid, d, text.trim());
    result.ok
      ? Toast.success('Appeal submitted. Admin responds within 48 hours.')
      : Toast.error('Appeal failed. Try again.');
  });

  document.getElementById('btnDownload')?.addEventListener('click', async () => {
    const result = await residentService.requestDataExport(session.getUser().uid);
    result.ok
      ? Toast.success('Export requested. Email with download link within 24 hours.')
      : Toast.error('Request failed. Try again.');
  });
}

// ── HELPERS ───────────────────────────────────────────────
function _goStep(n) {
  _step = n;
  document.querySelectorAll('.reg-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`panel${n}`)?.classList.add('active');
  Steps.update(TOTAL_STEPS, n);
}

function _selectType(t) {
  _selType = t;
  document.querySelectorAll('.type-card[id^="tc_"]').forEach(c => c.classList.remove('selected'));
  document.getElementById(`tc_${t}`).classList.add('selected');
  document.getElementById('ownerStatusSection').classList.toggle('hidden', t !== 'owner');
  if (t === 'tenant') {
    _selOwnerSt = null;
    document.getElementById('btnTypeNext').disabled = false;
  } else {
    document.getElementById('btnTypeNext').disabled = !_selOwnerSt;
  }
}

function _selectOwnerStatus(s) {
  _selOwnerSt = s;
  document.querySelectorAll('.type-card[id^="os_"]').forEach(c => c.classList.remove('selected'));
  document.getElementById(`os_${s}`).classList.add('selected');
  document.getElementById('btnTypeNext').disabled = false;
}

function _setAlert(id, type, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `alert alert-${type} show`;
  el.textContent = msg;
}

function _btnLoading(id, loading, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.disabled = loading;
  el.innerHTML = loading ? `<span class="loader"></span>${text}` : text;
}

function _showRateBar(seconds) {
  const bar = document.getElementById('rateBar');
  bar.classList.add('show');
  let r = seconds;
  document.getElementById('rateTimer').textContent = r;
  const iv = setInterval(() => {
    r--;
    document.getElementById('rateTimer').textContent = r;
    if (r <= 0) { clearInterval(iv); bar.classList.remove('show'); }
  }, 1000);
}

// Nav scroll effect
window.addEventListener('scroll', () => {
  document.getElementById('mainNav')?.classList.toggle('scrolled', window.scrollY > 10);
});
