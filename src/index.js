// PSOTS Telegram Moderation Bot - Cloudflare Workers
// With Google OAuth, RBAC, User Panel, Appeals & Status Bar

// Secrets loaded from Cloudflare environment
// Use: wrangler secret put GOOGLE_CLIENT_ID
//      wrangler secret put GOOGLE_CLIENT_SECRET
const ADMIN_ID = 989358143;
const INITIAL_ADMIN = "pushkalkishore@gmail.com";

const DEFAULT_KEYWORDS = {
  buySell: ['sell', 'buy', 'rent', 'price', '₹', 'rs.', 'contact for price', 'call me', 'dm me', 'whatsapp me', 'available for sale', 'second hand', 'looking to buy', 'for sale', 'selling', 'buying', 'rental', 'lease'],
  political: ['bjp', 'congress', 'aap', 'election', 'vote', 'modi', 'cm', 'government policy', 'party', 'protest', 'rally', 'political', 'minister', 'parliament', 'lok sabha'],
  religious: ['temple donation', 'mosque', 'church collection', 'prayer meeting', 'temple', 'church', 'prayer', 'religious'],
  approvedEvents: ['chhath puja', 'diwali', 'holi', 'navratri', 'eid', 'rakhi', 'ganesh chaturthi', 'durga puja', 'makar sankranti'],
  spam: ['discount', 'offer', 'limited time', 'click here', 'refer a friend', 'earn money', 'business opportunity', 'join us', 'sign up', 'special offer', 'exclusive deal', 'hurry', 'act now'],
  abuseHindi: ['बेवकूफ', 'मूर्ख', 'गधा', 'चोर', 'झूठा', 'बदमाश', 'भाड़', 'साला', 'हरामी', 'कमीना'],
  abuseEnglish: ['idiot', 'stupid', 'fool', 'moron', 'dumb', 'jerk', 'ass', 'bastard', 'jackass', 'imbecile'],
  personalAttacks: ['you are wrong', 'you are an', 'shut up', 'go away', 'mind your own business', 'nobody asked you'],
  societyFees: ['cam', 'maintenance', 'maintenance charge', 'society fee', 'maintenance fee', 'dues', 'payment', 'monthly charge']
};

// UTILITIES
async function getBotToken(kv) {
  return await kv.get('_bot_token');
}

async function getAdmins(kv) {
  const admins = await kv.get('_admin_emails');
  return admins ? JSON.parse(admins) : [INITIAL_ADMIN];
}

async function saveAdmins(admins, kv) {
  await kv.put('_admin_emails', JSON.stringify(admins));
}

async function getPINs(kv) {
  const pins = await kv.get('_admin_pins');
  return pins ? JSON.parse(pins) : ['1234'];
}

async function savePINs(pins, kv) {
  await kv.put('_admin_pins', JSON.stringify(pins));
}

async function getKeywords(kv) {
  const stored = await kv.get('_keywords_config');
  return stored ? JSON.parse(stored) : DEFAULT_KEYWORDS;
}

async function saveKeywords(keywords, kv) {
  await kv.put('_keywords_config', JSON.stringify(keywords));
}

async function getStats(kv) {
  const stats = await kv.get('_stats');
  return stats ? JSON.parse(stats) : { totalScanned: 0, lastReset: Date.now() };
}

async function updateStats(kv) {
  const stats = await getStats(kv);
  stats.totalScanned++;
  await kv.put('_stats', JSON.stringify(stats));
}

// DEFAULT ACTION SETTINGS
const DEFAULT_ACTIONS = {
  firstViolation: {
    action: 'warn',
    message: 'Hi {name}, your message was removed for: {reason}. Please follow group guidelines. 🙏'
  },
  secondViolation: {
    action: 'warn',
    message: 'Hi {name}, this is your 2nd warning for {reason}. Please be careful. 🙏'
  },
  thirdViolation: {
    action: 'mute',
    duration: 3600, // 1 hour in seconds
    message: 'Hi {name}, you have been muted for 1 hour due to repeated violations. 🙏'
  },
  fifthViolation: {
    action: 'kick',
    message: 'User {name} has been removed for repeated violations.'
  },
  tenthViolation: {
    action: 'ban',
    message: 'User {name} has been banned for persistent violations.'
  }
};

// GET ACTION SETTINGS
async function getActionSettings(kv) {
  const settings = await kv.get('_action_settings');
  return settings ? JSON.parse(settings) : DEFAULT_ACTIONS;
}

// SAVE ACTION SETTINGS
async function saveActionSettings(settings, kv) {
  await kv.put('_action_settings', JSON.stringify(settings));
}

