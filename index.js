require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const keywords = require('./keywords');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const VIOLATIONS_FILE = './violations.json';
const DELETED_MESSAGES_FILE = './deleted_messages.json';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

let violations = {};
let botStartTime = Date.now();
let violationsCountToday = 0;
let deletedMessages = [];

// Load violations from file
function loadViolations() {
  if (fs.existsSync(VIOLATIONS_FILE)) {
    const data = fs.readFileSync(VIOLATIONS_FILE, 'utf8');
    violations = JSON.parse(data);
  }
}

// Save violations to file
function saveViolations() {
  fs.writeFileSync(VIOLATIONS_FILE, JSON.stringify(violations, null, 2));
}

// Load deleted messages from file
function loadDeletedMessages() {
  if (fs.existsSync(DELETED_MESSAGES_FILE)) {
    const data = fs.readFileSync(DELETED_MESSAGES_FILE, 'utf8');
    deletedMessages = JSON.parse(data);
  }
}

// Save deleted messages to file
function saveDeletedMessages() {
  fs.writeFileSync(DELETED_MESSAGES_FILE, JSON.stringify(deletedMessages, null, 2));
}

// Initialize data files
loadViolations();
loadDeletedMessages();

// Check and reset violations if 30 days have passed
function checkAndResetOldViolations() {
  const now = Date.now();
  for (const userId in violations) {
    const lastViolationTime = violations[userId].lastViolationTime || 0;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    if (now - lastViolationTime > thirtyDaysMs) {
      violations[userId].count = 0;
    }
  }
}

// Check if message contains violation
function checkViolation(text) {
  const lowerText = text.toLowerCase();

  // Check if it's about society fees (approved use of ₹)
  if (lowerText.includes('₹')) {
    const hasSocietyFee = keywords.societyFees.some(fee =>
      lowerText.includes(fee.toLowerCase())
    );
    if (hasSocietyFee) {
      return null; // Approved
    }
  }

  // Check for approved events
  const hasApprovedEvent = keywords.approvedEvents.some(event =>
    lowerText.includes(event.toLowerCase())
  );
  if (hasApprovedEvent) {
    return null; // Approved
  }

  // Check buy/sell
  if (keywords.buySell.some(kw => lowerText.includes(kw.toLowerCase()))) {
    return 'Buy/Sell Content';
  }

  // Check political
  if (keywords.political.some(kw => lowerText.includes(kw.toLowerCase()))) {
    return 'Political Content';
  }

  // Check religious
  if (keywords.religious.some(kw => lowerText.includes(kw.toLowerCase()))) {
    return 'Religious Content';
  }

  // Check spam
  if (keywords.spam.some(kw => lowerText.includes(kw.toLowerCase()))) {
    return 'Spam/Unsolicited Promotion';
  }

  // Check abusive words
  const hasAbuse = keywords.abuseHindi.some(kw => lowerText.includes(kw.toLowerCase())) ||
    keywords.abuseEnglish.some(kw => lowerText.includes(kw.toLowerCase()));

  if (hasAbuse) {
    return 'Abusive Language';
  }

  // Check personal attacks
  if (keywords.personalAttacks.some(kw => lowerText.includes(kw.toLowerCase()))) {
    return 'Personal Attack/Foul Language';
  }

  return null; // No violation
}

// Record violation
function recordViolation(userId, username, violationType) {
  if (!violations[userId]) {
    violations[userId] = {
      userId,
      username,
      count: 0,
      history: [],
      lastViolationTime: Date.now()
    };
  }

  violations[userId].count++;
  violations[userId].username = username;
  violations[userId].lastViolationTime = Date.now();
  violations[userId].history.push({
    type: violationType,
    timestamp: new Date().toISOString()
  });

  saveViolations();
  violationsCountToday++;
}

// Get user's first name
function getUserName(msg) {
  return msg.from.first_name || msg.from.username || 'User';
}

// Handle message
bot.on('message', async (msg) => {
  try {
    checkAndResetOldViolations();

    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name || 'User';
    const firstName = getUserName(msg);
    const text = msg.text || '';

    // Skip if bot message or no text
    if (!text || msg.from.is_bot) {
      return;
    }

    // Skip if from group admin
    const member = await bot.getChatMember(chatId, userId);
    if (member.status === 'administrator' || member.status === 'creator') {
      return;
    }

    // Check for violations
    const violation = checkViolation(text);

    if (violation) {
      // Delete message
      try {
        await bot.deleteMessage(chatId, msg.message_id);
      } catch (err) {
        console.log('Could not delete message:', err.message);
      }

      // Record violation
      recordViolation(userId, username, violation);

      // Log deleted message
      deletedMessages.push({
        userId,
        username,
        firstName,
        violationType: violation,
        messageText: text,
        timestamp: new Date().toISOString(),
        chatId
      });
      saveDeletedMessages();

      // Get violation count
      const violationCount = violations[userId].count;

      // Send appropriate warning
      if (violationCount === 1) {
        const warningMsg = `Hi ${firstName}, your message has been removed as it appears to contain ${violation}, which is not permitted in this group as per PSOTS group guidelines. Please keep discussions focused on society matters. Thank you for understanding 🙏`;
        bot.sendMessage(userId, warningMsg);
      } else if (violationCount === 2) {
        const warningMsg = `Hi ${firstName}, this is a second reminder — your message was removed for ${violation}. Repeated violations may result in being muted from the group. Please refer to the group guidelines. 🙏`;
        bot.sendMessage(userId, warningMsg);
      } else if (violationCount >= 3) {
        const warningMsg = `Hi ${firstName}, your message was removed. This is your third violation. The group admin has been notified. 🙏`;
        bot.sendMessage(userId, warningMsg);

        // Alert admin
        const adminAlert = `⚠️ PSOTS Bot Alert: ${firstName} (@${username}) has reached 3 violations.\nLatest: ${violation}\nMessage: "${text}"\n\nConsider muting this member.`;
        bot.sendMessage(ADMIN_ID, adminAlert);
      }
    }
  } catch (err) {
    console.error('Error handling message:', err);
  }
});

