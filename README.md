# PSOTS Telegram Moderation Bot

A smart moderation bot for the PSOTS (Prestige Song of the South) Telegram group that auto-moderates based on group guidelines.

## Features

✅ **Auto-Moderation**
- Buy/Sell content detection
- Political content filtering
- Religious content filtering (with approved events)
- Abusive language and personal attacks detection
- Spam and unsolicited promotions detection

✅ **Violation Tracking**
- Per-user violation count tracking
- Full violation history stored in `violations.json`
- Auto-reset after 30 days of inactivity
- Persistent deletion logs

✅ **Smart Detection**
- Skips admin messages
- Allows approved community events (Diwali, Holi, Chhath Puja, etc.)
- Context-aware detection (₹ symbol allowed for society fees)

✅ **Admin Commands** (only for admin user)
- `/violations @username` - View violation history
- `/reset @username` - Reset violation count
- `/warn @username reason` - Manually warn a user
- `/status` - Show bot uptime and violations handled
- `/top` - Show top 5 most warned users

✅ **Warning System**
- First violation: Polite warning message
- Second violation: Second reminder with escalation notice
- Third violation: Final warning + admin alert

## Installation

### Step 1: Clone/Setup Project
```bash
cd psots
npm install
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:
```
BOT_TOKEN=your_bot_token_here
ADMIN_ID=your_telegram_user_id_here
```

### Step 3: Get Your Bot Token
1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Use `/mybots` → select your bot → API Token
3. Copy the token and paste in `.env`

### Step 4: Get Your Telegram User ID
1. Message [@userinfobot](https://t.me/userinfobot) on Telegram
2. It will show your user ID
3. Copy and paste in `.env`

## Running the Bot

### Locally
```bash
npm start
```

You should see: `🤖 PSOTS Moderation Bot started successfully!`

### Adding Bot to Group

1. Open your PSOTS Owners Group
2. Click on the group name → Add Members
3. Search for `@psots_telegram_bot` and add it
4. Make it an admin with these permissions:
   - ✅ Delete messages
   - ✅ Ban users
   - ❌ Post messages
   - ❌ Pin messages

### Testing (Recommended First)

1. Create a private test group
2. Add the bot as admin (same permissions as above)
3. Test messages:
   - "I want to sell my old car" → Should be deleted
   - "Vote for BJP" → Should be deleted
   - "Happy Diwali!" → Should NOT be deleted
   - "Monthly CAM charges: ₹5000" → Should NOT be deleted
4. Check that the bot sends warning DMs to the user
5. Verify admin receives alert after 3 violations

## File Structure

```
psots/
├── index.js                — Main bot logic and command handlers
├── keywords.js             — Keyword lists for all violation types
├── violations.json         — Violation tracking (auto-created)
├── deleted_messages.json   — Log of deleted messages (auto-created)
├── .env                    — Bot token and admin ID (KEEP SECRET)
├── .env.example            — Template for .env
├── package.json            — Dependencies
└── README.md               — This file
```

## Deployment Options

### Option 1: Railway.app (Recommended)

1. Create account at [railway.app](https://railway.app)
2. Create new project → Import from GitHub
3. Add this repository
4. Add environment variables in Railway dashboard:
   - `BOT_TOKEN`
   - `ADMIN_ID`
5. Deploy

### Option 2: Render.com

1. Create account at [render.com](https://render.com)
2. Create new Web Service
3. Connect your GitHub repo
4. Set build command: `npm install`
5. Set start command: `npm start`
6. Add environment variables
7. Deploy

### Option 3: Heroku (Free tier ended, but still available)

1. Install Heroku CLI
2. Run: `heroku login`
3. Create app: `heroku create psots-bot`
4. Set environment: 
   ```bash
   heroku config:set BOT_TOKEN=your_token
   heroku config:set ADMIN_ID=your_id
   ```
5. Deploy: `git push heroku main`

### Option 4: VPS/Server

1. Install Node.js on your server
2. Clone this repository
3. Create `.env` file with credentials
4. Install PM2 for 24/7 uptime:
   ```bash
   npm install -g pm2
   pm2 start index.js --name "psots-bot"
   pm2 save
   pm2 startup
   ```

## Moderation Rules

### 1. Buy/Sell Content
**Flagged Keywords:** sell, buy, rent, price, ₹, rs., DM me, WhatsApp me, available for sale, second hand

### 2. Political Content
**Flagged Keywords:** BJP, Congress, AAP, election, vote, Modi, CM, government policy, protest, rally

### 3. Religious Content
**Flagged Keywords:** temple donation, mosque, church collection, prayer meeting
**NOT Flagged:** Chhath Puja, Diwali, Holi, Navratri, Eid (approved community events)

### 4. Personal Attacks / Foul Language
**Flagged:** Abusive words in Hindi and English, direct personal attacks

### 5. Spam / Unsolicited Promotions
**Flagged Keywords:** discount, offer, limited time, click here, refer a friend, earn money, business opportunity

## Admin Commands

### View Violation History
```
/violations @username
```
Shows violation count and recent violations for a user.

### Reset Violations
```
/reset @username
```
Resets violation count to zero for a user.

### Manual Warning
```
/warn @username reason
```
Manually warn a user (counts as a violation).

### Bot Status
```
/status
```
Shows bot uptime and violations handled today.

### Top Violators
```
/top
```
Shows top 5 most warned users this month.

## Data Files

### violations.json
Stores all user violations:
```json
{
  "123456": {
    "userId": 123456,
    "username": "john_doe",
    "count": 2,
    "lastViolationTime": 1234567890,
    "history": [
      {
        "type": "Buy/Sell Content",
        "timestamp": "2024-01-15T10:30:00Z"
      }
    ]
  }
}
```

### deleted_messages.json
Logs of all deleted messages for audit trail:
```json
[
  {
    "userId": 123456,
    "username": "john_doe",
    "firstName": "John",
    "violationType": "Buy/Sell Content",
    "messageText": "Selling old laptop...",
    "timestamp": "2024-01-15T10:30:00Z",
    "chatId": -1001234567890
  }
]
```

## Important Notes

- **Keep `.env` secret** — Never commit it to GitHub
- **Bot token is sensitive** — It allows anyone to control your bot
- **Admin ID verification** — Only messages from your admin ID trigger admin commands
- **Violation history is permanent** — Full logs are kept for audit purposes
- **30-day reset** — Violation counts reset after 30 days of no new violations

## Troubleshooting

### Bot not responding
- Check bot token is correct in `.env`
- Check bot is added to the group as admin
- Restart the bot process

### Commands not working
- Verify you're using the correct admin ID
- Commands are only available in DMs to the bot
- Use proper command format: `/violations @username`

### Messages not being deleted
- Check bot has delete permissions in group
- Check message text contains the violation keywords
- Bot skips messages from group admins

## Support

For issues or feature requests, contact the PSOTS bot administrator.

---

**Built for Prestige Song of the South — psots.in**
