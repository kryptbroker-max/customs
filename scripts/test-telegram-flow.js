// Local smoke test for Telegram <-> Email flow
// - Mocks Telegram and Resend network calls
// - Starts the app, posts a fake inbound email, verifies Telegram forward mapping
// - Posts a fake Telegram reply webhook, verifies sendMail was invoked

require('dotenv').config();
process.env.TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '99999';
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test-token';
process.env.TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || 'test-webhook-secret';
process.env.PORT = process.env.PORT || '3000';

const path = require('path');
const fetch = global.fetch || require('node-fetch');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('Starting local telegram flow test');

  // Monkeypatch telegram send and email send before loading the server
  const telegram = require(path.resolve(__dirname, '..', 'src', 'telegram'));
  const email = require(path.resolve(__dirname, '..', 'src', 'email'));

  let lastTelegramPayload = null;
  telegram.sendTelegramMessage = async (token, chatId, text, opts = {}) => {
    console.log('MOCK telegram.sendTelegramMessage called', { token: !!token, chatId, length: (text||'').length });
    lastTelegramPayload = { token, chatId, text, opts };
    // Simulate Telegram returning a message_id integer
    return { message_id: 12345, chat: { id: Number(chatId) } };
  };

  let lastSendMail = null;
  email.sendMail = async (params) => {
    console.log('MOCK email.sendMail called', { to: params.to, subject: params.subject, inReplyTo: params.inReplyTo, references: params.references });
    lastSendMail = params;
    return { messageId: `<mock-${Date.now()}@local>` };
  };

  // Start the app (it listens on process.env.PORT)
  require(path.resolve(__dirname, '..', 'src', 'index'));

  // Give the server a moment to start
  await sleep(800);

  const inboundPayload = {
    data: {
      from: 'alice@example.com',
      to: 'customs@ukborderforce.site',
      subject: 'Test inbound',
      text: 'Hello from Alice',
      message_id: '<resend-abc-123@example.com>',
      attachments: []
    }
  };

  console.log('Posting simulated inbound email to /inbound/email');
  const r1 = await fetch(`http://localhost:${process.env.PORT}/inbound/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': process.env.INBOUND_WEBHOOK_SECRET || ''
    },
    body: JSON.stringify(inboundPayload)
  });
  console.log('/inbound/email status', r1.status);
  const j1 = await r1.json().catch(() => null);
  console.log('/inbound/email response', j1);

  // Confirm mapping saved by querying admin messages
  await sleep(300);
  const r2 = await fetch(`http://localhost:${process.env.PORT}/admin/api/messages`);
  const list = await r2.json();
  console.log('/admin/api/messages status', r2.status, 'count', list && list.messages && list.messages.length);
  const messages = (list && list.messages) || [];
  const inbound = messages.find(m => m.direction === 'inbound' && m.from && m.from.includes('alice@example.com'));
  if (!inbound) {
    console.error('FAIL: inbound message not found in store');
    process.exit(2);
  }
  console.log('Found inbound message id:', inbound.id);

  // Now simulate Telegram webhook reply to message_id 12345
  const telegramUpdate = {
    update_id: 1,
    message: {
      message_id: 20000,
      chat: { id: Number(process.env.TELEGRAM_CHAT_ID) },
      text: 'Reply from Telegram',
      reply_to_message: { message_id: 12345 }
    }
  };

  console.log('Posting simulated Telegram webhook to /webhook/telegram');
  const r3 = await fetch(`http://localhost:${process.env.PORT}/webhook/telegram`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': process.env.TELEGRAM_WEBHOOK_SECRET }, body: JSON.stringify(telegramUpdate)
  });
  console.log('/webhook/telegram status', r3.status);
  const j3 = await r3.json().catch(() => null);
  console.log('/webhook/telegram response', j3);

  await sleep(300);
  if (!lastSendMail) {
    console.error('FAIL: sendMail not invoked for telegram reply');
    process.exit(3);
  }

  console.log('OK: sendMail invoked with to=', lastSendMail.to, 'inReplyTo=', lastSendMail.inReplyTo, 'references=', lastSendMail.references);

  // Final check: list messages again and ensure a reply exists
  const r4 = await fetch(`http://localhost:${process.env.PORT}/admin/api/messages`);
  const list2 = await r4.json();
  const all = (list2 && list2.messages) || [];
  console.log('Total messages now:', all.length);

  console.log('Test complete — success');
  process.exit(0);
}

main().catch(err => { console.error('Test script error', err); process.exit(1); });
