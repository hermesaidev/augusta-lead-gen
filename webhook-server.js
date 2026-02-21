/**
 * Augusta Digest Lead Gen - Meta Lead Ads Webhook Server
 * 
 * Receives Meta Lead Ad webhooks, writes to Airtable, sends Discord DM.
 * 
 * Run: node webhook-server.js
 * Requires: Node.js 18+ (uses native fetch)
 * 
 * Environment variables (or edit config below):
 *   META_VERIFY_TOKEN - Webhook verification token
 *   META_ACCESS_TOKEN - Meta Graph API token
 *   AIRTABLE_TOKEN    - Airtable PAT
 *   AIRTABLE_BASE_ID  - Airtable base ID
 *   AIRTABLE_TABLE_ID - Airtable table ID
 *   DISCORD_WEBHOOK_URL - Discord webhook URL (for DM, use bot endpoint)
 */

const http = require('http');
const https = require('https');

// ============ CONFIGURATION ============
const CONFIG = {
  port: process.env.PORT || 3000,
  meta: {
    verifyToken: process.env.META_VERIFY_TOKEN || 'augusta_lead_gen_2026',
    accessToken: process.env.META_ACCESS_TOKEN || '',
  },
  airtable: {
    token: process.env.AIRTABLE_TOKEN || '',
    baseId: process.env.AIRTABLE_BASE_ID || 'appYPtzlIfY2A6Fi4',
    tableId: process.env.AIRTABLE_TABLE_ID || 'tbl2BU5cEvmbT3t1n',
  },
  discord: {
    // For DM notifications, we use a Discord bot webhook or channel webhook
    // Set this to a Discord webhook URL for a notifications channel
    webhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
    // Or use bot token for DMs (preferred)
    botToken: process.env.DISCORD_BOT_TOKEN || '',
    dmUserId: '1393764780942168127',
  }
};

// ============ HELPERS ============

function apiRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function fetchMetaLeadData(leadgenId) {
  console.log(`[META] Fetching lead data for ${leadgenId}`);
  const result = await apiRequest({
    hostname: 'graph.facebook.com',
    path: `/v19.0/${leadgenId}?access_token=${CONFIG.meta.accessToken}`,
    method: 'GET',
  });
  console.log(`[META] Lead data:`, JSON.stringify(result.data));
  return result.data;
}

