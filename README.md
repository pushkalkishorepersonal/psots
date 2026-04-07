# PSOTS Telegram Moderation Bot — Cloudflare Workers Edition

A **completely maintenance-free** moderation bot running on Cloudflare Workers. Deploy once and forget — no servers to manage, 24/7 uptime, always free.

## Why Cloudflare Workers?

✅ **Zero Maintenance** — Deploy and forget  
✅ **Always Free** — Generous free tier  
✅ **Always Online** — 99.99% uptime SLA  
✅ **Global Network** — Instant everywhere  
✅ **Auto-Scaling** — Handles traffic spikes  
✅ **One Command Deploy** — `wrangler deploy`

## Features

✅ **Auto-Moderation**
- Buy/Sell content detection
- Political content filtering
- Religious content filtering (with approved events)
- Abusive language and personal attacks detection
- Spam/Unsolicited promotions

✅ **Persistent Storage**
- Cloudflare KV for violation tracking
- Auto-reset after 30 days
- Audit logs for all deleted messages

✅ **Smart Detection**
- Skips admin messages
- Approved community events (Diwali, Holi, etc.)
- Context-aware (₹ allowed for society fees)

✅ **Admin Commands** (DM only)
- `/violations @username` — View violation history
- `/reset @username` — Reset violation count
- `/status` — Bot status
- `/top` — Top 5 violators

✅ **3-Strike System**
- 1st violation: Warning
- 2nd violation: Escalation reminder
- 3rd violation: Final warning + admin alert

---

## 🚀 Quick Deploy (5 minutes)

### Step 1: Install Wrangler CLI
```bash
npm install -g wrangler
```

### Step 2: Create Cloudflare Account
1. Sign up at https://dash.cloudflare.com (free)
2. Go to **Workers & Pages** → **KV** 
3. Create TWO namespaces:
   - `psots-violations`
   - `psots-audit-log`
4. Copy their IDs

### Step 3: Update wrangler.toml
Edit `wrangler.toml` and replace:
```toml
[[kv_namespaces]]
binding = "VIOLATIONS"
id = "paste_your_violations_namespace_id_here"

[[kv_namespaces]]
binding = "AUDIT_LOG"
id = "paste_your_audit_namespace_id_here"
```

### Step 4: Set Bot Token Secret
```bash
wrangler secret put BOT_TOKEN
# Paste your bot token when prompted
```

### Step 5: Deploy
```bash
wrangler deploy
```

You'll get a URL like: `https://psots-telegram-bot.yourname.workers.dev`

### Step 6: Set Telegram Webhook
Replace the URL and token:
```bash
curl "https://api.telegram.org/bot8526973206:AAEJnvI4_bkJCDE-7q94E-HZl-YLabtQdcI/setWebhook?url=https://psots-telegram-bot.yourname.workers.dev"
```

Expected response:
```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

### Step 7: Add Bot to Group
1. Open PSOTS Owners Group
2. Add `@psots_telegram_bot` as admin
3. Give permissions: Delete messages ✅, Ban users ✅
4. Done! ✅

---

## Testing (Before Production)

Create a private test group and:
```
Message 1: "I want to sell my car" → Deleted + Warning DM
Message 2: "Vote for BJP" → Deleted + Warning DM
Message 3: "Happy Diwali!" → NOT deleted ✅
Message 4: "CAM charges ₹5000" → NOT deleted ✅
```

After 3 violations from same user, you should receive admin alert.

---

## File Structure

```
psots/
├── src/
│   └── index.js            — Main bot (Cloudflare Worker)
├── wrangler.toml           — Cloudflare config
├── package.json            — Dependencies
└── README.md               — This file
```

---

## Moderation Rules

| Category | Flagged Keywords | Exceptions |
|----------|-----------------|------------|
| Buy/Sell | sell, buy, rent, price, ₹, rs., DM me, WhatsApp me | CAM/maintenance charges |
| Political | BJP, Congress, AAP, election, vote, Modi, CM, rally | None |
| Religious | temple, mosque, church, prayer | Diwali, Holi, Chhath Puja, Eid |
| Spam | discount, offer, limited time, click here, earn money | None |
| Abusive | Common Hindi/English slurs + personal attacks | None |

---

## Admin Commands

All commands work via **DM only** to the bot.

### `/violations @username`
Shows violation count and recent violations for a user.

### `/reset @username`
Resets violation count to zero.

### `/status`
Shows if bot is online and handling violations.

### `/top`
Shows top 5 most warned users.

---

## Storage Details

**Cloudflare KV Free Tier (per day):**
- 100,000 reads → You use ~10-50
- 10,000 writes → You use ~5-20
- 1 GB storage → You use <1 MB

**Cost:** $0 (stays free forever for this use case)

Data stored:
- Violation history per user
- Audit logs of deleted messages
- All data auto-expires after 30/90 days

---

## Troubleshooting

**Bot not responding?**
1. Check webhook was set correctly:
```bash
curl "https://api.telegram.org/bot8526973206:AAEJnvI4_bkJCDE-7q94E-HZl-YLabtQdcI/getWebhookInfo"
```

2. Check bot has delete permissions in group

**Commands not working?**
- Must be DM from admin user ID (989358143)
- Commands sent in group won't work

**Want to see logs?**
```bash
wrangler tail
```

---

## Updating the Bot

To update code:
```bash
# Edit src/index.js
git add src/index.js
git commit -m "Update bot logic"
wrangler deploy
```

---

## FAQ

**Q: Will this cost money?**  
A: No. Free Cloudflare Workers tier is enough for PSOTS.

**Q: What if the bot goes down?**  
A: Cloudflare has 99.99% SLA. It won't.

**Q: Can I use this for multiple groups?**  
A: Yes, modify the code to handle multiple chat IDs.

**Q: How do I delete/reset everything?**  
A: Go to Cloudflare Dashboard → Workers → KV → Delete namespaces.

**Q: Can I export violation history?**  
A: Yes, from Cloudflare Dashboard → KV → Data.

---

## Support

Need help?
- Read [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- Check [Telegram Bot API Docs](https://core.telegram.org/bots/api)

---

**Built for Prestige Song of the South — psots.in**  
**Maintenance-free moderation since 2024** ✅