// Handle commands
bot.onText(/\/violations\s+@(\w+)/, async (msg, match) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Only admin can use this
    if (userId !== ADMIN_ID) {
      bot.sendMessage(chatId, '❌ Only the admin can use this command.');
      return;
    }

    const username = match[1];
    const userViolations = Object.values(violations).find(v => v.username === username);

    if (!userViolations) {
      bot.sendMessage(chatId, `No violations found for @${username}`);
      return;
    }

    let response = `📋 Violation History for @${username}\n\n`;
    response += `Total Violations: ${userViolations.count}\n\n`;
    response += `Recent Violations:\n`;

    userViolations.history.slice(-5).forEach((v, idx) => {
      response += `${idx + 1}. ${v.type} - ${new Date(v.timestamp).toLocaleDateString()}\n`;
    });

    bot.sendMessage(chatId, response);
  } catch (err) {
    console.error('Error:', err);
    bot.sendMessage(msg.chat.id, '❌ An error occurred.');
  }
});

bot.onText(/\/reset\s+@(\w+)/, async (msg, match) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Only admin can use this
    if (userId !== ADMIN_ID) {
      bot.sendMessage(chatId, '❌ Only the admin can use this command.');
      return;
    }

    const username = match[1];
    const userViolations = Object.values(violations).find(v => v.username === username);

    if (!userViolations) {
      bot.sendMessage(chatId, `No user found with @${username}`);
      return;
    }

    userViolations.count = 0;
    saveViolations();
    bot.sendMessage(chatId, `✅ Violation count reset for @${username}`);
  } catch (err) {
    console.error('Error:', err);
    bot.sendMessage(msg.chat.id, '❌ An error occurred.');
  }
});

bot.onText(/\/warn\s+@(\w+)\s+(.+)/, async (msg, match) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Only admin can use this
    if (userId !== ADMIN_ID) {
      bot.sendMessage(chatId, '❌ Only the admin can use this command.');
      return;
    }

    const username = match[1];
    const reason = match[2];

    // Find user by username
    const userViolations = Object.values(violations).find(v => v.username === username);
    if (!userViolations) {
      bot.sendMessage(chatId, `No user found with @${username}`);
      return;
    }

    recordViolation(userViolations.userId, username, `Manual Warning: ${reason}`);
    bot.sendMessage(chatId, `⚠️ Manual warning issued to @${username}`);
  } catch (err) {
    console.error('Error:', err);
    bot.sendMessage(msg.chat.id, '❌ An error occurred.');
  }
});

bot.onText(/\/status/, async (msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Only admin can use this
    if (userId !== ADMIN_ID) {
      bot.sendMessage(chatId, '❌ Only the admin can use this command.');
      return;
    }

    const uptime = Math.floor((Date.now() - botStartTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);

    let status = `📊 PSOTS Bot Status\n\n`;
    status += `✅ Bot is Online\n`;
    status += `⏱️ Uptime: ${hours}h ${minutes}m\n`;
    status += `⚠️ Violations Handled Today: ${violationsCountToday}\n`;
    status += `👥 Total Users with Violations: ${Object.keys(violations).length}`;

    bot.sendMessage(chatId, status);
  } catch (err) {
    console.error('Error:', err);
    bot.sendMessage(msg.chat.id, '❌ An error occurred.');
  }
});

bot.onText(/\/top/, async (msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Only admin can use this
    if (userId !== ADMIN_ID) {
      bot.sendMessage(chatId, '❌ Only the admin can use this command.');
      return;
    }

    const sorted = Object.values(violations)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    if (sorted.length === 0) {
      bot.sendMessage(chatId, '📊 No violations recorded yet.');
      return;
    }

    let response = `🔝 Top 5 Most Warned Users (This Month)\n\n`;
    sorted.forEach((v, idx) => {
      response += `${idx + 1}. @${v.username} - ${v.count} violations\n`;
    });

    bot.sendMessage(chatId, response);
  } catch (err) {
    console.error('Error:', err);
    bot.sendMessage(msg.chat.id, '❌ An error occurred.');
  }
});

// Send startup message to admin
bot.sendMessage(ADMIN_ID, '✅ PSOTS Moderation Bot is online and monitoring the Owners Group.');

console.log('🤖 PSOTS Moderation Bot started successfully!');
console.log(`Token: ${BOT_TOKEN.substring(0, 10)}...`);
console.log(`Admin ID: ${ADMIN_ID}`);
