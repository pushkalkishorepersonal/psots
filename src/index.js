// PSOTS Telegram Moderation Bot - Cloudflare Workers
// With Google OAuth, RBAC, User Panel, Appeals & Status Bar

import { EVENTS_HTML, GRAND_LOBBY_HTML, MARKETPLACE_HTML, HANDBOOK_HTML, ADMIN_DASHBOARD, USER_PANEL } from './templates.js';
import { 
    INITIAL_ADMIN, DEFAULT_KEYWORDS, DEFAULT_ACTIONS,
    getBotToken, getAdmins, saveAdmins, getPINs, savePINs, 
    getKeywords, saveKeywords, getStats, updateStats, 
    getActionSettings, saveActionSettings, getActionForViolationCount, 
    getUserViolations, saveUserViolations, getViolationsLast30Days, 
    isResidentVerified, markResidentVerified, checkViolation 
} from './store.js';
import { sendMessage, deleteTelegramMessage, parseListingWithGemini, fetchChatMember } from './telegram.js';

const ADMIN_ID = 989358143;
const GOOGLE_CLIENT_ID_VALUE = "774636811164-c9n9n8a27c9d0fbhg7e6vie759gq1sun.apps.googleusercontent.com";

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const pathname = url.pathname;

      if (pathname === '/' || pathname === '/index.html') {
          return new Response(GRAND_LOBBY_HTML(env.GOOGLE_CLIENT_ID), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }

      if (pathname === '/market') {
          return new Response(MARKETPLACE_HTML, { headers: { 'Content-Type': 'text/html' } });
      }

      if (pathname === '/handbook') {
          return new Response(HANDBOOK_HTML, { headers: { 'Content-Type': 'text/html' } });
      }

      if (pathname === '/events') {
          return new Response(EVENTS_HTML, { headers: { 'Content-Type': 'text/html' } });
      }

      if (pathname === '/admin' || pathname === '/admin/') {
        return new Response(ADMIN_DASHBOARD(env.GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID_VALUE), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }

      if (pathname === '/user' || pathname === '/user/') {
        return new Response(USER_PANEL, { headers: { 'Content-Type': 'text/html' } });
      }

      if (pathname.startsWith('/api/')) {
        const endpoint = pathname.replace('/api/', '');
        const group = url.searchParams.get('group');

        if (endpoint === 'my-groups') {
            const email = url.searchParams.get('email');
            if (!email) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });

            const groupsJson = await env.VIOLATIONS.get('_groups');
            const allGroups = groupsJson ? JSON.parse(groupsJson) : {};
            const allowed = {};

            const globalAdminsJson = await env.VIOLATIONS.get('_admin_emails');
            const globalAdmins = globalAdminsJson ? JSON.parse(globalAdminsJson) : ['pushkalkishore@gmail.com'];
            const isGlobalAdmin = globalAdmins.includes(email);

            for (const [id, data] of Object.entries(allGroups)) {
                if (isGlobalAdmin) {
                    allowed[id] = data;
                } else {
                    const groupAdminsJson = await env.VIOLATIONS.get(`_admin_emails_${id}`);
                    const groupAdmins = groupAdminsJson ? JSON.parse(groupAdminsJson) : [];
                    if (groupAdmins.includes(email)) {
                        allowed[id] = data;
                    }
                }
            }
            if (isGlobalAdmin && Object.keys(allowed).length === 0) {
                allowed['initial'] = { title: 'System Initialization (No Groups Active)' };
            }

            const botToken = await getBotToken(env.VIOLATIONS);
            const responseData = {
                groups: allowed,
                tokenSet: !!botToken
            };
            return new Response(JSON.stringify(responseData), { headers: { 'Content-Type': 'application/json' } });
        }

        if (endpoint === 'groups') {
            const groupsJson = await env.VIOLATIONS.get('_groups');
            return new Response(groupsJson || '{}', { headers: { 'Content-Type': 'application/json' } });
        }

        if (endpoint === 'group-photo') {
            const botToken = await getBotToken(env.VIOLATIONS);
            const path = url.searchParams.get('path');
            if (!botToken || !path) return new Response('Not Found', { status: 404 });
            
            const res = await fetch(`https://api.telegram.org/file/bot${botToken}/${path}`);
            return new Response(res.body, { headers: { 'Content-Type': res.headers.get('Content-Type') || 'image/jpeg', 'Cache-Control': 'public, max-age=86400' } });
        }

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

        if (endpoint === 'check-keywords') {
          const keywords = await getKeywords(env.VIOLATIONS);
          return new Response(JSON.stringify({
            keywordCategories: Object.keys(keywords),
            buySell: keywords.buySell,
            total: Object.values(keywords).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0)
          }), { headers: { 'Content-Type': 'application/json' } });
        }

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

        if (endpoint === 'diagnostics') {
          const botToken = await getBotToken(env.VIOLATIONS);
          const hasToken = !!botToken;
          const tokenPreview = botToken ? botToken.substring(0, 10) + '...' : 'NOT SET';

          const kvList = await env.VIOLATIONS.list();
          const kvKeys = kvList.keys.map(k => k.name);

          const botTokenExists = kvKeys.includes('_bot_token');
          const botTokenValue = botTokenExists ? await env.VIOLATIONS.get('_bot_token') : null;

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

        if (endpoint === 'status') {
          const stats = await getStats(env.VIOLATIONS, group);
          const violations = await getViolationsLast30Days(env.VIOLATIONS, group);
          const admins = await getAdmins(env.VIOLATIONS, group);
          const userList = await env.VIOLATIONS.list({ prefix: 'user_' });

          return new Response(JSON.stringify({
            totalScanned: stats.totalScanned,
            violations: violations.reduce((sum, v) => sum + v.count, 0),
            users: userList.keys.length,
            admins: admins.length
          }), { headers: { 'Content-Type': 'application/json' } });
        }

        if (endpoint === 'violations' && request.method === 'GET') {
          const violations = await getViolationsLast30Days(env.VIOLATIONS, group);
          return new Response(JSON.stringify({ violations: violations.sort((a, b) => b.count - a.count) }), { headers: { 'Content-Type': 'application/json' } });
        }

        if (endpoint === 'violations' && request.method === 'POST') {
          const body = await request.json();
          if (body.action === 'reset') {
            const prefix = group ? `user_${group}_` : 'user_';
            const list = await env.VIOLATIONS.list({ prefix });
            for (const item of list.keys) {
              const data = JSON.parse(await env.VIOLATIONS.get(item.name));
              if (data.username === body.username) {
                data.count = 0;
                await saveUserViolations(data.userId, data, env.VIOLATIONS, group);
                break;
              }
            }
          }
          return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
        }

        if (endpoint.startsWith('user-violations')) {
          const userId = new URL(request.url).searchParams.get('id');
          const violations = await getUserViolations(userId, env.VIOLATIONS, group);
          const admins = await getAdmins(env.VIOLATIONS, group);

          return new Response(JSON.stringify({
            violations,
            admins: admins.map(a => ({ email: a, telegram_id: null }))
          }), { headers: { 'Content-Type': 'application/json' } });
        }

        if (endpoint === 'keywords' && request.method === 'GET') {
          const keywords = await getKeywords(env.VIOLATIONS, group);
          return new Response(JSON.stringify({ keywords }), { headers: { 'Content-Type': 'application/json' } });
        }

        if (endpoint === 'keywords' && request.method === 'POST') {
          const body = await request.json();
          const keywords = await getKeywords(env.VIOLATIONS, group);
          if (body.action === 'add') {
            if (!keywords[body.category]) keywords[body.category] = [];
            if (!keywords[body.category].includes(body.keyword)) {
              keywords[body.category].push(body.keyword);
            }
          } else if (body.action === 'remove') {
            keywords[body.category] = keywords[body.category].filter(kw => kw !== body.keyword);
          }
          await saveKeywords(keywords, env.VIOLATIONS, group);
          return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
        }

        if (endpoint === 'admins' && request.method === 'GET') {
          const admins = await getAdmins(env.VIOLATIONS, group);
          const adminTgIds = await env.VIOLATIONS.get('_admin_telegram_ids');
          const tgIds = adminTgIds ? JSON.parse(adminTgIds) : {};
          return new Response(JSON.stringify({ admins, telegram_ids: tgIds }), { headers: { 'Content-Type': 'application/json' } });
        }

        if (endpoint === 'admins' && request.method === 'POST') {
          const body = await request.json();

          if (body.action === 'add' || body.action === 'remove') {
            const admins = await getAdmins(env.VIOLATIONS, group);
            if (body.action === 'add' && !admins.includes(body.email)) {
              admins.push(body.email);
            } else if (body.action === 'remove') {
              admins.splice(admins.indexOf(body.email), 1);
            }
            await saveAdmins(admins, env.VIOLATIONS, group);
          }

          if (body.action === 'register-telegram') {
            const adminTgIds = await env.VIOLATIONS.get('_admin_telegram_ids');
            const tgIds = adminTgIds ? JSON.parse(adminTgIds) : {};
            tgIds[body.email] = body.telegram_id;
            await env.VIOLATIONS.put('_admin_telegram_ids', JSON.stringify(tgIds));
          }

          return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
        }

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

        if (endpoint === 'verify-pin' && request.method === 'POST') {
          const body = await request.json();
          const pins = await getPINs(env.VIOLATIONS);
          const valid = pins.includes(body.pin);
          return new Response(JSON.stringify({ valid }), { headers: { 'Content-Type': 'application/json' } });
        }

        if (endpoint === 'verify-resident' && request.method === 'POST') {
            const body = await request.json(); 
            if (body.action === 'approve') {
                await markResidentVerified(body.userId, { ...body.details, verifiedAt: new Date().toISOString() }, env.VIOLATIONS);
            }
            return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
        }

        if (endpoint === 'residents' && request.method === 'GET') {
            const list = await env.VIOLATIONS.list({ prefix: 'resident_verified_' });
            const userList = await env.VIOLATIONS.list({ prefix: 'user_' });
            const residents = [];
            
            for (const item of list.keys) {
                const data = JSON.parse(await env.VIOLATIONS.get(item.name));
                residents.push({ ...data, userId: item.name.replace('resident_verified_', '') });
            }
            
            for (const item of userList.keys) {
                const userId = item.name.replace('user_', '');
                if (!residents.find(r => r.userId === userId)) {
                    const data = JSON.parse(await env.VIOLATIONS.get(item.name));
                    residents.push({ userId, username: data.username, status: 'pending' });
                }
            }
            
            return new Response(JSON.stringify({ residents }), { headers: { 'Content-Type': 'application/json' } });
        }

        if (endpoint === 'register' && request.method === 'POST') {
            const body = await request.json(); 
            const flatId = `flat_${body.tower}_${body.flat}`;
            
            const flatData = await env.VIOLATIONS.get(flatId);
            const flatMembers = flatData ? JSON.parse(flatData) : [];
            if (flatMembers.length >= 4) {
                return new Response(JSON.stringify({ error: 'Max 4 accounts reached for this flat.' }), { status: 403 });
            }
            
            const residentData = { ...body, registeredAt: new Date().toISOString(), status: 'pending' };
            await markResidentVerified(body.userId, residentData, env.VIOLATIONS);
            
            flatMembers.push(body.userId);
            await env.VIOLATIONS.put(flatId, JSON.stringify(flatMembers));
            
            return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
        }

        if (endpoint.startsWith('marketplace') && request.method === 'GET') {
            const list = await env.VIOLATIONS.list({ prefix: 'market_listing_' });
            const listings = [];
            for (const item of list.keys) {
                const data = JSON.parse(await env.VIOLATIONS.get(item.name));
                listings.push({ ...data, listingId: item.name });
            }
            return new Response(JSON.stringify({ listings: listings.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)) }), { headers: { 'Content-Type': 'application/json' } });
        }

        if (endpoint === 'marketplace' && request.method === 'POST') {
            const body = await request.json(); 

            const verified = await isResidentVerified(body.userId, env.VIOLATIONS);
            if (!verified) return new Response(JSON.stringify({ error: 'Identity verification required to post.' }), { status: 403 });

            const keywords = await getKeywords(env.VIOLATIONS, group);
            const violation = checkViolation(body.description + ' ' + body.item, keywords);
            if (violation && violation !== 'Buy/Sell Content') {
                return new Response(JSON.stringify({ error: 'Post violates community guidelines: ' + violation }), { status: 400 });
            }

            const listing = { 
                ...body, 
                timestamp: new Date().toISOString(),
                source: 'web'
            };
            const listingId = `market_listing_${Date.now()}_${body.userId}`;
            await env.VIOLATIONS.put(listingId, JSON.stringify(listing), { expirationTtl: 2592000 });
            return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
        }

        if (endpoint.startsWith('marketplace') && request.method === 'DELETE') {
            const id = url.searchParams.get('id');
            if (id) await env.VIOLATIONS.delete(id);
            return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
        }

        if (endpoint === 'settings' && request.method === 'GET') {
          const settings = await getActionSettings(env.VIOLATIONS, group);
          return new Response(JSON.stringify({ settings }), { headers: { 'Content-Type': 'application/json' } });
        }

        if (endpoint === 'settings' && request.method === 'POST') {
          const settings = await request.json();
          await saveActionSettings(settings, env.VIOLATIONS, group);
          return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
        }

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

      if (request.method === 'POST' && !pathname.startsWith('/api/')) {
        const update = await request.json();

        if (update.callback_query) {
            const cb = update.callback_query;
            const data = cb.data; 
            const adminId = cb.from.id;
            const botToken = await getBotToken(env.VIOLATIONS);

            if (data.startsWith('approve_')) {
                const targetUserId = data.replace('approve_', '');
                await markResidentVerified(targetUserId, { verifiedBy: adminId, verifiedAt: new Date().toISOString() }, env.VIOLATIONS);
                await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ callback_query_id: cb.id, text: "✅ Resident Approved!" })
                });
                await sendMessage(cb.message.chat.id, `✅ Resident verified by admin: ${cb.from.first_name}`, botToken);
            }
            return new Response('OK');
        }

        if (!update.message) return new Response('OK');

        const botToken = await getBotToken(env.VIOLATIONS);
        if (!botToken) return new Response('OK');

        const message = update.message;
        const chatId = message.chat.id;
        const chatTitle = message.chat.title || 'Private Chat';
        const userId = message.from.id;
        const text = message.text || '';
        const username = message.from.username || message.from.first_name || 'User';
        const firstName = message.from.first_name || 'User';

        const keywords = await getKeywords(env.VIOLATIONS, chatId);
        
        await env.VIOLATIONS.put('_debug_last_chatid', JSON.stringify({chatId, chatTitle, type: message.chat.type}));
        const groupsJson = await env.VIOLATIONS.get('_groups');
        let groups = groupsJson ? JSON.parse(groupsJson) : {};
        const chatKey = String(chatId);

        if (!groups[chatKey]) {
            let photoUrl = null;
            try {
                const chatRes = await fetch(`https://api.telegram.org/bot${botToken}/getChat?chat_id=${chatId}`);
                const chatData = await chatRes.json();
                if (chatData.ok && chatData.result.photo) {
                    const fileId = chatData.result.photo.small_file_id;
                    const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
                    const fileData = await fileRes.json();
                    if (fileData.ok) {
                        photoUrl = `/api/group-photo?path=${encodeURIComponent(fileData.result.file_path)}`;
                    }
                }
            } catch (e) {
                console.error("Group Meta Fetch Error:", e);
            }

            groups[chatKey] = { 
                title: chatTitle, 
                firstSeen: new Date().toISOString(),
                photo: photoUrl
            };
            await env.VIOLATIONS.put('_groups', JSON.stringify(groups));
        }

        await env.VIOLATIONS.put(`_log_webhook_${Date.now()}`, JSON.stringify({
          chatId, userId, text, timestamp: new Date().toISOString()
        }), { expirationTtl: 86400 });

        if (!text || message.from.is_bot) return new Response('OK');

        const member = await fetchChatMember(chatId, userId, botToken);
        const isAdmin = member && (member.status === 'administrator' || member.status === 'creator');

        // Handle /start command for registration verification
        if (text === '/start' || text.startsWith('/start')) {
            await sendMessage(chatId, `✅ <b>Group Linked Successfully!</b>\n\n<b>Title:</b> ${chatTitle}\n<b>ID:</b> <code>${chatId}</code>\n\nAdmins can now manage this group via the <a href="https://telegram.psots.in/admin">PSOTS Dashboard</a>.`, botToken);
            return new Response('OK');
        }

        if (isAdmin) {
          return new Response('OK');
        }

        const isOwnersGroup = (keywords.settings?.groupType === 'owners');
        if (isOwnersGroup) {
            const verified = await isResidentVerified(userId, env.VIOLATIONS);
            if (!verified) {}
        }

        const violation = checkViolation(text, keywords);

        const isMarketplaceGroup = (keywords.settings?.groupType === 'marketplace');
        if (isMarketplaceGroup && violation === 'Buy/Sell Content') {
            const aiData = await parseListingWithGemini(text, env);
            const listing = { 
                userId, username, text, timestamp: new Date().toISOString(), 
                chatId, messageId: message.message_id,
                ...aiData
            };
            await env.VIOLATIONS.put(`market_listing_${Date.now()}_${userId}`, JSON.stringify(listing), { expirationTtl: 2592000 });
            return new Response('OK');
        }

        await env.VIOLATIONS.put(`_log_check_${Date.now()}`, JSON.stringify({
          text,
          violation,
          keywordCategories: Object.keys(keywords),
          buySellCount: keywords.buySell ? keywords.buySell.length : 0,
          timestamp: new Date().toISOString()
        }), { expirationTtl: 86400 });

        if (violation) {
          await updateStats(env.VIOLATIONS, chatId);
          await deleteTelegramMessage(chatId, message.message_id, botToken);

          let userViolations = await getUserViolations(userId, env.VIOLATIONS, chatId);
          if (!userViolations) {
            userViolations = { userId, username, count: 0, history: [], lastViolationTime: Date.now() };
          }

          userViolations.count++;
          userViolations.lastViolationTime = Date.now();
          userViolations.history.push({
            type: violation,
            timestamp: new Date().toISOString(),
            message: text.substring(0, 200)
          });
          await saveUserViolations(userId, userViolations, env.VIOLATIONS, chatId);

          const auditLog = { userId, username, firstName, violationType: violation, messageText: text, timestamp: new Date().toISOString(), chatId };
          await env.AUDIT_LOG.put(`${Date.now()}_${userId}`, JSON.stringify(auditLog), { expirationTtl: 7776000 });

          const count = userViolations.count;
          let msg = '';

          if (count === 1) {
            msg = `Hi ${firstName}, your message was removed for: ${violation}. Please follow group guidelines. 🙏\n\n<a href="https://telegram.psots.in/user?id=${userId}">View your violations</a>`;
          } else if (count === 2) {
            msg = `Hi ${firstName}, this is your 2nd warning for ${violation}. Please be careful. 🙏\n\n<a href="https://telegram.psots.in/user?id=${userId}">View your violations</a>`;
          } else if (count === 3) {
            msg = `Hi ${firstName}, 3rd violation reached. Admin notified. 🙏\n\n<a href="https://telegram.psots.in/user?id=${userId}">View your violations & appeal</a>`;
            await sendMessage(ADMIN_ID, `⚠️ ALERT: ${firstName} (@${username}) reached 3 violations. Latest: ${violation}`, botToken);
          } else if (count === 5) {
            msg = `Hi ${firstName}, you have reached 5 violations. This is a serious warning. Further violations may result in removal from the group. 🚫\n\n<a href="https://telegram.psots.in/user?id=${userId}">View your violations & appeal</a>`;
            await sendMessage(ADMIN_ID, `🚨 CRITICAL: ${firstName} (@${username}) reached 5 violations! Repeat offender. Consider action.`, botToken);
          } else if (count >= 10) {
            msg = `Hi ${firstName}, you have been removed from the group due to repeated violations. Please contact an admin to appeal. 🚫`;
            await sendMessage(ADMIN_ID, `🔴 EXTREME: ${firstName} (@${username}) reached 10 violations. Auto-removal may be needed.`, botToken);
          } else {
            msg = `Hi ${firstName}, you have ${count} violations. Please review the guidelines. 🙏\n\n<a href="https://telegram.psots.in/user?id=${userId}">View your violations & appeal</a>`;
          }

          await sendMessage(userId, msg, botToken);

          if (count === 3 || count === 5 || count === 10) {
            await env.VIOLATIONS.put(`_admin_alert_${Date.now()}`, JSON.stringify({
              userId, username, firstName, count, violation, timestamp: new Date().toISOString()
            }), { expirationTtl: 86400 });
          }
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