// GET APPROPRIATE ACTION FOR VIOLATION COUNT
async function getActionForViolationCount(count, kv) {
  const settings = await getActionSettings(kv);

  if (count === 1) return settings.firstViolation;
  if (count === 2) return settings.secondViolation;
  if (count === 3) return settings.thirdViolation;
  if (count >= 5) return settings.fifthViolation;
  if (count >= 10) return settings.tenthViolation;

  // Default: warn
  return { action: 'warn', message: settings.thirdViolation.message };
}

async function getUserViolations(userId, kv) {
  const data = await kv.get(`user_${userId}`);
  return data ? JSON.parse(data) : null;
}

async function saveUserViolations(userId, data, kv) {
  await kv.put(`user_${userId}`, JSON.stringify(data), { expirationTtl: 2592000 });
}

async function getViolationsLast30Days(kv) {
  const list = await kv.list({ prefix: 'user_' });
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const violations = [];

  for (const item of list.keys) {
    const data = JSON.parse(await kv.get(item.name));
    if (data.lastViolationTime > thirtyDaysAgo) {
      violations.push(data);
    }
  }
  return violations;
}

function checkViolation(text, keywords) {
  const lowerText = text.toLowerCase();
  if (lowerText.includes('₹') && keywords.societyFees.some(f => lowerText.includes(f.toLowerCase()))) return null;
  if (keywords.approvedEvents.some(e => lowerText.includes(e.toLowerCase()))) return null;
  if (keywords.buySell.some(k => lowerText.includes(k.toLowerCase()))) return 'Buy/Sell Content';
  if (keywords.political.some(k => lowerText.includes(k.toLowerCase()))) return 'Political Content';
  if (keywords.religious.some(k => lowerText.includes(k.toLowerCase()))) return 'Religious Content';
  if (keywords.spam.some(k => lowerText.includes(k.toLowerCase()))) return 'Spam/Unsolicited Promotion';
  if (keywords.abuseHindi.some(k => lowerText.includes(k.toLowerCase())) || keywords.abuseEnglish.some(k => lowerText.includes(k.toLowerCase()))) return 'Abusive Language';
  if (keywords.personalAttacks.some(k => lowerText.includes(k.toLowerCase()))) return 'Personal Attack/Foul Language';
  return null;
}

async function deleteMessage(chatId, messageId, token) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId })
    });
  } catch (err) {}
}

async function sendMessage(chatId, text, token) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
  } catch (err) {}
}

