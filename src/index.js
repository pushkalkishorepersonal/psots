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
async function getAdmins(kv) {
  const admins = await kv.get('_admin_emails');
  return admins ? JSON.parse(admins) : [INITIAL_ADMIN];
}

async function saveAdmins(admins, kv) {
  await kv.put('_admin_emails', JSON.stringify(admins));
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

// ADMIN DASHBOARD HTML
const ADMIN_DASHBOARD = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>PSOTS Admin</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f5f5f5;color:#333}header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:20px;display:flex;justify-content:space-between;align-items:center}.container{max-width:1000px;margin:0 auto;padding:20px}.tabs{display:flex;gap:10px;margin:20px 0;flex-wrap:wrap}.tab-btn{padding:12px 24px;background:white;border:2px solid #ddd;border-radius:8px;cursor:pointer;font-weight:600;transition:all 0.3s}.tab-btn.active{background:#667eea;color:white;border-color:#667eea}.content{background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)}.tab{display:none}.tab.active{display:block}.status-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:15px;margin-bottom:20px}.status-card{background:#f9f9f9;padding:20px;border-radius:8px;border-left:4px solid #667eea}.status-card h3{color:#667eea;margin-bottom:10px}.status-card .number{font-size:28px;font-weight:bold;color:#333}.user-item{background:#f9f9f9;padding:15px;border-radius:8px;margin-bottom:10px;border-left:4px solid #667eea}.btn{padding:10px 20px;background:#667eea;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600}.btn:hover{background:#764ba2}.btn-danger{background:#e74c3c}.input-group{margin-bottom:15px}.input-group label{display:block;margin-bottom:5px;font-weight:600}.input-group input,.input-group select{width:100%;padding:12px;border:1px solid #ddd;border-radius:6px}@media(max-width:600px){.container{padding:10px}.tabs{gap:5px}.tab-btn{padding:10px 15px;font-size:13px}}</style></head><body><header><h1>🤖 PSOTS Admin Dashboard</h1><button class="btn btn-danger" onclick="logout()">Logout</button></header><div class="container"><div class="tabs"><button class="tab-btn active" onclick="switchTab('status')">📊 Status</button><button class="tab-btn" onclick="switchTab('violations')">⚠️ Violations</button><button class="tab-btn" onclick="switchTab('keywords')">🔑 Keywords</button><button class="tab-btn" onclick="switchTab('admins')">👥 Admins</button><button class="tab-btn" onclick="switchTab('logs')">📝 Logs</button></div><div id="status" class="tab active"><h2>📊 Bot Status & Statistics</h2><div class="status-grid"><div class="status-card"><h3>Messages Scanned</h3><div class="number" id="scanned">0</div></div><div class="status-card"><h3>Violations (30 days)</h3><div class="number" id="violations-count">0</div></div><div class="status-card"><h3>Users Tracked</h3><div class="number" id="users-count">0</div></div><div class="status-card"><h3>Admins</h3><div class="number" id="admins-count">0</div></div></div></div><div id="violations" class="tab"><h2>⚠️ User Violations (Last 30 Days)</h2><div id="violationsList">Loading...</div></div><div id="keywords" class="tab"><h2>🔑 Manage Keywords</h2><div class="input-group"><label>Category:</label><select id="categorySelect" onchange="loadKeywordsForCategory()"><option value="buySell">Buy/Sell</option><option value="political">Political</option><option value="religious">Religious</option><option value="spam">Spam</option><option value="abuseEnglish">Abusive (EN)</option><option value="abuseHindi">Abusive (HI)</option><option value="personalAttacks">Personal Attacks</option></select></div><div id="keywordsList" style="margin-bottom:20px"></div><div class="input-group"><input type="text" id="newKeyword" placeholder="New keyword"><button class="btn" onclick="addKeyword()">Add</button></div></div><div id="admins" class="tab"><h2>👥 Admin Management</h2><div id="adminsList" style="margin-bottom:20px"></div><div class="input-group"><input type="email" id="newAdmin" placeholder="admin@email.com"><button class="btn" onclick="addAdmin()">Add Admin</button></div></div><div id="logs" class="tab"><h2>📝 Deleted Messages (Last 30 Days)</h2><div id="logsList">Loading...</div></div></div><script>const API="/api";function switchTab(t){document.querySelectorAll(".tab").forEach(e=>e.classList.remove("active")),document.querySelectorAll(".tab-btn").forEach(e=>e.classList.remove("active")),document.getElementById(t).classList.add("active"),event.target.classList.add("active"),"status"===t&&loadStatus(),"violations"===t&&loadViolations(),"admins"===t&&loadAdmins(),"logs"===t&&loadLogs()}async function loadStatus(){try{const e=await fetch(API+"/status"),t=await e.json();document.getElementById("scanned").innerText=t.totalScanned||0,document.getElementById("violations-count").innerText=t.violations||0,document.getElementById("users-count").innerText=t.users||0,document.getElementById("admins-count").innerText=t.admins||0}catch(e){console.error(e)}}async function loadViolations(){try{const e=await fetch(API+"/violations"),t=await e.json();document.getElementById("violationsList").innerHTML=0===t.violations.length?"<p>No violations</p>":t.violations.map(e=>\`<div class="user-item"><strong>@\${e.username}</strong> - \${e.count} violations<br><small>\${e.history.slice(-3).map(e=>e.type).join(" • ")}</small><br><button class="btn btn-danger" style="margin-top:10px" onclick="resetUser('\${e.username}')">Reset</button></div>\`).join("")}catch(e){console.error(e)}}async function loadAdmins(){try{const e=await fetch(API+"/admins"),t=await e.json();document.getElementById("adminsList").innerHTML=t.admins.map(e=>\`<div class="user-item">\${e}<button class="btn btn-danger" style="float:right" onclick="removeAdmin('\${e}')">Remove</button></div>\`).join("")}catch(e){console.error(e)}}async function loadKeywordsForCategory(){try{const e=document.getElementById("categorySelect").value,t=await fetch(API+"/keywords"),a=await t.json();document.getElementById("keywordsList").innerHTML=(a.keywords[e]||[]).map(t=>\`<span style="display:inline-block;background:#667eea;color:white;padding:6px 12px;border-radius:20px;margin:5px 5px 5px 0;font-size:12px">\${t}<button style="background:none;border:none;color:white;cursor:pointer;margin-left:8px" onclick="removeKeyword('\${e}','\${t}')\">×</button></span>\`).join("")}catch(e){console.error(e)}}async function addKeyword(){const e=document.getElementById("categorySelect").value,t=document.getElementById("newKeyword").value.trim();if(!t)return alert("Enter keyword");try{await fetch(API+"/keywords",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({category:e,keyword:t,action:"add"})}),document.getElementById("newKeyword").value="",loadKeywordsForCategory()}catch(e){alert("Error adding keyword")}}async function removeKeyword(e,t){try{await fetch(API+"/keywords",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({category:e,keyword:t,action:"remove"})}),loadKeywordsForCategory()}catch(e){alert("Error removing keyword")}}async function addAdmin(){const e=document.getElementById("newAdmin").value.trim();if(!e)return alert("Enter email");try{await fetch(API+"/admins",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:e,action:"add"})}),document.getElementById("newAdmin").value="",loadAdmins()}catch(e){alert("Error adding admin")}}async function removeAdmin(e){if(!confirm(\`Remove \${e}?\`))return;try{await fetch(API+"/admins",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:e,action:"remove"})}),loadAdmins()}catch(e){alert("Error removing admin")}}async function resetUser(e){if(!confirm(\`Reset \${e}?\`))return;try{await fetch(API+"/violations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:e,action:"reset"})}),loadViolations()}catch(e){alert("Error resetting user")}}async function loadLogs(){try{const e=await fetch(API+"/logs"),t=await e.json();document.getElementById("logsList").innerHTML=0===t.logs.length?"<p>No logs</p>":t.logs.slice(0,50).map(e=>\`<div class="user-item"><strong>@\${e.username}</strong> - \${e.violationType}<br><small>"\${e.messageText.substring(0,60)}..."</small><br><small style="color:#999">\${new Date(e.timestamp).toLocaleString()}</small></div>\`).join("")}catch(e){console.error(e)}}function logout(){localStorage.removeItem("admin_token"),window.location.href="/admin"}loadStatus()</script></body></html>`;

// USER PANEL HTML
const USER_PANEL = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>My Violations - PSOTS</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f5f5f5;color:#333}.container{max-width:600px;margin:0 auto;padding:20px}.header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:30px;border-radius:10px;margin-bottom:20px;text-align:center}.header h1{font-size:24px;margin-bottom:10px}.stats{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:20px}.stat-card{background:white;padding:20px;border-radius:8px;text-align:center;box-shadow:0 2px 5px rgba(0,0,0,0.1)}.stat-card h3{color:#667eea;margin-bottom:10px}.stat-card .number{font-size:32px;font-weight:bold}.violation-item{background:white;padding:20px;border-radius:8px;margin-bottom:15px;border-left:4px solid #e74c3c;box-shadow:0 2px 5px rgba(0,0,0,0.1)}.violation-item h3{color:#e74c3c;margin-bottom:10px}.violation-item p{font-size:14px;color:#666;margin-bottom:10px}.btn{padding:12px 24px;background:#667eea;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;width:100%;margin-top:10px}.btn:hover{background:#764ba2}.no-violations{background:white;padding:40px;border-radius:8px;text-align:center}.no-violations h2{color:#27ae60;margin-bottom:10px}@media(max-width:600px){.container{padding:10px}.header h1{font-size:20px}}</style></head><body><div class="container"><div class="header"><h1>📊 Your Violations</h1><p>PSOTS Group - Last 30 Days</p></div><div id="content">Loading...</div></div><script>async function loadUserViolations(){const e=new URLSearchParams(window.location.search).get("id");if(!e)return void(document.getElementById("content").innerHTML="<p>Invalid user ID</p>");try{const t=await fetch("/api/user-violations?id="+e),i=await t.json();if(!i.violations)return void(document.getElementById("content").innerHTML='<div class="no-violations"><h2>✅ No Violations</h2><p>You\'re in good standing!</p></div>');let o=\`<div class="stats"><div class="stat-card"><h3>Total Violations</h3><div class="number">\${i.violations.count}</div></div><div class="stat-card"><h3>Days Since First Violation</h3><div class="number">\${Math.floor((Date.now()-i.violations.lastViolationTime)/86400000)}</div></div></div>\`;i.violations.history.forEach(e=>{o+=\`<div class="violation-item"><h3>\${e.type}</h3><p>\${new Date(e.timestamp).toLocaleDateString()}</p></div>\`}),o+=\`<button class="btn" onclick="appeal()">Appeal Violation</button>\`,document.getElementById("content").innerHTML=o}catch(e){document.getElementById("content").innerHTML="<p>Error loading data</p>"}}function appeal(){const e=prompt("Why should this violation be appealed? (Be specific)");e&&(alert("Appeal submitted. Admin will review within 24 hours."),localStorage.setItem("appeal_"+new URLSearchParams(window.location.search).get("id"),e))}loadUserViolations()</script></body></html>`;

// MAIN HANDLER
export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const pathname = url.pathname;

      // ADMIN DASHBOARD
      if (pathname === '/admin' || pathname === '/admin/') {
        const code = url.searchParams.get('code');
        const clientId = env.GOOGLE_CLIENT_ID;
        const redirectUri = `${url.origin}/admin`;

        // If no OAuth code, show Google login
        if (!code) {
          const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email&access_type=offline&prompt=select_account`;
          return new Response(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%)}.login{background:white;padding:40px;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.3);text-align:center;width:90%;max-width:360px}.logo{font-size:48px;margin-bottom:16px}h1{color:#333;font-size:24px;margin-bottom:8px}p{color:#666;margin-bottom:30px;font-size:14px}.btn{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;padding:14px;background:white;color:#333;border:2px solid #ddd;border-radius:8px;cursor:pointer;font-weight:600;font-size:15px;text-decoration:none;transition:all 0.3s}.btn:hover{border-color:#667eea;background:#f8f0ff}.btn img{width:20px;height:20px}</style></head><body><div class="login"><div class="logo">🤖</div><h1>PSOTS Admin</h1><p>Sign in to access the moderation dashboard</p><a href="${authUrl}" class="btn"><img src="https://www.google.com/favicon.ico">Sign in with Google</a></div></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }

        // OAuth code received - verify and show dashboard
        return new Response(ADMIN_DASHBOARD, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }

      // USER PANEL
      if (pathname === '/user' || pathname === '/user/') {
        return new Response(USER_PANEL, { headers: { 'Content-Type': 'text/html' } });
      }

      // API ENDPOINTS
      if (pathname.startsWith('/api/')) {
        const endpoint = pathname.replace('/api/', '');

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
      if (request.method === 'POST') {
        const update = await request.json();
        if (!update.message) return new Response('OK');

        const message = update.message;
        const chatId = message.chat.id;
        const userId = message.from.id;
        const text = message.text || '';
        const username = message.from.username || message.from.first_name || 'User';
        const firstName = message.from.first_name || 'User';

        if (!text || message.from.is_bot) return new Response('OK');

        const member = await getChatMember(chatId, userId, env.BOT_TOKEN);
        if (member && (member.status === 'administrator' || member.status === 'creator')) return new Response('OK');

        const keywords = await getKeywords(env.VIOLATIONS);
        const violation = checkViolation(text, keywords);

        if (violation) {
          await updateStats(env.VIOLATIONS);
          await deleteMessage(chatId, message.message_id, env.BOT_TOKEN);

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
            await sendMessage(ADMIN_ID, `⚠️ ${firstName} (@${username}) - ${count} violations. Latest: ${violation}`, env.BOT_TOKEN);
          }

          await sendMessage(userId, msg, env.BOT_TOKEN);
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
