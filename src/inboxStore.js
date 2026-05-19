const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'inbox.json');

function normalizeMessageId(raw) {
  if (!raw) return '';
  try {
    return String(raw).trim().replace(/^<|>$/g, '').toLowerCase();
  } catch (e) {
    return String(raw || '').trim();
  }
}

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify({ messages: [] }, null, 2), 'utf8');
  }
}

function readStore() {
  ensureStore();
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.messages)) {
      parsed.messages = Array.isArray(parsed.messages) ? parsed.messages : [];
    }

    // Migrate legacy `sentMessages` into `messages` if present
    if (Array.isArray(parsed.sentMessages) && parsed.sentMessages.length > 0) {
      const legacy = parsed.sentMessages.map(m => ({
        ...m,
        direction: m.direction || 'outbound',
        threadId: m.threadId || m.messageId || crypto.randomUUID(),
        normalizedMessageId: normalizeMessageId(m.messageId || ''),
        replies: m.replies || [],
        sentAt: m.sentAt || new Date().toISOString()
      }));
      parsed.messages = [...parsed.messages, ...legacy];
      delete parsed.sentMessages;
      // persist migration
      try { fs.writeFileSync(STORE_FILE, JSON.stringify(parsed, null, 2), 'utf8'); } catch (e) { /* ignore */ }
    }

    // Ensure every message has normalizedMessageId for reliable lookups
    if (Array.isArray(parsed.messages)) {
      parsed.messages = parsed.messages.map(m => ({
        ...m,
        messageId: m.messageId || '',
        normalizedMessageId: normalizeMessageId(m.normalizedMessageId || m.messageId || '')
      }));
    }

    return parsed;
  } catch (error) {
    return { messages: [] };
  }
}

// Expose a private read helper for DB shim (used cautiously)
function _readStore() {
  return readStore();
}

function findMessageByTelegramMessageId(chatId, telegramMessageId) {
  if (!telegramMessageId) return null;
  const store = readStore();
  const needle = String(telegramMessageId);
  return store.messages.find(m => {
    if (!m.telegram) return false;
    const mid = m.telegram.messageId ? String(m.telegram.messageId) : '';
    const cid = m.telegram.chatId ? String(m.telegram.chatId) : '';
    return mid === needle && (String(chatId || '') === '' || cid === String(chatId));
  }) || null;
}

function linkTelegramMessage(messageId, chatId, telegramMessageId) {
  if (!messageId || !telegramMessageId) return null;
  const store = readStore();
  const idx = store.messages.findIndex(m => m.id === messageId);
  if (idx === -1) return null;
  store.messages[idx].telegram = store.messages[idx].telegram || {};
  store.messages[idx].telegram.chatId = String(chatId || '');
  store.messages[idx].telegram.messageId = Number(telegramMessageId);
  writeStore(store);
  return store.messages[idx];
}

function writeStore(store) {
  ensureStore();
  const tempFile = `${STORE_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tempFile, STORE_FILE);
}

function sortNewestFirst(messages) {
  return [...messages].sort((a, b) => {
    const aTime = new Date(a.receivedAt || 0).getTime();
    const bTime = new Date(b.receivedAt || 0).getTime();
    return bTime - aTime;
  });
}

function listMessages() {
  const store = readStore();
  return sortNewestFirst(store.messages);
}

function getMessageById(id) {
  if (!id) return null;
  const store = readStore();
  return store.messages.find(m => m.id === id) || null;
}

function findMessageByMessageId(messageId) {
  if (!messageId) return null;
  const store = readStore();
  const needle = normalizeMessageId(messageId);
  return store.messages.find(m => normalizeMessageId(m.messageId) === needle || normalizeMessageId(m.normalizedMessageId) === needle) || null;
}

function getThreadIdForMessage(message) {
  if (!message) return crypto.randomUUID();
  return message.threadId || message.id || message.messageId || crypto.randomUUID();
}

function addOutboundMessage(message) {
  const store = readStore();

  if (message.messageId) {
    const existing = store.messages.find(m => normalizeMessageId(m.messageId) === normalizeMessageId(message.messageId));
    if (existing) return existing;
  }

  const now = new Date().toISOString();
  const record = {
    id: crypto.randomUUID(),
    direction: 'outbound',
    threadId: getThreadIdForMessage(message),
    parentId: message.parentId || null,
    from: message.from || '',
    to: message.to || '',
    subject: message.subject || '(no subject)',
    text: message.text || '',
    html: message.html || '',
    messageId: message.messageId || '',
    normalizedMessageId: normalizeMessageId(message.messageId || ''),
    inReplyTo: message.inReplyTo || '',
    references: message.references || '',
    attachments: message.attachments || [],
    sentAt: message.sentAt || now,
    raw: message.raw || null,
    replies: []
  };

  store.messages.push(record);
  writeStore(store);
  return record;
}

function addInboundMessage(message) {
  const store = readStore();

  if (message.messageId) {
    const existing = store.messages.find(m => normalizeMessageId(m.messageId) === normalizeMessageId(message.messageId));
    if (existing) return existing;
  }

  const now = new Date().toISOString();
  const record = {
    id: crypto.randomUUID(),
    direction: 'inbound',
    threadId: message.threadId || message.messageId || crypto.randomUUID(),
    parentId: message.parentId || null,
    from: message.from || '',
    to: message.to || '',
    subject: message.subject || '(no subject)',
    text: message.text || '',
    html: message.html || '',
    messageId: message.messageId || '',
    normalizedMessageId: normalizeMessageId(message.messageId || ''),
    inReplyTo: message.inReplyTo || '',
    references: message.references || '',
    attachments: message.attachments || [],
    receivedAt: message.receivedAt || now,
    raw: message.raw || null,
    replies: []
  };

  store.messages.push(record);
  writeStore(store);
  return record;
}

function addReply(messageId, reply) {
  const store = readStore();
  const parent = store.messages.find(m => m.id === messageId);
  if (!parent) return null;

  const record = {
    id: crypto.randomUUID(),
    direction: 'outbound',
    threadId: parent.threadId || parent.id,
    parentId: parent.id,
    to: reply.to,
    subject: reply.subject,
    text: reply.text || '',
    html: reply.html || '',
    messageId: reply.messageId || '',
    sentAt: new Date().toISOString()
  };

  parent.replies = Array.isArray(parent.replies) ? parent.replies : [];
  parent.replies.push(record);
  writeStore(store);
  return record;
}

module.exports = {
  listMessages,
  getMessageById,
  findMessageByMessageId,
  addInboundMessage,
  addOutboundMessage,
  addReply,
  // Telegram helpers
  findMessageByTelegramMessageId,
  linkTelegramMessage,
  _readStore
};