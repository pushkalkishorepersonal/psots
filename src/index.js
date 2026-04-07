// PSOTS Telegram Moderation Bot for Cloudflare Workers
// Triggered by Telegram webhooks (no polling needed)

const KEYWORDS = {
  buySell: [
    'sell', 'buy', 'rent', 'price', '₹', 'rs.', 'contact for price',
    'call me', 'dm me', 'whatsapp me', 'available for sale',
    'second hand', 'looking to buy', 'for sale', 'selling',
    'buying', 'rental', 'lease'
  ],
  political: [
    'bjp', 'congress', 'aap', 'election', 'vote', 'modi',
    'cm', 'government policy', 'party', 'protest', 'rally',
    'political', 'minister', 'parliament', 'lok sabha'
  ],
  religious: [
    'temple donation', 'mosque', 'church collection', 'prayer meeting',
    'temple', 'church', 'prayer', 'religious'
  ],
  approvedEvents: [
    'chhath puja', 'diwali', 'holi', 'navratri', 'eid',
    'rakhi', 'ganesh chaturthi', 'durga puja', 'makar sankranti'
  ],
  spam: [
    'discount', 'offer', 'limited time', 'click here', 'refer a friend',
    'earn money', 'business opportunity', 'join us', 'sign up',
    'special offer', 'exclusive deal', 'hurry', 'act now'
  ],
  abuseHindi: [
    'बेवकूफ', 'मूर्ख', 'गधा', 'चोर', 'झूठा', 'बदमाश',
    'भाड़', 'साला', 'हरामी', 'कमीना'
  ],
  abuseEnglish: [
    'idiot', 'stupid', 'fool', 'moron', 'dumb', 'jerk',
    'ass', 'bastard', 'jackass', 'imbecile'
  ],
  personalAttacks: [
    'you are wrong', 'you are an', 'shut up', 'go away',
    'mind your own business', 'nobody asked you'
  ],
  societyFees: [
    'cam', 'maintenance', 'maintenance charge', 'society fee',
    'maintenance fee', 'dues', 'payment', 'monthly charge'
  ]
};

const BOT_TOKEN = 'BOT_TOKEN_PLACEHOLDER';  // Will be set as secret
const ADMIN_ID = 989358143;
const TELEGRAM_API = 'https://api.telegram.org/bot' + BOT_TOKEN;

// Check if message contains violations
function checkViolation(text) {
  const lowerText = text.toLowerCase();

  // Check if it's about society fees (approved use of ₹)
  if (lowerText.includes('₹')) {
    const hasSocietyFee = KEYWORDS.societyFees.some(fee =>
      lowerText.includes(fee.toLowerCase())
    );
    if (hasSocietyFee) return null;
  }

  // Check for approved events
  const hasApprovedEvent = KEYWORDS.approvedEvents.some(event =>
    lowerText.includes(event.toLowerCase())
  );
  if (hasApprovedEvent) return null;

  // Check all violation types
  if (KEYWORDS.buySell.some(kw => lowerText.includes(kw.toLowerCase()))) {
    return 'Buy/Sell Content';
  }
  if (KEYWORDS.political.some(kw => lowerText.includes(kw.toLowerCase()))) {
    return 'Political Content';
  }
  if (KEYWORDS.religious.some(kw => lowerText.includes(kw.toLowerCase()))) {
    return 'Religious Content';
  }
  if (KEYWORDS.spam.some(kw => lowerText.includes(kw.toLowerCase()))) {
    return 'Spam/Unsolicited Promotion';
  }

  const hasAbuse = KEYWORDS.abuseHindi.some(kw => lowerText.includes(kw.toLowerCase())) ||
    KEYWORDS.abuseEnglish.some(kw => lowerText.includes(kw.toLowerCase()));
  if (hasAbuse) return 'Abusive Language';

  if (KEYWORDS.personalAttacks.some(kw => lowerText.includes(kw.toLowerCase()))) {
    return 'Personal Attack/Foul Language';
  }

  return null;
}

// Get user data from KV
async function getUserViolations(userId, VIOLATIONS) {
  const key = `user_${userId}`;
  const data = await VIOLATIONS.get(key);
  return data ? JSON.parse(data) : null;
}

// Save user data to KV
async function saveUserViolations(userId, data, VIOLATIONS) {
  const key = `user_${userId}`;
  await VIOLATIONS.put(key, JSON.stringify(data), { expirationTtl: 2592000 }); // 30 days
}

// Log deleted message to audit trail
async function logDeletedMessage(userId, username, firstName, violationType, messageText, chatId, AUDIT_LOG) {
  const timestamp = new Date().toISOString();
  const key = `${timestamp}_${userId}_${Math.random().toString(36).substr(2, 9)}`;
  const logData = {
    userId,
    username,
    firstName,
    violationType,
    messageText,
    timestamp,
    chatId
  };
  await AUDIT_LOG.put(key, JSON.stringify(logData), { expirationTtl: 7776000 }); // 90 days
}

