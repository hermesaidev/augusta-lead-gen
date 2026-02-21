# Augusta Digest Lead Gen System

## Overview
Complete lead generation pipeline: Meta Lead Ads → Airtable → Discord DM notification.

## Components

### 1. Airtable Base
- **Base:** Augusta Digest Lead Gen
- **Base ID:** `appYPtzlIfY2A6Fi4`
- **URL:** https://airtable.com/appYPtzlIfY2A6Fi4
- **Table:** Leads (`tbl2BU5cEvmbT3t1n`)
- **Fields:** Name, Phone, Email, Lead Date, Response Time, Status, Priority Score, Notes, Next Action
- **Status Options:** New (blue), Contacted (yellow), Qualified (green), Converted (dark green), Lost (red)

### 2. Webhook Server (`webhook-server.js`)
Node.js server that:
- Receives Meta Lead Ad webhook events
- Fetches full lead data from Meta Graph API
- Creates record in Airtable
- Sends Discord DM notification

**Endpoints:**
- `GET /` — Health check
- `GET /webhook` — Meta webhook verification
- `POST /webhook` — Meta lead events
- `POST /test` — Manual test endpoint

### 3. Discord Notifications
DM sent to Andrew (user:1393764780942168127) with lead details + Airtable link.

## Setup Steps

### Deploy Webhook Server
1. Deploy `webhook-server.js` to any Node.js host (Railway, Render, VPS, etc.)
2. Set environment variables (or edit CONFIG in file)
3. Note the public URL (e.g., `https://your-server.com/webhook`)

### Connect Meta Lead Ads
1. Go to [Meta Developer Portal](https://developers.facebook.com)
2. App Settings → Webhooks → Add Callback URL
3. URL: `https://your-server.com/webhook`
4. Verify Token: `augusta_lead_gen_2026`
5. Subscribe to `leadgen` field under Page subscriptions
6. Meta Account: `act_3090800864429585`

### Discord Notification Options
**Option A (Current):** OpenClaw message tool sends DMs (used for test)
**Option B (Webhook Server):** Set `DISCORD_WEBHOOK_URL` env var to a Discord channel webhook
**Option C (Bot):** Use Discord bot token for direct DMs

## API Token
- **Airtable PAT:** Stored in `memory/bank/credentials.md`
- **Scopes:** data.records:read/write, schema.bases:read/write, webhook:manage

## Testing
```bash
# Test Airtable write + Discord notification
curl -X POST http://localhost:3000/test \
  -H "Content-Type: application/json" \
  -d '{"Name":"Jane Doe","Phone":"706-555-9999","Email":"jane@example.com"}'
```

## Created
2026-02-20 by OpenClaw subagent
