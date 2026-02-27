# Webhook API - Quick Start Guide

## 🚀 Setup (5 minutes)

### 1. Configure Environment Variables

Copy `.env.example` to `.env` (or update your existing `.env`):

```bash
# Generate secure API keys for your teammates
WEBHOOK_API_KEYS="team1_key_a1b2c3d4,team2_key_e5f6g7h8,team3_key_i9j0k1l2"

# Set your target webhook URL (e.g., Telegram Bot API)
TECH_EVENTS_WEBHOOK_URL="https://api.telegram.org/botYOUR_BOT_TOKEN/sendMessage"

# Optional: HMAC secret for webhook signatures
TECH_EVENTS_WEBHOOK_SECRET="generate_a_random_secret_here_xyz123"

# Enable webhook dispatch
TECH_EVENTS_WEBHOOK_ENABLED=true

# Cron secret (for dispatcher)
CRON_SECRET="your_secure_cron_secret_abc456"
```

### 2. Database Migration (Already Done ✅)

The schema has been updated. If you need to sync:

```bash
npx prisma db push
```

### 3. Start the Server

```bash
# Development
npm run dev

# Production
npm run start
```

---

## 📝 For Your Teammates (Google Apps Script Users)

### Share This Information

**Endpoint:** `https://your-domain.com/api/webhook/queue`

**API Key:** Give each teammate their own key from `WEBHOOK_API_KEYS`

### Quick Example

#### Simple Notification

```javascript
function sendNotification() {
  const payload = {
    eventType: 'NOTIFICATION',
    payload: {
      chatId: '-100123456789',
      message: 'Hello from Apps Script!'
    }
  };

  UrlFetchApp.fetch('https://your-domain.com/api/webhook/queue', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer YOUR_API_KEY' },
    payload: JSON.stringify(payload)
  });
}
```

#### Ticket Status Change (Full Payload)

```javascript
function sendTicketStatusChange() {
  const payload = {
    eventType: 'TICKET_STATUS_CHANGED',
    payload: {
      event_id: 'evt-' + Date.now(),
      event_type: 'TICKET_STATUS_CHANGED',
      occurred_at: new Date().toISOString(),
      ticket: {
        id: 999,
        incident: 'TEST_INCIDENT',
        workzone: 'TEST',
        service_no: '152415230585',
        customer_name: 'PELANGGAN1'
      },
      status: {
        old_hasil_visit: 'ASSIGNED',
        new_hasil_visit: 'ON_PROGRESS',
        pending_reason: null,
        evidence: null
      },
      old_technician: null,
      new_technician: {
        id_user: 1,
        nik: 'TEST001',
        nama: 'Test Tech'
      },
      actor: {
        id_user: 1,
        role: 'admin'
      }
    }
  };

  UrlFetchApp.fetch('https://your-domain.com/api/webhook/queue', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer YOUR_API_KEY' },
    payload: JSON.stringify(payload)
  });
}
```

📖 **Full documentation:** See `docs/WEBHOOK_API.md`

---

## ✅ Verification

### Test the API

```bash
# Set your API key
export TEST_WEBHOOK_API_KEY="team1_key_a1b2c3d4"

# Run test script
tsx scripts/test-webhook.ts
```

### Check Database

```sql
-- View queued events
SELECT * FROM tech_event_outbox 
ORDER BY created_at DESC 
LIMIT 10;

-- Check pending events
SELECT COUNT(*) as pending FROM tech_event_outbox 
WHERE status = 'PENDING';
```

### Monitor Logs

Watch server logs for:
- `[CRON] Running tech events dispatch...`
- Webhook dispatch results

---

## 🔧 How It Works

1. **Teammate sends request** → `POST /api/webhook/queue` with API key
2. **Server validates** → Checks API key, stores event in database
3. **Cron runs every minute** → Fetches PENDING events
4. **Server dispatches** → Sends batch to `TECH_EVENTS_WEBHOOK_URL`
5. **Target receives** → Telegram/Slack/Discord gets the message

---

## 🛠️ Common Tasks

### Add New Teammate

1. Generate a new API key: `openssl rand -hex 16`
2. Add to `.env`: `WEBHOOK_API_KEYS="existing_key,new_teammate_key"`
3. Restart server

### Check Event Status

```sql
SELECT event_id, event_type, status, attempt_count, created_at 
FROM tech_event_outbox 
WHERE created_at > NOW() - INTERVAL 1 HOUR;
```

### Clear Failed Events

```sql
UPDATE tech_event_outbox 
SET status = 'PENDING', attempt_count = 0, last_error = NULL 
WHERE status = 'FAILED' AND created_at > NOW() - INTERVAL 1 DAY;
```

---

## 📚 Files Created/Modified

### New Files
- ✅ `app/libs/webhookAuth.ts` - API key validation
- ✅ `app/api/webhook/queue/route.ts` - Webhook queue endpoint
- ✅ `scripts/test-webhook.ts` - Test script
- ✅ `docs/WEBHOOK_API.md` - Full documentation
- ✅ `.env.example` - Environment template

### Modified Files
- ✅ `app/libs/integrations/techEventTypes.ts` - Added generic event types
- ✅ `prisma/schema.prisma` - Widened event_type field
- ✅ `next.config.ts` - Enhanced CORS headers

### Deleted Files
- ❌ `app/api/integrations/test/route.ts` - Removed dev-only file

---

## 🆘 Troubleshooting

**Events not being sent?**
- Check `CRON_ENABLED=true` in `.env`
- Verify `TECH_EVENTS_WEBHOOK_URL` is correct
- Check server logs for errors

**401 Unauthorized?**
- Ensure API key matches one in `WEBHOOK_API_KEYS`
- Use format: `Authorization: Bearer YOUR_KEY`

**CORS errors?**
- Server already sends CORS headers
- Check browser console for details

---

## 📞 Support

For issues or questions, check `docs/WEBHOOK_API.md` or contact the development team.
