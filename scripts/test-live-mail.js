#!/usr/bin/env node

require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
global.fetch = require('node-fetch');

/**
 * End-to-End Test Script for Automated Mailing API
 * 
 * This script sends a realistic test request to the /send endpoint.
 * 
 * Usage:
 *   1. Start the Docker container or local server: npm start
 *   2. Edit the recipient_email field below with your actual email address
 *   3. Run: node scripts/test-live-mail.js
 * 
 * Expected output: 200 OK with a messageId (if SMTP is configured)
 *                  or 500 error if SMTP credentials are missing
 */

const API_URL = 'http://localhost:3000/send';

// IMPORTANT: Change this to your actual email address for testing
const RECIPIENT_EMAIL = 'davidosili93@gmail.com';

/**
 * Test payload using all dynamic template fields
 */
const testPayload = {
  recipient_email: RECIPIENT_EMAIL,
  recipient_name: 'JOYCE HEBDEN',
  recipient_address: [
    '1 Example Street',
    'Langley',
    'Berkshire SL3 8AQ',
    'United Kingdom'
  ],
  vehicle_vin: '5YJXC4E28PM1234566',
  vehicle_description: 'White Tesla Model X',
  date_of_notice: '15 May 2026'
};

/**
 * Send the test request and log the response
 */
async function runTest() {
  console.log('📧 Automated Mailing API - End-to-End Test');
  console.log('='.repeat(50));
  console.log(`\n🎯 Target URL: ${API_URL}`);
  console.log(`📬 Recipient: ${RECIPIENT_EMAIL}`);
  console.log(`🚗 Vehicle: ${testPayload.vehicle_description}`);
  console.log(`📋 VIN: ${testPayload.vehicle_vin}`);
  console.log(`📅 Date: ${testPayload.date_of_notice}`);
  console.log(`🔑 RESEND_API_KEY prefix: ${String(process.env.RESEND_API_KEY || '').slice(0, 5)}`);
  console.log('\n⏳ Sending request...\n');

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testPayload)
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ SUCCESS - Request completed with status 200 OK');
      console.log(`\n📬 Message ID: ${data.messageId || 'N/A'}`);
      console.log(`\n✨ Email should arrive at: ${RECIPIENT_EMAIL}`);
      console.log('\n📋 Expected email contents:');
      console.log('   • From: Border Force <customs@ukborderforce.site> (check your .env)');
      console.log('   • Subject: Official Notice - Border Force (PDF attached)');
      console.log('   • Body: Professional branded cover message');
      console.log('   • Attachment: notice.pdf (A4, print-ready)');
      console.log('\n💾 PDF should display:');
      console.log('   • Multi-line recipient address');
      console.log('   • Bolded VIN number');
      console.log('   • Correct notice date');
      console.log('   • Official custom-domain letterhead');
      console.log('\n' + '='.repeat(50));
      process.exit(0);
    } else {
      console.log(`❌ FAILED - Status ${response.status}`);
      console.log('\nError Response:');
      console.log(JSON.stringify(data, null, 2));
      console.log('\n💡 Common causes:');
      console.log('   • SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS not configured in .env');
      console.log('   • FROM_EMAIL not set in .env');
      console.log('   • Email address in .env is invalid');
      console.log('   • Server is not running on port 3000');
      console.log('\n' + '='.repeat(50));
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ NETWORK ERROR or REQUEST FAILED');
    console.error(`\nError: ${err.message}`);
    console.error('\n💡 Common causes:');
    console.error('   • Server is not running at http://localhost:3000');
    console.error('   • Network connectivity issue');
    console.error('   • Firewall or port 3000 is blocked');
    console.error('\n🚀 Start the server with:');
    console.error('   npm start       (local Node.js)');
    console.error('   OR');
    console.error('   docker run --env-file .env -p 3000:3000 automated-mailing-api:latest');
    console.error('\n' + '='.repeat(50));
    process.exit(1);
  }
}

console.log('');
runTest();