async function writeToAirtable(leadData) {
  console.log(`[AIRTABLE] Writing lead:`, leadData.Name || 'unknown');
  const body = JSON.stringify({
    records: [{
      fields: {
        Name: leadData.Name || '',
        Phone: leadData.Phone || '',
        Email: leadData.Email || '',
        'Lead Date': new Date().toISOString(),
        'Response Time': '',
        Status: 'New',
        'Priority Score': leadData.PriorityScore || 50,
        Notes: `Source: Meta Lead Ad\nForm: ${leadData.formName || 'unknown'}\nAd: ${leadData.adName || 'unknown'}`,
        'Next Action': 'Contact within 5 minutes',
      }
    }]
  });

  const result = await apiRequest({
    hostname: 'api.airtable.com',
    path: `/v0/${CONFIG.airtable.baseId}/${CONFIG.airtable.tableId}`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CONFIG.airtable.token}`,
      'Content-Type': 'application/json',
    }
  }, body);
  
  console.log(`[AIRTABLE] Result:`, result.status);
  return result.data;
}

async function sendDiscordNotification(leadData, airtableRecord) {
  const recordId = airtableRecord?.records?.[0]?.id || '';
  const message = `🔔 **New Lead Alert — Augusta Digest**\n\n` +
    `**Name:** ${leadData.Name || 'N/A'}\n` +
    `**Phone:** ${leadData.Phone || 'N/A'}\n` +
    `**Email:** ${leadData.Email || 'N/A'}\n` +
    `**Status:** New\n` +
    `**Lead Date:** ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}\n\n` +
    `📋 [View in Airtable](https://airtable.com/${CONFIG.airtable.baseId}/${CONFIG.airtable.tableId}/viwI5aogeCnQ01UWe/${recordId})\n\n` +
    `⚡ **Action Required:** Contact within 5 minutes for best conversion!`;

  // If webhook URL is set, use it
  if (CONFIG.discord.webhookUrl) {
    const url = new URL(CONFIG.discord.webhookUrl);
    const result = await apiRequest({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, JSON.stringify({ content: message, username: 'Augusta Lead Bot' }));
    console.log(`[DISCORD] Webhook sent:`, result.status);
    return result;
  }

  console.log(`[DISCORD] No webhook URL configured - notification logged only`);
  console.log(`[DISCORD] Message:\n${message}`);
  return { status: 'logged' };
}

function parseMetaLeadFields(fieldData) {
  const lead = {};
  if (!fieldData) return lead;
  
  for (const field of fieldData) {
    const name = (field.name || '').toLowerCase();
    const value = field.values?.[0] || '';
    
    if (name.includes('name') || name === 'full_name') lead.Name = value;
    else if (name.includes('email')) lead.Email = value;
    else if (name.includes('phone') || name.includes('tel')) lead.Phone = value;
  }
  
  // If no full name, try first + last
  if (!lead.Name) {
    const first = fieldData.find(f => f.name?.toLowerCase() === 'first_name')?.values?.[0] || '';
    const last = fieldData.find(f => f.name?.toLowerCase() === 'last_name')?.values?.[0] || '';
    if (first || last) lead.Name = `${first} ${last}`.trim();
  }
  
  return lead;
}

// ============ WEBHOOK HANDLER ============

async function handleLeadWebhook(body) {
  console.log(`[WEBHOOK] Received:`, JSON.stringify(body));
  
  if (!body.entry) return;
  
  for (const entry of body.entry) {
    for (const change of (entry.changes || [])) {
      if (change.field === 'leadgen') {
        const leadgenId = change.value?.leadgen_id;
        const formId = change.value?.form_id;
        const adId = change.value?.ad_id;
        
        if (!leadgenId) continue;
        
        try {
          // 1. Fetch lead data from Meta
          const metaLead = await fetchMetaLeadData(leadgenId);
          const leadData = parseMetaLeadFields(metaLead.field_data);
          leadData.formName = metaLead.form_name || formId || '';
          leadData.adName = adId || '';
          
          // 2. Write to Airtable
          const airtableResult = await writeToAirtable(leadData);
          
          // 3. Send Discord notification
          await sendDiscordNotification(leadData, airtableResult);
          
          console.log(`[SUCCESS] Lead processed: ${leadData.Name}`);
        } catch (err) {
          console.error(`[ERROR] Processing lead ${leadgenId}:`, err.message);
        }
      }
    }
  }
}

// ============ HTTP SERVER ============

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${CONFIG.port}`);
  
  // Health check
  if (url.pathname === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'Augusta Digest Lead Gen Webhook' }));
    return;
  }
  
  // Meta webhook verification (GET)
  if (url.pathname === '/webhook' && req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    
    if (mode === 'subscribe' && token === CONFIG.meta.verifyToken) {
      console.log(`[VERIFY] Webhook verified successfully`);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(challenge);
    } else {
      console.log(`[VERIFY] Failed - bad token`);
      res.writeHead(403);
      res.end('Forbidden');
    }
    return;
  }
  
  // Meta webhook event (POST)
  if (url.pathname === '/webhook' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      // Respond immediately (Meta requires quick response)
      res.writeHead(200);
      res.end('EVENT_RECEIVED');
      
      try {
        const parsed = JSON.parse(body);
        await handleLeadWebhook(parsed);
      } catch (err) {
        console.error(`[ERROR] Parsing webhook:`, err.message);
      }
    });
    return;
  }
  
  // Manual test endpoint
  if (url.pathname === '/test' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const leadData = JSON.parse(body);
        const airtableResult = await writeToAirtable(leadData);
        await sendDiscordNotification(leadData, airtableResult);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, airtable: airtableResult }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
  
  res.writeHead(404);
  res.end('Not Found');
});

server.listen(CONFIG.port, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║  Augusta Digest Lead Gen - Webhook Server            ║
║                                                      ║
║  Status: RUNNING on port ${CONFIG.port}                     ║
║                                                      ║
║  Endpoints:                                          ║
║    GET  /          - Health check                    ║
║    GET  /webhook   - Meta verification               ║
║    POST /webhook   - Meta lead events                ║
║    POST /test      - Manual test                     ║
║                                                      ║
║  Meta Verify Token: ${CONFIG.meta.verifyToken}       ║
╚══════════════════════════════════════════════════════╝
  `);
});
