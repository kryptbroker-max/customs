const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'inbox.json');

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
      return { messages: [] };
    }
    return parsed;
  } catch (error) {
    return { messages: [] };
  }
}

function writeStore(store) {
  ensureStore();
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
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

function addInboundMessage(message) {
  const store = readStore();

  if (message.messageId) {
    const existing = store.messages.find(m => m.messageId === message.messageId);
    if (existing) return existing;
  }

  const now = new Date().toISOString();
  const record = {
    id: crypto.randomUUID(),
    direction: 'inbound',
    threadId: message.threadId || message.messageId || crypto.randomUUID(),
    from: message.from || '',
    to: message.to || '',
    subject: message.subject || '(no subject)',
    text: message.text || '',
    html: message.html || '',
    messageId: message.messageId || '',
    inReplyTo: message.inReplyTo || '',
    references: message.references || '',
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
  addInboundMessage,
  addReply
};