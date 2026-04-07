// PSOTS Telegram Moderation Bot for Cloudflare Workers
// With Admin Dashboard & API

const ADMIN_PIN = "1234";  // Change this to your PIN
const ADMIN_ID = 989358143;
const TELEGRAM_API = 'https://api.telegram.org/bot' + undefined;  // Will use env.BOT_TOKEN

// Default keywords - stored in KV so they can be updated
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

// Get keywords from KV or use defaults
async function getKeywords(VIOLATIONS) {
  const stored = await VIOLATIONS.get('_keywords_config');
  return stored ? JSON.parse(stored) : DEFAULT_KEYWORDS;
}

// Save keywords to KV
async function saveKeywords(keywords, VIOLATIONS) {
  await VIOLATIONS.put('_keywords_config', JSON.stringify(keywords));
}

// Check violation
function checkViolation(text, keywords) {
  const lowerText = text.toLowerCase();

  if (lowerText.includes('₹')) {
    const hasSocietyFee = keywords.societyFees.some(fee => lowerText.includes(fee.toLowerCase()));
    if (hasSocietyFee) return null;
  }

  const hasApprovedEvent = keywords.approvedEvents.some(event => lowerText.includes(event.toLowerCase()));
  if (hasApprovedEvent) return null;

  if (keywords.buySell.some(kw => lowerText.includes(kw.toLowerCase()))) return 'Buy/Sell Content';
  if (keywords.political.some(kw => lowerText.includes(kw.toLowerCase()))) return 'Political Content';
  if (keywords.religious.some(kw => lowerText.includes(kw.toLowerCase()))) return 'Religious Content';
  if (keywords.spam.some(kw => lowerText.includes(kw.toLowerCase()))) return 'Spam/Unsolicited Promotion';

  const hasAbuse = keywords.abuseHindi.some(kw => lowerText.includes(kw.toLowerCase())) ||
    keywords.abuseEnglish.some(kw => lowerText.includes(kw.toLowerCase()));
  if (hasAbuse) return 'Abusive Language';

  if (keywords.personalAttacks.some(kw => lowerText.includes(kw.toLowerCase()))) return 'Personal Attack/Foul Language';

  return null;
}

async function getUserViolations(userId, VIOLATIONS) {
  const key = `user_${userId}`;
  const data = await VIOLATIONS.get(key);
  return data ? JSON.parse(data) : null;
}

async function saveUserViolations(userId, data, VIOLATIONS) {
  const key = `user_${userId}`;
  await VIOLATIONS.put(key, JSON.stringify(data), { expirationTtl: 2592000 });
}

async function deleteMessage(chatId, messageId, BOT_TOKEN) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId })
    });
    return true;
  } catch (err) {
    return false;
  }
}

async function sendMessage(chatId, text, BOT_TOKEN) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    });
    return true;
  } catch (err) {
    return false;
  }
}

async function getChatMember(chatId, userId, BOT_TOKEN) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, user_id: userId })
    });
    const data = await response.json();
    return data.ok ? data.result : null;
  } catch (err) {
    return null;
  }
}

