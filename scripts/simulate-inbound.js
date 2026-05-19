#!/usr/bin/env node

require('dotenv').config();
global.fetch = require('node-fetch');

const endpoint = 'http://localhost:3000/inbound/email';
const webhookSecret = process.env.INBOUND_WEBHOOK_SECRET || '';

if (!webhookSecret) {
  console.error('ERROR: INBOUND_WEBHOOK_SECRET is not set in .env');
  process.exit(1);
}

const payload = {
  data: {
    from: 'davidosili93@gmail.com',
    to: process.env.CUSTOM_DOMAIN ? `customs@${process.env.CUSTOM_DOMAIN}` : 'customs@ukborderforce.site',
    subject: 'Live Reply Test',
    text: 'This is a live inbound webhook test. Please reply in Telegram to trigger the outbound email path.',
    message_id: `<test-live-reply-${Date.now()}@${process.env.CUSTOM_DOMAIN || 'ukborderforce.site'}>`,
    attachments: []
  }
};

async function main() {
  console.log('Sending simulated inbound email to', endpoint);
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': webhookSecret
    },
    body: JSON.stringify(payload)
  });

  const body = await res.text();
  console.log('Response status:', res.status);
  console.log('Response body:', body);

  if (!res.ok) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Request failed:', err && err.message ? err.message : err);
  process.exit(1);
});
