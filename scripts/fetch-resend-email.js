#!/usr/bin/env node

require('dotenv').config();
const fetch = global.fetch || require('node-fetch');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const emailId = process.argv[2];

if (!RESEND_API_KEY) {
  console.error('ERROR: RESEND_API_KEY is not configured in .env');
  process.exit(1);
}

if (!emailId) {
  console.error('Usage: node scripts/fetch-resend-email.js <email_id>');
  console.error('Example: node scripts/fetch-resend-email.js email_12345');
  process.exit(1);
}

const endpoint = `https://api.resend.com/emails/${encodeURIComponent(emailId)}`;

async function main() {
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const payload = await response.text();
    if (!response.ok) {
      console.error('Failed to fetch Resend email:', response.status, response.statusText);
      console.error(payload);
      process.exit(1);
    }

    try {
      const parsed = JSON.parse(payload);
      console.log(JSON.stringify(parsed, null, 2));
    } catch (parseErr) {
      console.log(payload);
    }
  } catch (err) {
    console.error('Request failed:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

main();
module.exports = { generatePdfFromHtml };