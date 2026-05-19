#!/usr/bin/env node

require('dotenv').config();
const { Resend } = require('resend');

const resendApiKey = process.env.RESEND_API_KEY;
if (!resendApiKey) {
  console.error('RESEND_API_KEY is not set in .env');
  process.exit(1);
}

const client = new Resend(resendApiKey);

// Replace this with your current public tunnel URL
const PUBLIC_TUNNEL_HOST = process.env.PUBLIC_TUNNEL_HOST || 'proceeding-spokesman-groove-awesome.trycloudflare.com';
const TARGET_PATH = '/inbound/email';
const TARGET_URL = `https://${PUBLIC_TUNNEL_HOST}${TARGET_PATH}`;

async function listWebhooks() {
  try {
    if (client.webhooks && typeof client.webhooks.list === 'function') {
      const res = await client.webhooks.list();
      if (Array.isArray(res)) return res;
      if (res && Array.isArray(res.data)) return res.data;
      if (res && Array.isArray(res.webhooks)) return res.webhooks;
    }
    return [];
  } catch (err) {
    console.error('Failed to list webhooks:', err && err.message ? err.message : err);
    return [];
  }
}

function shouldDeleteWebhook(w) {
  if (!w) return false;
  const url = (w.url || w.endpoint || '').toString();
  if (!url) return false;
  const host = PUBLIC_TUNNEL_HOST;
  // Delete if webhook points at inbound/email or localhost or known tunnel hosts or matches our public host
  const checks = [
    '/inbound/email',
    'localhost',
    '127.0.0.1',
    'ngrok',
    'localtunnel',
    'trycloudflare.com',
    host
  ];
  return checks.some(token => url.includes(token));
}

async function deleteWebhook(id) {
  try {
    const res = await client.webhooks.delete(id);
    return res;
  } catch (err) {
    console.error('Failed to delete webhook', id, err && err.message ? err.message : err);
    return null;
  }
}

async function createWebhook() {
  try {
    const body = {
      // Resend API expects `endpoint` in some SDK/runtime versions; include both for compatibility
      endpoint: TARGET_URL,
      url: TARGET_URL,
      events: ['email.received']
    };
    // If INBOUND_WEBHOOK_SECRET exists, include it as secret
    if (process.env.INBOUND_WEBHOOK_SECRET) body.secret = process.env.INBOUND_WEBHOOK_SECRET;

    if (!client.webhooks || typeof client.webhooks.create !== 'function') {
      throw new Error('Resend webhooks.create is not available in this SDK/runtime');
    }

    const res = await client.webhooks.create(body);
    return res;
  } catch (err) {
    console.error('Failed to create webhook:', err && err.message ? err.message : err);
    throw err;
  }
}

async function main() {
  console.log('Target webhook URL:', TARGET_URL);

  const webhooks = await listWebhooks();
  console.log('Found', webhooks.length, 'webhooks');

  for (const w of webhooks) {
    try {
      const id = w.id || w.webhook_id || w._id;
      const url = w.url || w.endpoint || '';
      if (!id) continue;
      if (shouldDeleteWebhook(w)) {
        console.log('Deleting webhook:', id, url);
        await deleteWebhook(id);
      } else {
        console.log('Keeping webhook:', id, url);
      }
    } catch (err) {
      console.error('Error processing webhook entry:', err && err.message ? err.message : err);
    }
  }

  console.log('Creating new webhook for inbound events...');
  const created = await createWebhook();
  console.log('Created webhook:', created);
}

main().catch(err => {
  console.error('Script failed:', err && err.message ? err.message : err);
  process.exit(1);
});