// ADMIN DASHBOARD HTML
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PSOTS Bot Admin Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; }
    .container { max-width: 900px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; margin-bottom: 20px; }
    .header h1 { font-size: 28px; margin-bottom: 5px; }
    .header p { opacity: 0.9; }
    .tabs { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
    .tab-btn { padding: 12px 24px; background: white; border: 2px solid #ddd; border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s; }
    .tab-btn.active { background: #667eea; color: white; border-color: #667eea; }
    .tab-btn:hover { border-color: #667eea; }
    .tab-content { display: none; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .tab-content.active { display: block; }
    .section { margin-bottom: 30px; }
    .section h2 { font-size: 20px; margin-bottom: 15px; color: #333; }
    .user-item { background: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid #667eea; }
    .user-item strong { color: #667eea; }
    .user-item p { font-size: 13px; color: #666; margin-top: 5px; }
    .btn { padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.3s; }
    .btn:hover { background: #764ba2; }
    .btn-danger { background: #e74c3c; }
    .btn-danger:hover { background: #c0392b; }
    .btn-small { padding: 6px 12px; font-size: 12px; }
    .input-group { margin-bottom: 15px; }
    .input-group label { display: block; margin-bottom: 5px; font-weight: 600; color: #333; }
    .input-group input, .input-group select { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; }
    .keyword-tag { display: inline-block; background: #667eea; color: white; padding: 6px 12px; border-radius: 20px; margin: 5px 5px 5px 0; font-size: 12px; }
    .keyword-tag .remove { margin-left: 8px; cursor: pointer; }
    .status-item { background: #f0f7ff; padding: 15px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid #3498db; }
    .status-item strong { color: #3498db; }
    .success { color: #27ae60; }
    .error { color: #e74c3c; }
    .loading { color: #667eea; }
    .message { padding: 15px; border-radius: 8px; margin-bottom: 15px; }
    .message.success { background: #d4edda; color: #155724; }
    .message.error { background: #f8d7da; color: #721c24; }
    @media (max-width: 600px) {
      .container { padding: 10px; }
      .header { padding: 20px; }
      .header h1 { font-size: 22px; }
      .tabs { gap: 5px; }
      .tab-btn { padding: 10px 15px; font-size: 13px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🤖 PSOTS Bot Admin</h1>
      <p>Manage violations, keywords, and bot status</p>
    </div>

    <div id="message"></div>

    <div class="tabs">
      <button class="tab-btn active" onclick="switchTab('violations')">📊 Violations</button>
      <button class="tab-btn" onclick="switchTab('keywords')">🔑 Keywords</button>
      <button class="tab-btn" onclick="switchTab('status')">📈 Status</button>
      <button class="tab-btn" onclick="switchTab('logs')">📝 Logs</button>
    </div>

    <!-- VIOLATIONS TAB -->
    <div id="violations" class="tab-content active">
      <div class="section">
        <h2>User Violations</h2>
        <div id="violationsList">Loading...</div>
      </div>
    </div>

    <!-- KEYWORDS TAB -->
    <div id="keywords" class="tab-content">
      <div class="section">
        <h2>Manage Keywords</h2>
        <div class="input-group">
          <label>Select Category:</label>
          <select id="categorySelect" onchange="showKeywordsForCategory()">
            <option value="buySell">Buy/Sell Content</option>
            <option value="political">Political Content</option>
            <option value="religious">Religious Content</option>
            <option value="spam">Spam/Promotions</option>
            <option value="abuseEnglish">Abusive Words (English)</option>
            <option value="abuseHindi">Abusive Words (Hindi)</option>
            <option value="personalAttacks">Personal Attacks</option>
            <option value="societyFees">Society Fees (Approved)</option>
            <option value="approvedEvents">Approved Events</option>
          </select>
        </div>
        <div id="keywordsList" style="margin-bottom: 20px;"></div>
        <div class="input-group">
          <label>Add New Keyword:</label>
          <input type="text" id="newKeyword" placeholder="Enter keyword...">
          <button class="btn" onclick="addKeyword()" style="margin-top: 10px;">Add Keyword</button>
        </div>
      </div>
    </div>

    <!-- STATUS TAB -->
    <div id="status" class="tab-content">
      <div class="section">
        <h2>Bot Status</h2>
        <button class="btn" onclick="refreshStatus()" style="margin-bottom: 15px;">🔄 Refresh Status</button>
        <div id="statusContent">Loading...</div>
      </div>
    </div>

    <!-- LOGS TAB -->
    <div id="logs" class="tab-content">
      <div class="section">
        <h2>Deleted Messages Audit Log</h2>
        <div id="logsList">Loading...</div>
      </div>
    </div>
  </div>

  <script>
    const API_BASE = '/api';

    function switchTab(tabName) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
      document.getElementById(tabName).classList.add('active');
      document.querySelector(\`[onclick="switchTab('\${tabName}')"]\`).classList.add('active');

      if (tabName === 'violations') loadViolations();
      if (tabName === 'keywords') loadKeywords();
      if (tabName === 'status') refreshStatus();
      if (tabName === 'logs') loadLogs();
    }

    async function loadViolations() {
      try {
        const res = await fetch(\`\${API_BASE}/violations\`);
        const data = await res.json();
        const html = data.violations.length === 0 ? '<p>No violations recorded yet.</p>' :
          data.violations.map(v => \`
            <div class="user-item">
              <strong>@\${v.username}</strong> - \${v.count} violations
              <p>\${v.history.slice(-3).map(h => h.type).join(' • ')}</p>
              <button class="btn btn-small btn-danger" onclick="resetUser('\${v.username}')">Reset</button>
            </div>
          \`).join('');
        document.getElementById('violationsList').innerHTML = html;
      } catch(e) {
        showMessage('Error loading violations', 'error');
      }
    }

    async function loadKeywords() {
      try {
        const res = await fetch(\`\${API_BASE}/keywords\`);
        const data = await res.json();
        window.keywordsData = data.keywords;
        showKeywordsForCategory();
      } catch(e) {
        showMessage('Error loading keywords', 'error');
      }
    }

    function showKeywordsForCategory() {
      const category = document.getElementById('categorySelect').value;
      const keywords = window.keywordsData[category] || [];
      const html = keywords.map(kw => \`
        <span class="keyword-tag">\${kw}<span class="remove" onclick="removeKeyword('\${category}', '\${kw}')">×</span></span>
      \`).join('');
      document.getElementById('keywordsList').innerHTML = \`<strong>\${category}:</strong><br>\${html || 'No keywords'}\`;
    }

    async function addKeyword() {
      const category = document.getElementById('categorySelect').value;
      const keyword = document.getElementById('newKeyword').value.trim();
      if (!keyword) return showMessage('Enter a keyword', 'error');

      try {
        const res = await fetch(\`\${API_BASE}/keywords\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, keyword, action: 'add' })
        });
        if (res.ok) {
          showMessage('Keyword added!', 'success');
          document.getElementById('newKeyword').value = '';
          loadKeywords();
        }
      } catch(e) {
        showMessage('Error adding keyword', 'error');
      }
    }

    async function removeKeyword(category, keyword) {
      try {
        const res = await fetch(\`\${API_BASE}/keywords\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, keyword, action: 'remove' })
        });
        if (res.ok) {
          loadKeywords();
        }
      } catch(e) {
        showMessage('Error removing keyword', 'error');
      }
    }

    async function resetUser(username) {
      if (!confirm(\`Reset violations for @\${username}?\`)) return;
      try {
        const res = await fetch(\`\${API_BASE}/violations\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, action: 'reset' })
        });
        if (res.ok) {
          showMessage('User reset!', 'success');
          loadViolations();
        }
      } catch(e) {
        showMessage('Error resetting user', 'error');
      }
    }

    async function refreshStatus() {
      try {
        const res = await fetch(\`\${API_BASE}/status\`);
        const data = await res.json();
        document.getElementById('statusContent').innerHTML = \`
          <div class="status-item">
            <strong>✅ Bot Status:</strong> Online<br>
            <strong>👥 Total Users:</strong> \${data.totalUsers}<br>
            <strong>⚠️ Total Violations:</strong> \${data.totalViolations}<br>
            <strong>⏱️ Last Updated:</strong> Just now
          </div>
        \`;
      } catch(e) {
        showMessage('Error loading status', 'error');
      }
    }

    async function loadLogs() {
      try {
        const res = await fetch(\`\${API_BASE}/logs\`);
        const data = await res.json();
        const html = data.logs.length === 0 ? '<p>No logs yet.</p>' :
          data.logs.slice(0, 50).map(log => \`
            <div class="user-item">
              <strong>@\${log.username}</strong> - \${log.violationType}
              <p>"\${log.messageText.substring(0, 60)}..."</p>
              <p style="font-size: 11px; color: #999;">\${new Date(log.timestamp).toLocaleString()}</p>
            </div>
          \`).join('');
        document.getElementById('logsList').innerHTML = html;
      } catch(e) {
        showMessage('Error loading logs', 'error');
      }
    }

    function showMessage(msg, type) {
      const el = document.getElementById('message');
      el.innerHTML = \`<div class="message \${type}">\${msg}</div>\`;
      setTimeout(() => el.innerHTML = '', 5000);
    }

    // Load initial data
    loadViolations();
  </script>
</body>
</html>`;

// Main handler
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Admin Dashboard
    if (pathname === '/admin' || pathname === '/admin/') {
      const pin = url.searchParams.get('pin') || '';
      if (!pin || pin !== ADMIN_PIN) {
        return new Response(`
          <!DOCTYPE html>
          <html>
          <head><meta name="viewport" content="width=device-width"><style>
            body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
            .login { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); text-align: center; width: 100%; max-width: 300px; }
            h1 { color: #333; margin-bottom: 20px; }
            input { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 6px; font-size: 16px; }
            button { width: 100%; padding: 12px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; margin-top: 10px; }
            button:hover { background: #764ba2; }
          </style></head>
          <body>
            <div class="login">
              <h1>🔐 Admin Login</h1>
              <form action="/admin" method="get">
                <input type="password" name="pin" placeholder="Enter PIN" required autofocus>
                <button type="submit">Login</button>
              </form>
            </div>
          </body>
          </html>
        `, { headers: { 'Content-Type': 'text/html' } });
      }
      return new Response(DASHBOARD_HTML, { headers: { 'Content-Type': 'text/html' } });
    }

    // API Endpoints
    if (pathname.startsWith('/api/')) {
      const endpoint = pathname.replace('/api/', '');

      if (endpoint === 'violations' && request.method === 'GET') {
        const list = await env.VIOLATIONS.list({ prefix: 'user_' });
        const violations = [];
        for (const item of list.keys) {
          const data = JSON.parse(await env.VIOLATIONS.get(item.name));
          violations.push(data);
        }
        return new Response(JSON.stringify({ violations: violations.sort((a, b) => b.count - a.count) }), {
          headers: { 'Content-Type': 'application/json' }
        });
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

      if (endpoint === 'keywords' && request.method === 'GET') {
        const keywords = await getKeywords(env.VIOLATIONS);
        return new Response(JSON.stringify({ keywords }), { headers: { 'Content-Type': 'application/json' } });
      }

      if (endpoint === 'keywords' && request.method === 'POST') {
        const body = await request.json();
        const keywords = await getKeywords(env.VIOLATIONS);
        if (body.action === 'add') {
          if (!keywords[body.category].includes(body.keyword)) {
            keywords[body.category].push(body.keyword);
          }
        } else if (body.action === 'remove') {
          keywords[body.category] = keywords[body.category].filter(kw => kw !== body.keyword);
        }
        await saveKeywords(keywords, env.VIOLATIONS);
        return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
      }

      if (endpoint === 'status') {
        const list = await env.VIOLATIONS.list({ prefix: 'user_' });
        let totalViolations = 0;
        for (const item of list.keys) {
          const data = JSON.parse(await env.VIOLATIONS.get(item.name));
          totalViolations += data.count || 0;
        }
        return new Response(JSON.stringify({ totalUsers: list.keys.length, totalViolations }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (endpoint === 'logs') {
        const list = await env.AUDIT_LOG.list();
        const logs = [];
        for (const item of list.keys) {
          const data = JSON.parse(await env.AUDIT_LOG.get(item.name));
          logs.push(data);
        }
        return new Response(JSON.stringify({ logs: logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)) }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Telegram Webhook
    if (request.method === 'POST') {
      try {
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
          await deleteMessage(chatId, message.message_id, env.BOT_TOKEN);

          let userViolations = await getUserViolations(userId, env.VIOLATIONS);
          if (!userViolations) {
            userViolations = { userId, username, count: 0, history: [], lastViolationTime: Date.now() };
          }

          userViolations.count++;
          userViolations.lastViolationTime = Date.now();
          userViolations.history.push({ type: violation, timestamp: new Date().toISOString() });
          await saveUserViolations(userId, userViolations, env.VIOLATIONS);

          const auditLog = {
            userId, username, firstName, violationType: violation,
            messageText: text, timestamp: new Date().toISOString(), chatId
          };
          const auditKey = `${Date.now()}_${userId}`;
          await env.AUDIT_LOG.put(auditKey, JSON.stringify(auditLog), { expirationTtl: 7776000 });

          const count = userViolations.count;
          let msg = '';
          if (count === 1) {
            msg = `Hi ${firstName}, your message has been removed as it appears to contain ${violation}, which is not permitted in this group as per PSOTS group guidelines. Please keep discussions focused on society matters. Thank you for understanding 🙏`;
          } else if (count === 2) {
            msg = `Hi ${firstName}, this is a second reminder — your message was removed for ${violation}. Repeated violations may result in being muted from the group. Please refer to the group guidelines. 🙏`;
          } else if (count >= 3) {
            msg = `Hi ${firstName}, your message was removed. This is your third violation. The group admin has been notified. 🙏`;
            const adminMsg = `⚠️ PSOTS Bot Alert: ${firstName} (@${username}) has reached 3 violations.\nLatest: ${violation}\nMessage: "${text}"\n\nConsider muting this member.`;
            await sendMessage(ADMIN_ID, adminMsg, env.BOT_TOKEN);
          }
          await sendMessage(userId, msg, env.BOT_TOKEN);
        }

        return new Response('OK');
      } catch (error) {
        console.error('Error:', error);
        return new Response('Error', { status: 500 });
      }
    }

    return new Response('OK');
  }
};