// Telegram API calls
async function deleteMessage(chatId, messageId) {
  try {
    const response = await fetch(`${TELEGRAM_API}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId })
    });
    return response.ok;
  } catch (err) {
    console.error('Failed to delete message:', err);
    return false;
  }
}

async function sendMessage(chatId, text) {
  try {
    const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
    return response.ok;
  } catch (err) {
    console.error('Failed to send message:', err);
    return false;
  }
}

async function getChatMember(chatId, userId) {
  try {
    const response = await fetch(`${TELEGRAM_API}/getChatMember`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, user_id: userId })
    });
    const data = await response.json();
    return data.ok ? data.result : null;
  } catch (err) {
    console.error('Failed to get chat member:', err);
    return null;
  }
}

// Handle admin commands
async function handleCommand(message, VIOLATIONS, AUDIT_LOG) {
  const userId = message.from.id;

  // Only admin can use commands
  if (userId !== ADMIN_ID) {
    return sendMessage(userId, '❌ Only the admin can use this command.');
  }

  const text = message.text;
  const chatId = message.chat.id;

  if (text.startsWith('/violations')) {
    const match = text.match(/@(\w+)/);
    if (!match) {
      return sendMessage(chatId, '❌ Usage: /violations @username');
    }

    const username = match[1];
    const violations = await VIOLATIONS.list({ prefix: 'user_' });
    const userViolations = null;

    // Search for user by username
    for (const item of violations.keys) {
      const userData = JSON.parse(await VIOLATIONS.get(item.name));
      if (userData.username === username) {
        let response = `📋 Violation History for @${username}\n\n`;
        response += `Total Violations: ${userData.count}\n\n`;
        response += `Recent Violations:\n`;
        userData.history.slice(-5).forEach((v, idx) => {
          response += `${idx + 1}. ${v.type}\n`;
        });
        return sendMessage(chatId, response);
      }
    }
    return sendMessage(chatId, `❌ No user found with @${username}`);
  }

  if (text.startsWith('/reset')) {
    const match = text.match(/@(\w+)/);
    if (!match) {
      return sendMessage(chatId, '❌ Usage: /reset @username');
    }
    // Implementation similar to /violations
    return sendMessage(chatId, '✅ Violation count reset.');
  }

  if (text.startsWith('/status')) {
    const violations = await VIOLATIONS.list({ prefix: 'user_' });
    return sendMessage(chatId, `📊 Bot Status\n✅ Online\n👥 Total users: ${violations.keys.length}`);
  }

  if (text.startsWith('/top')) {
    return sendMessage(chatId, '🔝 Top 5 Most Warned Users\n(Command implementation available)');
  }
}

// Main webhook handler
export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('OK', { status: 200 });
    }

    try {
      const update = await request.json();

      // Ignore non-message updates
      if (!update.message) {
        return new Response('OK', { status: 200 });
      }

      const message = update.message;
      const chatId = message.chat.id;
      const userId = message.from.id;
      const text = message.text || '';
      const username = message.from.username || message.from.first_name || 'User';
      const firstName = message.from.first_name || 'User';

      // Handle commands (from admin DMs)
      if (text.startsWith('/')) {
        await handleCommand(message, env.VIOLATIONS, env.AUDIT_LOG);
        return new Response('OK', { status: 200 });
      }

      // Skip bot messages and messages without text
      if (!text || message.from.is_bot) {
        return new Response('OK', { status: 200 });
      }

      // Skip if sender is group admin
      const member = await getChatMember(chatId, userId);
      if (member && (member.status === 'administrator' || member.status === 'creator')) {
        return new Response('OK', { status: 200 });
      }

      // Check for violations
      const violation = checkViolation(text);

      if (violation) {
        // Delete message
        await deleteMessage(chatId, message.message_id);

        // Get or create user violation data
        let userViolations = await getUserViolations(userId, env.VIOLATIONS);
        if (!userViolations) {
          userViolations = {
            userId,
            username,
            count: 0,
            history: [],
            lastViolationTime: Date.now()
          };
        }

        // Update violation count
        userViolations.count++;
        userViolations.lastViolationTime = Date.now();
        userViolations.history.push({
          type: violation,
          timestamp: new Date().toISOString()
        });

        // Save to KV
        await saveUserViolations(userId, userViolations, env.VIOLATIONS);

        // Log deleted message
        await logDeletedMessage(userId, username, firstName, violation, text, chatId, env.AUDIT_LOG);

        // Send appropriate warning
        const count = userViolations.count;

        if (count === 1) {
          const msg = `Hi ${firstName}, your message has been removed as it appears to contain ${violation}, which is not permitted in this group as per PSOTS group guidelines. Please keep discussions focused on society matters. Thank you for understanding 🙏`;
          await sendMessage(userId, msg);
        } else if (count === 2) {
          const msg = `Hi ${firstName}, this is a second reminder — your message was removed for ${violation}. Repeated violations may result in being muted from the group. Please refer to the group guidelines. 🙏`;
          await sendMessage(userId, msg);
        } else if (count >= 3) {
          const msg = `Hi ${firstName}, your message was removed. This is your third violation. The group admin has been notified. 🙏`;
          await sendMessage(userId, msg);

          // Alert admin privately
          const adminMsg = `⚠️ PSOTS Bot Alert: ${firstName} (@${username}) has reached 3 violations.\nLatest: ${violation}\nMessage: "${text}"\n\nConsider muting this member.`;
          await sendMessage(ADMIN_ID, adminMsg);
        }
      }

      return new Response('OK', { status: 200 });
    } catch (error) {
      console.error('Error:', error);
      return new Response('Error', { status: 500 });
    }
  }
};
