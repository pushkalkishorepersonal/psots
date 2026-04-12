import { 
    getBotToken, getKeywords, isResidentVerified, 
    checkViolation, updateStats, getUserViolations, 
    saveUserViolations, getActionSettings 
} from './store.js';

export async function sendMessage(chatId, text, token, replyMarkup = null) {
  try {
    const body = { chat_id: chatId, text, parse_mode: 'HTML' };
    if (replyMarkup) body.reply_markup = replyMarkup;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (err) {}
}

export async function deleteTelegramMessage(chatId, messageId, token) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId })
    });
  } catch (err) {}
}

export async function sendSocietyEmail(toEmail, subject, content) {
    try {
        const send_request = new Request("https://api.mailchannels.net/tx/v1/send", {
            "method": "POST",
            "headers": { "content-type": "application/json" },
            "body": JSON.stringify({
                "personalizations": [{ "to": [{ "email": toEmail, "name": "PSOTS Resident" }] }],
                "from": { "email": "noreply@society.psots.in", "name": "PSOTS Community Portal" },
                "subject": subject,
                "content": [{ "type": "text/html", "value": content }]
            }),
        });
        await fetch(send_request);
    } catch(e) { console.error("Email send failed", e); }
}

export async function parseListingWithGemini(text, env) {
    if (!env.GEMINI_API_KEY) return { text: text };
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;
        const prompt = `Extract marketplace listing data from this Telegram message. Return ONLY a JSON object with keys: item (string), price (number or null), tower (number or null), category (one of: Electronics, Furniture, Services, Vehicle, Rentals, Other). Text: "${text}"`;
        
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const d = await res.json();
        const aiText = d.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
        return JSON.parse(aiText);
    } catch(e) { 
        return { text: text };
    }
}

export async function fetchChatMember(chatId, userId, token) {
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

export async function muteChatMember(chatId, userId, token, durationSeconds = 3600) {
  const untilDate = Math.floor(Date.now() / 1000) + durationSeconds;
  try {
    await fetch(`https://api.telegram.org/bot${token}/restrictChatMember`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId, user_id: userId,
        until_date: untilDate,
        permissions: {
          can_send_messages: false,
          can_send_audios: false,
          can_send_documents: false,
          can_send_photos: false,
          can_send_videos: false,
          can_send_video_notes: false,
          can_send_voice_notes: false,
          can_send_polls: false,
          can_send_other_messages: false,
          can_add_web_page_previews: false
        }
      })
    });
  } catch(e) {}
}

export async function kickChatMember(chatId, userId, token) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/banChatMember`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, user_id: userId, revoke_messages: false })
    });
    // Unban immediately — kick without permanent ban so they can rejoin if admin approves
    await fetch(`https://api.telegram.org/bot${token}/unbanChatMember`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, user_id: userId, only_if_banned: true })
    });
  } catch(e) {}
}

export async function banChatMember(chatId, userId, token) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/banChatMember`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, user_id: userId, revoke_messages: false })
    });
  } catch(e) {}
}
