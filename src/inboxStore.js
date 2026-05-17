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
    fs.writeFileSync(STORE_FILE, JSON.stringify({ messages: [], sentMessages: [] }, null, 2), 'utf8');
  }
}

function readStore() {
  ensureStore();
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.messages)) {
      return { messages: [], sentMessages: [] };
    }
    return {
      messages: parsed.messages,
      sentMessages: Array.isArray(parsed.sentMessages) ? parsed.sentMessages : []
    };
  } catch (error) {
    return { messages: [], sentMessages: [] };
  }
}

function writeStore(store) {
  ensureStore();
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function sortNewestFirst(messages) {
  return [...messages].sort((a, b) => {
    const aTime = new Date(a.receivedAt || a.sentAt || 0).getTime();
    const bTime = new Date(b.receivedAt || b.sentAt || 0).getTime();
    return bTime - aTime;
  });
}

function makeThreadId(message) {
  return message.threadId || message.messageId || crypto.randomUUID();
}

function normalizeStore(store) {
  return {
    messages: Array.isArray(store.messages) ? store.messages : [],
    sentMessages: Array.isArray(store.sentMessages) ? store.sentMessages : []
  };
}

function findMessageByMessageId(messageId) {
  if (!messageId) return null;
  const store = normalizeStore(readStore());
  return store.messages.find(m => m.messageId === messageId) ||
    store.sentMessages.find(m => m.messageId === messageId) ||
    null;
}

function findReplyAnchor(message) {
  const candidates = [];
  if (message && message.inReplyTo) candidates.push(message.inReplyTo);
  if (message && message.references) {
    String(message.references).split(/\s+/).filter(Boolean).forEach(reference => candidates.push(reference));
  }

  for (const candidate of candidates) {
    const found = findMessageByMessageId(candidate);
    if (found) return found;
  }

  return null;
}

function listMessages() {
  const store = normalizeStore(readStore());
  return sortNewestFirst(store.messages);
}

function getMessageById(id) {
  if (!id) return null;
  const store = normalizeStore(readStore());
  return store.messages.find(m => m.id === id) ||
    store.sentMessages.find(m => m.id === id) ||
    null;
}

function listThreads() {
  const store = normalizeStore(readStore());
  const threads = new Map();

  const upsertThread = (message, isSent = false) => {
    const threadId = message.threadId || message.messageId || message.id;
    if (!threadId) return;

    const entry = threads.get(threadId) || {
      threadId,
      rootMessage: null,
      messages: []
    };

    if (isSent) {
      if (!entry.rootMessage || (message.parentId == null && message.direction === 'outbound')) {
        entry.rootMessage = message;
      }
    } else if (!entry.rootMessage && message.parentId == null) {
      entry.rootMessage = message;
    }

    entry.messages.push(message);
    threads.set(threadId, entry);
  };

  store.sentMessages.forEach(message => upsertThread(message, true));
  store.messages.forEach(message => upsertThread(message, false));

  return Array.from(threads.values()).map(thread => ({
    threadId: thread.threadId,
    rootMessage: thread.rootMessage,
    messages: sortNewestFirst(thread.messages)
  })).sort((a, b) => {
    const aTime = new Date((a.rootMessage && (a.rootMessage.receivedAt || a.rootMessage.sentAt)) || 0).getTime();
    const bTime = new Date((b.rootMessage && (b.rootMessage.receivedAt || b.rootMessage.sentAt)) || 0).getTime();
    return bTime - aTime;
  });
}

function addInboundMessage(message) {
  const store = normalizeStore(readStore());

  if (message.messageId) {
    const existing = store.messages.find(m => m.messageId === message.messageId) ||
      store.sentMessages.find(m => m.messageId === message.messageId);
    if (existing) return existing;
  }

  const now = new Date().toISOString();
  const anchor = findReplyAnchor(message);
  const threadId = message.threadId || (anchor && (anchor.threadId || anchor.messageId || anchor.id)) || message.messageId || crypto.randomUUID();
  const record = {
    id: crypto.randomUUID(),
    direction: 'inbound',
    threadId,
    parentId: anchor ? anchor.id : (message.parentId || null),
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

function addOutboundMessage(message) {
  const store = normalizeStore(readStore());

  if (message.messageId) {
    const existing = store.sentMessages.find(m => m.messageId === message.messageId) ||
      store.messages.find(m => m.messageId === message.messageId);
    if (existing) return existing;
  }

  const now = new Date().toISOString();
  const record = {
    id: crypto.randomUUID(),
    direction: 'outbound',
    threadId: message.threadId || message.messageId || crypto.randomUUID(),
    parentId: message.parentId || null,
    from: message.from || '',
    to: message.to || '',
    subject: message.subject || '(no subject)',
    text: message.text || '',
    html: message.html || '',
    messageId: message.messageId || '',
    sentAt: message.sentAt || now,
    raw: message.raw || null
  };

  store.sentMessages.push(record);
  writeStore(store);
  return record;
}

function addReply(messageId, reply) {
  const store = normalizeStore(readStore());
  const parent = store.messages.find(m => m.id === messageId);
  if (!parent) return null;

  const record = {
    id: crypto.randomUUID(),
    direction: 'outbound',
    threadId: parent.threadId || parent.messageId || crypto.randomUUID(),
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
  store.sentMessages.push(record);
  writeStore(store);
  return record;
}

module.exports = {
  listMessages,
  listThreads,
  getMessageById,
  findMessageByMessageId,
  addInboundMessage,
  addOutboundMessage,
  addReply
};