async function getChatMember(chatId, userId, token) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getChatMember`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, user_id: userId })
    });
    const data = await res.json();
    return data.ok ? data.result : null;
  } catch (err) {
    return null;
  }
}

// ADMIN DASHBOARD HTML - Uses client-side Google Identity Services
const GOOGLE_CLIENT_ID_VALUE = "774636811164-c9n9n8a27c9d0fbhg7e6vie759gq1sun.apps.googleusercontent.com";

const ADMIN_DASHBOARD = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PSOTS Admin</title>
<script src="https://accounts.google.com/gsi/client" async defer></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f5f5f5;color:#333}
#login-screen{display:flex;align-items:center;justify-content:center;height:100vh;background:linear-gradient(135deg,#667eea,#764ba2)}
.login-box{background:white;padding:40px;border-radius:16px;text-align:center;max-width:360px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3)}
.login-box h1{font-size:22px;margin:16px 0 8px}
.login-box p{color:#666;font-size:14px;margin-bottom:24px}
#dashboard{display:none}
header{background:linear-gradient(135deg,#667eea,#764ba2);color:white;padding:16px 20px;display:flex;justify-content:space-between;align-items:center}
header h1{font-size:20px}
.user-info{font-size:13px;opacity:0.9;margin-right:10px}
.container{max-width:1000px;margin:0 auto;padding:20px}
.tabs{display:flex;gap:8px;margin:16px 0;flex-wrap:wrap}
.tab-btn{padding:10px 18px;background:white;border:2px solid #ddd;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;transition:all 0.2s}
.tab-btn.active{background:#667eea;color:white;border-color:#667eea}
.tab{display:none;background:white;padding:24px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.08)}
.tab.active{display:block}
.status-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:20px}
.stat-card{background:#f8f0ff;padding:20px;border-radius:10px;border-left:4px solid #667eea;text-align:center}
.stat-card h3{color:#667eea;font-size:13px;margin-bottom:8px}
.stat-card .num{font-size:32px;font-weight:bold}
.item{background:#f9f9f9;padding:14px;border-radius:8px;margin-bottom:10px;border-left:4px solid #667eea}
.item strong{color:#667eea}
.btn{padding:9px 18px;background:#667eea;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px}
.btn:hover{background:#764ba2}
.btn-sm{padding:6px 12px;font-size:12px}
.btn-red{background:#e74c3c}
.input-row{display:flex;gap:8px;margin-bottom:12px}
.input-row input,.input-row select{flex:1;padding:10px;border:1px solid #ddd;border-radius:6px;font-size:14px}
.tag{display:inline-block;background:#667eea;color:white;padding:5px 10px;border-radius:20px;margin:3px;font-size:12px}
.tag button{background:none;border:none;color:white;cursor:pointer;margin-left:6px;font-size:14px}
.settings-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}
.settings-card{background:#f9f9f9;padding:16px;border-radius:8px;border:1px solid #eee}
.settings-card h3{color:#667eea;margin-bottom:12px;font-size:14px}
.settings-card label{display:block;font-size:12px;color:#666;margin-bottom:4px;margin-top:8px}
.settings-card input,.settings-card select{width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;font-size:13px}
@media(max-width:600px){.container{padding:10px}.tabs{gap:4px}.tab-btn{padding:8px 12px;font-size:12px}.settings-row{grid-template-columns:1fr}}
</style>
</head>
<body>

<!-- LOGIN SCREEN -->
<div id="login-screen">
  <div class="login-box">
    <div style="font-size:48px">🤖</div>
    <h1>PSOTS Admin</h1>
    <p style="margin-bottom:32px">Sign in to manage the bot</p>

    <!-- Google Login -->
    <div style="margin-bottom:20px">
      <div id="g_id_onload"
        data-client_id="${GOOGLE_CLIENT_ID_VALUE}"
        data-callback="handleGoogleLogin"
        data-auto_prompt="false">
      </div>
      <div class="g_id_signin"
        data-type="standard"
        data-size="large"
        data-theme="outline"
        data-text="sign_in_with"
        data-shape="rectangular"
        data-logo_alignment="left">
      </div>
    </div>

    <div id="auth-error" style="color:#e74c3c;font-size:13px;margin-top:12px;display:none">
      ❌ Not authorized. Contact admin.
    </div>
  </div>
</div>

<!-- DASHBOARD -->
<div id="dashboard">
  <header>
    <h1>🤖 PSOTS Admin Dashboard</h1>
    <div style="display:flex;align-items:center;gap:10px">
      <span class="user-info" id="user-email"></span>
      <button class="btn btn-red btn-sm" onclick="logout()">Logout</button>
    </div>
  </header>
  <div class="container">
    <div class="tabs">
      <button class="tab-btn active" onclick="switchTab('status',this)">📊 Status</button>
      <button class="tab-btn" onclick="switchTab('violations',this)">⚠️ Violations</button>
      <button class="tab-btn" onclick="switchTab('keywords',this)">🔑 Keywords</button>
      <button class="tab-btn" onclick="switchTab('admins',this)">👥 Admins</button>
      <button class="tab-btn" onclick="switchTab('settings',this)">⚙️ Settings</button>
      <button class="tab-btn" onclick="switchTab('logs',this)">📝 Logs</button>
    </div>

    <div id="status" class="tab active">
      <div class="status-grid">
        <div class="stat-card"><h3>Messages Scanned</h3><div class="num" id="scanned">-</div></div>
        <div class="stat-card"><h3>Violations (30d)</h3><div class="num" id="vcount">-</div></div>
        <div class="stat-card"><h3>Users Tracked</h3><div class="num" id="ucount">-</div></div>
        <div class="stat-card"><h3>Admins</h3><div class="num" id="acount">-</div></div>
      </div>
    </div>

    <div id="violations" class="tab">
      <h2 style="margin-bottom:16px">⚠️ Violations (Last 30 Days)</h2>
      <div id="violationsList">Loading...</div>
    </div>

    <div id="keywords" class="tab">
      <h2 style="margin-bottom:16px">🔑 Manage Keywords</h2>
      <div class="input-row">
        <select id="categorySelect" onchange="loadKeywordsForCategory()">
          <option value="buySell">Buy/Sell</option>
          <option value="political">Political</option>
          <option value="religious">Religious</option>
          <option value="spam">Spam</option>
          <option value="abuseEnglish">Abusive (English)</option>
          <option value="abuseHindi">Abusive (Hindi)</option>
          <option value="personalAttacks">Personal Attacks</option>
          <option value="approvedEvents">Approved Events ✅</option>
          <option value="societyFees">Society Fees (Exempt ✅)</option>
        </select>
      </div>
      <div id="keywordsList" style="margin-bottom:16px;min-height:40px"></div>
      <div class="input-row">
        <input type="text" id="newKeyword" placeholder="Add new keyword...">
        <button class="btn" onclick="addKeyword()">Add</button>
      </div>
    </div>

    <div id="admins" class="tab">
      <h2 style="margin-bottom:16px">👥 Admin Management</h2>
      <div id="adminsList" style="margin-bottom:16px"></div>
      <div class="input-row">
        <input type="email" id="newAdmin" placeholder="Add admin email...">
        <button class="btn" onclick="addAdmin()">Add Admin</button>
      </div>
    </div>

    <div id="settings" class="tab">
      <h2 style="margin-bottom:16px">⚙️ Action Settings</h2>
      <p style="color:#666;font-size:13px;margin-bottom:16px">Configure what happens at each violation count</p>
      <div class="settings-row">
        <div class="settings-card">
          <h3>1st Violation</h3>
          <label>Action</label>
          <select id="action1"><option value="warn">Warn Only</option></select>
          <label>Message</label>
          <input type="text" id="msg1" placeholder="Warning message...">
        </div>
        <div class="settings-card">
          <h3>2nd Violation</h3>
          <label>Action</label>
          <select id="action2"><option value="warn">Warn Only</option></select>
          <label>Message</label>
          <input type="text" id="msg2" placeholder="Warning message...">
        </div>
        <div class="settings-card">
          <h3>3rd Violation</h3>
          <label>Action</label>
          <select id="action3">
            <option value="warn">Warn Only</option>
            <option value="mute" selected>Mute</option>
            <option value="kick">Kick</option>
            <option value="ban">Ban</option>
          </select>
          <label>Mute Duration (minutes)</label>
          <input type="number" id="mute3" value="60" min="1">
          <label>Message</label>
          <input type="text" id="msg3" placeholder="Warning message...">
        </div>
        <div class="settings-card">
          <h3>5th Violation</h3>
          <label>Action</label>
          <select id="action5">
            <option value="warn">Warn Only</option>
            <option value="mute">Mute</option>
            <option value="kick" selected>Kick</option>
            <option value="ban">Ban</option>
          </select>
          <label>Message</label>
          <input type="text" id="msg5" placeholder="Warning message...">
        </div>
        <div class="settings-card">
          <h3>10th Violation</h3>
          <label>Action</label>
          <select id="action10">
            <option value="warn">Warn Only</option>
            <option value="mute">Mute</option>
            <option value="kick">Kick</option>
            <option value="ban" selected>Ban Permanently</option>
          </select>
          <label>Message</label>
          <input type="text" id="msg10" placeholder="Warning message...">
        </div>
      </div>
      <button class="btn" onclick="saveSettings()">💾 Save Settings</button>
      <div id="settings-msg" style="margin-top:10px;color:#27ae60;font-size:13px"></div>
    </div>

    <div id="logs" class="tab">
      <h2 style="margin-bottom:16px">📝 Deleted Messages (Last 30 Days)</h2>
      <div id="logsList">Loading...</div>
    </div>
  </div>
</div>

<script>
const API = '/api';
let currentUserEmail = '';
let allowedAdmins = [];

// GOOGLE LOGIN HANDLER
async function handleGoogleLogin(response) {
  try {
    const payload = JSON.parse(atob(response.credential.split('.')[1]));
    const email = payload.email;

    // Check if admin
    const res = await fetch(API + '/admins');
    const data = await res.json();
    allowedAdmins = data.admins || [];

    if (allowedAdmins.includes(email)) {
      currentUserEmail = email;
      document.getElementById('user-email').textContent = email;
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('dashboard').style.display = 'block';
      loadStatus();
    } else {
      document.getElementById('auth-error').style.display = 'block';
    }
  } catch(e) {
    document.getElementById('auth-error').style.display = 'block';
    document.getElementById('auth-error').textContent = '❌ Login failed. Try again.';
  }
}

function logout() {
  google.accounts.id.disableAutoSelect();
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('dashboard').style.display = 'none';
}

function switchTab(t, btn) {
  document.querySelectorAll('.tab').forEach(e => e.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(e => e.classList.remove('active'));
  document.getElementById(t).classList.add('active');
  btn.classList.add('active');
  if(t==='status') loadStatus();
  if(t==='violations') loadViolations();
  if(t==='keywords') loadKeywordsForCategory();
  if(t==='admins') loadAdmins();
  if(t==='settings') loadSettings();
  if(t==='logs') loadLogs();
}

async function loadStatus() {
  try {
    const r = await fetch(API+'/status');
    const d = await r.json();
    document.getElementById('scanned').textContent = d.totalScanned||0;
    document.getElementById('vcount').textContent = d.violations||0;
    document.getElementById('ucount').textContent = d.users||0;
    document.getElementById('acount').textContent = d.admins||0;
  } catch(e){}
}

async function loadViolations() {
  try {
    const r = await fetch(API+'/violations');
    const d = await r.json();
    document.getElementById('violationsList').innerHTML = !d.violations.length ? '<p style="color:#999">No violations recorded.</p>' :
      d.violations.map(v => \`<div class="item"><strong>@\${v.username}</strong> — \${v.count} violations<br>
      <small style="color:#888">\${(v.history||[]).slice(-3).map(h=>h.type).join(' • ')}</small>
      <button class="btn btn-sm btn-red" style="float:right" onclick="resetUser('\${v.username}')">Reset</button></div>\`).join('');
  } catch(e){}
}

async function loadAdmins() {
  try {
    const r = await fetch(API+'/admins');
    const d = await r.json();
    document.getElementById('adminsList').innerHTML = (d.admins||[]).map(e =>
      \`<div class="item">\${e}<button class="btn btn-sm btn-red" style="float:right" onclick="removeAdmin('\${e}')">Remove</button></div>\`
    ).join('');
  } catch(e){}
}

async function loadKeywordsForCategory() {
  try {
    const cat = document.getElementById('categorySelect').value;
    const r = await fetch(API+'/keywords');
    const d = await r.json();
    document.getElementById('keywordsList').innerHTML = (d.keywords[cat]||[]).map(kw =>
      \`<span class="tag">\${kw}<button onclick="removeKeyword('\${cat}','\${kw}')">×</button></span>\`
    ).join('') || '<span style="color:#999;font-size:13px">No keywords yet</span>';
  } catch(e){}
}

async function addKeyword() {
  const cat = document.getElementById('categorySelect').value;
  const kw = document.getElementById('newKeyword').value.trim();
  if(!kw) return;
  await fetch(API+'/keywords',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({category:cat,keyword:kw,action:'add'})});
  document.getElementById('newKeyword').value='';
  loadKeywordsForCategory();
}

async function removeKeyword(cat,kw) {
  await fetch(API+'/keywords',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({category:cat,keyword:kw,action:'remove'})});
  loadKeywordsForCategory();
}

async function addAdmin() {
  const email = document.getElementById('newAdmin').value.trim();
  if(!email) return;
  await fetch(API+'/admins',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,action:'add'})});
  document.getElementById('newAdmin').value='';
  loadAdmins();
}

async function removeAdmin(email) {
  if(!confirm('Remove '+email+'?')) return;
  await fetch(API+'/admins',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,action:'remove'})});
  loadAdmins();
}

async function resetUser(username) {
  if(!confirm('Reset violations for @'+username+'?')) return;
  await fetch(API+'/violations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,action:'reset'})});
  loadViolations();
}

async function loadSettings() {
  try {
    const r = await fetch(API+'/settings');
    const d = await r.json();
    if(d.settings) {
      const s = d.settings;
      if(s.firstViolation) { document.getElementById('action1').value=s.firstViolation.action||'warn'; document.getElementById('msg1').value=s.firstViolation.message||''; }
      if(s.secondViolation) { document.getElementById('action2').value=s.secondViolation.action||'warn'; document.getElementById('msg2').value=s.secondViolation.message||''; }
      if(s.thirdViolation) { document.getElementById('action3').value=s.thirdViolation.action||'mute'; document.getElementById('mute3').value=s.thirdViolation.duration||60; document.getElementById('msg3').value=s.thirdViolation.message||''; }
      if(s.fifthViolation) { document.getElementById('action5').value=s.fifthViolation.action||'kick'; document.getElementById('msg5').value=s.fifthViolation.message||''; }
      if(s.tenthViolation) { document.getElementById('action10').value=s.tenthViolation.action||'ban'; document.getElementById('msg10').value=s.tenthViolation.message||''; }
    }
  } catch(e){}
}

async function saveSettings() {
  const settings = {
    firstViolation: { action: document.getElementById('action1').value, message: document.getElementById('msg1').value },
    secondViolation: { action: document.getElementById('action2').value, message: document.getElementById('msg2').value },
    thirdViolation: { action: document.getElementById('action3').value, duration: parseInt(document.getElementById('mute3').value)||60, message: document.getElementById('msg3').value },
    fifthViolation: { action: document.getElementById('action5').value, message: document.getElementById('msg5').value },
    tenthViolation: { action: document.getElementById('action10').value, message: document.getElementById('msg10').value }
  };
  await fetch(API+'/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(settings)});
  document.getElementById('settings-msg').textContent = '✅ Settings saved!';
  setTimeout(()=>document.getElementById('settings-msg').textContent='',3000);
}

async function loadLogs() {
  try {
    const r = await fetch(API+'/logs');
    const d = await r.json();
    document.getElementById('logsList').innerHTML = !d.logs.length ? '<p style="color:#999">No logs yet.</p>' :
      d.logs.slice(0,50).map(l => \`<div class="item"><strong>@\${l.username}</strong> — \${l.violationType}<br>
      <small>"\${(l.messageText||'').substring(0,70)}..."</small><br>
      <small style="color:#aaa">\${new Date(l.timestamp).toLocaleString()}</small></div>\`).join('');
  } catch(e){}
}

loadStatus();
</script>
</body>
</html>`;

