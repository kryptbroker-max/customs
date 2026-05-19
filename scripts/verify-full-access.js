#!/usr/bin/env node

require('dotenv').config();
const https = require('https');

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.error('RESEND_API_KEY is missing');
  process.exit(1);
}

const options = {
  hostname: 'api.resend.com',
  path: '/webhooks',
  method: 'GET',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json'
  }
};

const req = https.request(options, res => {
  let body = '';
  res.setEncoding('utf8');
  res.on('data', chunk => { body += chunk; });
  res.on('end', () => {
    console.log('status:', res.statusCode);
    console.log('body:', body);
    process.exit(res.statusCode >= 200 && res.statusCode < 300 ? 0 : 1);
  });
});

req.on('error', err => {
  console.error('error:', err && err.message ? err.message : err);
  process.exit(1);
});

req.end();