// USER PANEL HTML
const USER_PANEL = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Violations - PSOTS</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; margin-bottom: 20px; text-align: center; }
    .header h1 { font-size: 24px; margin-bottom: 10px; }
    .stat-card { background: white; padding: 20px; border-radius: 8px; margin-bottom: 15px; text-align: center; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
    .stat-card h3 { color: #667eea; margin-bottom: 10px; font-size: 14px; }
    .stat-card .number { font-size: 32px; font-weight: bold; color: #e74c3c; }
    .violation-item { background: white; padding: 15px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid #e74c3c; }
    .violation-item h3 { color: #e74c3c; font-size: 14px; margin-bottom: 5px; }
    .violation-item p { font-size: 12px; color: #666; }
    .no-violations { background: white; padding: 40px; border-radius: 8px; text-align: center; }
    .no-violations h2 { color: #27ae60; margin-bottom: 10px; }
    .error { background: #fee; padding: 15px; border-radius: 8px; color: #c33; border: 1px solid #fcc; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Your Violations</h1>
      <p>PSOTS Group - Last 30 Days</p>
    </div>
    <div id="content">Loading...</div>
  </div>

  <script>
    async function load() {
      const userId = new URLSearchParams(window.location.search).get('id');
      if (!userId) {
        document.getElementById('content').innerHTML = '<div class="error">Invalid user ID</div>';
        return;
      }

      try {
        const res = await fetch('/api/user-violations?id=' + userId);
        const data = await res.json();

        if (!data.violations) {
          document.getElementById('content').innerHTML = '<div class="no-violations"><h2>✅ Clean Record</h2><p>No violations in the last 30 days</p></div>';
          return;
        }

        let html = '<div class="stat-card"><h3>Total Violations</h3><div class="number">' + data.violations.count + '</div></div>';

        if (data.violations.history && data.violations.history.length > 0) {
          html += '<h3 style="margin-top: 20px; margin-bottom: 10px;">Violation History</h3>';
          data.violations.history.forEach(v => {
            const date = new Date(v.timestamp).toLocaleDateString();
            html += '<div class="violation-item"><h3>' + v.type + '</h3><p>' + date + '</p></div>';
          });
        }

        document.getElementById('content').innerHTML = html;
      } catch (err) {
        document.getElementById('content').innerHTML = '<div class="error">Error loading violations: ' + err.message + '</div>';
        console.error('Error:', err);
      }
    }

    load();
  </script>
</body>
</html>`;

// MAIN HANDLER
export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const pathname = url.pathname;

      // ADMIN DASHBOARD - always serve the HTML (auth handled client-side via Google Identity Services)
      if (pathname === '/admin' || pathname === '/admin/') {
        return new Response(ADMIN_DASHBOARD, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }

      // USER PANEL
      if (pathname === '/user' || pathname === '/user/') {
        return new Response(USER_PANEL, { headers: { 'Content-Type': 'text/html' } });
      }

      // API ENDPOINTS
      if (pathname.startsWith('/api/')) {
        const endpoint = pathname.replace('/api/', '');

        // Check webhook status
        if (endpoint === 'webhook-status') {
          const botToken = await getBotToken(env.VIOLATIONS);
          if (!botToken) {
            return new Response(JSON.stringify({ error: 'BOT_TOKEN not set' }), { headers: { 'Content-Type': 'application/json' } });
          }

          try {
            const res = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
            const data = await res.json();
            return new Response(JSON.stringify({
              webhookConfigured: data.ok,
              webhookInfo: data.result
            }), { headers: { 'Content-Type': 'application/json' } });
          } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), { headers: { 'Content-Type': 'application/json' } });
          }
        }

        // Check keywords in KV
        if (endpoint === 'check-keywords') {
          const keywords = await getKeywords(env.VIOLATIONS);
          return new Response(JSON.stringify({
            keywordCategories: Object.keys(keywords),
            buySell: keywords.buySell,
            total: Object.values(keywords).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0)
          }), { headers: { 'Content-Type': 'application/json' } });
        }

        // Debug logs
        if (endpoint === 'debug-logs') {
          const list = await env.VIOLATIONS.list({ prefix: '_log_' });
          const logs = [];
          for (const item of list.keys) {
            const data = await env.VIOLATIONS.get(item.name);
            logs.push({ key: item.name, value: JSON.parse(data) });
          }
          return new Response(JSON.stringify({
            debugLogs: logs.sort((a, b) => b.key.localeCompare(a.key)).slice(0, 20)
          }), { headers: { 'Content-Type': 'application/json' } });
        }

        // Diagnostics
        if (endpoint === 'diagnostics') {
          const botToken = await getBotToken(env.VIOLATIONS);
          const hasToken = !!botToken;
          const tokenPreview = botToken ? botToken.substring(0, 10) + '...' : 'NOT SET';

          // List all keys in KV to debug
          const kvList = await env.VIOLATIONS.list();
          const kvKeys = kvList.keys.map(k => k.name);

          // Check if _bot_token exists
          const botTokenExists = kvKeys.includes('_bot_token');
          const botTokenValue = botTokenExists ? await env.VIOLATIONS.get('_bot_token') : null;

          // Test webhook by getting bot info
          let botInfo = null;
          if (botToken) {
            try {
              const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
              const data = await res.json();
              botInfo = data.ok ? { id: data.result.id, username: data.result.username } : { error: data.description };
            } catch (err) {
              botInfo = { error: err.message };
            }
          }

          return new Response(JSON.stringify({
            hasToken,
            tokenPreview,
            botInfo,
            kvWorking: !!env.VIOLATIONS,
            kvDebug: {
              totalKeys: kvKeys.length,
              keys: kvKeys,
              botTokenExists,
              botTokenPreview: botTokenValue ? botTokenValue.substring(0, 10) + '...' : 'null'
            }
          }), { headers: { 'Content-Type': 'application/json' } });
        }

        // Status
        if (endpoint === 'status') {
          const stats = await getStats(env.VIOLATIONS);
          const violations = await getViolationsLast30Days(env.VIOLATIONS);
          const admins = await getAdmins(env.VIOLATIONS);
          const userList = await env.VIOLATIONS.list({ prefix: 'user_' });

          return new Response(JSON.stringify({
            totalScanned: stats.totalScanned,
            violations: violations.reduce((sum, v) => sum + v.count, 0),
            users: userList.keys.length,
            admins: admins.length
          }), { headers: { 'Content-Type': 'application/json' } });
        }

        // Violations
        if (endpoint === 'violations' && request.method === 'GET') {
          const violations = await getViolationsLast30Days(env.VIOLATIONS);
          return new Response(JSON.stringify({ violations: violations.sort((a, b) => b.count - a.count) }), { headers: { 'Content-Type': 'application/json' } });
        }

        if (endpoint === 'violations' && request.method === 'POST') {
          const body = await request.json();
          if (body.action === 'reset') {
            const list = await env.VIOLATIONS.list({ prefix: 'user_' });
            for (const item of list.keys) {
              const data = JSON.parse(await env.VIOLATIONS.get(item.name));
              if (data.username === body.username) {
                data.count = 0;
                await saveUserViolations(data.userId, data, env.VIOLATIONS);
                break;
              }
            }
          }
          return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
        }

        // User Violations
        if (endpoint.startsWith('user-violations')) {
          const userId = new URL(request.url).searchParams.get('id');
          const violations = await getUserViolations(userId, env.VIOLATIONS);
          return new Response(JSON.stringify({ violations }), { headers: { 'Content-Type': 'application/json' } });
        }

        // Keywords
        if (endpoint === 'keywords' && request.method === 'GET') {
          const keywords = await getKeywords(env.VIOLATIONS);
          return new Response(JSON.stringify({ keywords }), { headers: { 'Content-Type': 'application/json' } });
        }

        if (endpoint === 'keywords' && request.method === 'POST') {
          const body = await request.json();
          const keywords = await getKeywords(env.VIOLATIONS);
          if (body.action === 'add') {
            if (!keywords[body.category]) keywords[body.category] = [];
            if (!keywords[body.category].includes(body.keyword)) {
              keywords[body.category].push(body.keyword);
            }
          } else if (body.action === 'remove') {
            keywords[body.category] = keywords[body.category].filter(kw => kw !== body.keyword);
          }
          await saveKeywords(keywords, env.VIOLATIONS);
          return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
        }

        // Admins
        if (endpoint === 'admins' && request.method === 'GET') {
          const admins = await getAdmins(env.VIOLATIONS);
          return new Response(JSON.stringify({ admins }), { headers: { 'Content-Type': 'application/json' } });
        }

        if (endpoint === 'admins' && request.method === 'POST') {
          const body = await request.json();
          const admins = await getAdmins(env.VIOLATIONS);
          if (body.action === 'add' && !admins.includes(body.email)) {
            admins.push(body.email);
          } else if (body.action === 'remove') {
            admins.splice(admins.indexOf(body.email), 1);
          }
          await saveAdmins(admins, env.VIOLATIONS);
          return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
        }

        // PINs
        if (endpoint === 'pins' && request.method === 'GET') {
          const pins = await getPINs(env.VIOLATIONS);
          return new Response(JSON.stringify({ pins }), { headers: { 'Content-Type': 'application/json' } });
        }

        if (endpoint === 'pins' && request.method === 'POST') {
          const body = await request.json();
          const pins = await getPINs(env.VIOLATIONS);
          if (body.action === 'add' && !pins.includes(body.pin)) {
            pins.push(body.pin);
          } else if (body.action === 'remove') {
            pins.splice(pins.indexOf(body.pin), 1);
          }
          await savePINs(pins, env.VIOLATIONS);
          return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
        }

        // Verify PIN
        if (endpoint === 'verify-pin' && request.method === 'POST') {
          const body = await request.json();
          const pins = await getPINs(env.VIOLATIONS);
          const valid = pins.includes(body.pin);
          return new Response(JSON.stringify({ valid }), { headers: { 'Content-Type': 'application/json' } });
        }

        // Settings
        if (endpoint === 'settings' && request.method === 'GET') {
          const settings = await getActionSettings(env.VIOLATIONS);
          return new Response(JSON.stringify({ settings }), { headers: { 'Content-Type': 'application/json' } });
        }

        if (endpoint === 'settings' && request.method === 'POST') {
          const settings = await request.json();
          await saveActionSettings(settings, env.VIOLATIONS);
          return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
        }

        // Logs
        if (endpoint === 'logs') {
          const list = await env.AUDIT_LOG.list();
          const logs = [];
          const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

          for (const item of list.keys) {
            const data = JSON.parse(await env.AUDIT_LOG.get(item.name));
            if (new Date(data.timestamp).getTime() > thirtyDaysAgo) {
              logs.push(data);
            }
          }

          return new Response(JSON.stringify({ logs: logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)) }), { headers: { 'Content-Type': 'application/json' } });
        }
      }

      // TELEGRAM WEBHOOK
      if (request.method === 'POST' && !pathname.startsWith('/api/')) {
        const update = await request.json();

        // Log all POST requests
        await env.VIOLATIONS.put(`_log_post_${Date.now()}`, JSON.stringify({
          hasMessage: !!update.message,
          updateKeys: Object.keys(update),
          timestamp: new Date().toISOString()
        }), { expirationTtl: 86400 });

        if (!update.message) return new Response('OK');

        const botToken = await getBotToken(env.VIOLATIONS);
        if (!botToken) return new Response('OK'); // Bot token not configured

        const message = update.message;
        const chatId = message.chat.id;
        const userId = message.from.id;
        const text = message.text || '';
        const username = message.from.username || message.from.first_name || 'User';
        const firstName = message.from.first_name || 'User';

        // Log webhook received
        await env.VIOLATIONS.put(`_log_webhook_${Date.now()}`, JSON.stringify({
          chatId, userId, text, timestamp: new Date().toISOString()
        }), { expirationTtl: 86400 }); // 24 hour expiry

        if (!text || message.from.is_bot) return new Response('OK');

        // Skip moderation for group admins (they send official messages/warnings)
        const member = await getChatMember(chatId, userId, botToken);
        if (member && (member.status === 'administrator' || member.status === 'creator')) {
          return new Response('OK');
        }

        const keywords = await getKeywords(env.VIOLATIONS);
        const violation = checkViolation(text, keywords);

        // Log violation check with keyword details
        await env.VIOLATIONS.put(`_log_check_${Date.now()}`, JSON.stringify({
          text,
          violation,
          keywordCategories: Object.keys(keywords),
          buySellCount: keywords.buySell ? keywords.buySell.length : 0,
          timestamp: new Date().toISOString()
        }), { expirationTtl: 86400 });

        if (violation) {
          await updateStats(env.VIOLATIONS);
          await deleteMessage(chatId, message.message_id, botToken);

          let userViolations = await getUserViolations(userId, env.VIOLATIONS);
          if (!userViolations) {
            userViolations = { userId, username, count: 0, history: [], lastViolationTime: Date.now() };
          }

          userViolations.count++;
          userViolations.lastViolationTime = Date.now();
          userViolations.history.push({ type: violation, timestamp: new Date().toISOString() });
          await saveUserViolations(userId, userViolations, env.VIOLATIONS);

          const auditLog = { userId, username, firstName, violationType: violation, messageText: text, timestamp: new Date().toISOString(), chatId };
          await env.AUDIT_LOG.put(`${Date.now()}_${userId}`, JSON.stringify(auditLog), { expirationTtl: 7776000 });

          const count = userViolations.count;
          let msg = '';

          if (count === 1) {
            msg = `Hi ${firstName}, your message was removed for: ${violation}. Please follow group guidelines. 🙏\n\n<a href="https://telegram.psots.in/user?id=${userId}">View your violations</a>`;
          } else if (count === 2) {
            msg = `Hi ${firstName}, this is your 2nd warning for ${violation}. Please be careful. 🙏\n\n<a href="https://telegram.psots.in/user?id=${userId}">View your violations</a>`;
          } else if (count >= 3) {
            msg = `Hi ${firstName}, 3rd violation reached. Admin notified. 🙏\n\n<a href="https://telegram.psots.in/user?id=${userId}">View your violations & appeal</a>`;
            await sendMessage(ADMIN_ID, `⚠️ ${firstName} (@${username}) - ${count} violations. Latest: ${violation}`, botToken);
          }

          await sendMessage(userId, msg, botToken);
        }

        return new Response('OK');
      }

      return new Response('OK');
    } catch (error) {
      console.error('Error:', error);
      return new Response('Error', { status: 500 });
    }
  }
};
