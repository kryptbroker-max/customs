/**
 * Unified Database Layer
 * Supports both file-based storage (development) and MongoDB (production)
 * Uses MONGODB_URI environment variable to determine which backend to use
 */

const { MongoClient } = require('mongodb');
const fileStore = require('./inboxStore');
const crypto = require('crypto');

let mongoClient = null;
let mongoDb = null;
const MONGODB_URI = process.env.MONGODB_URI;

async function connectToMongo() {
  if (!MONGODB_URI) {
    console.log('[DB] Using file-based storage (set MONGODB_URI for MongoDB)');
    return null;
  }

  try {
    mongoClient = new MongoClient(MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    await mongoClient.connect();
    mongoDb = mongoClient.db('mailing');
    
    // Create collections and indexes
    const messagesCollection = mongoDb.collection('messages');
    await messagesCollection.createIndex({ messageId: 1 });
    await messagesCollection.createIndex({ normalizedMessageId: 1 });
    await messagesCollection.createIndex({ threadId: 1 });
    await messagesCollection.createIndex({ receivedAt: -1 });
    await messagesCollection.createIndex({ sentAt: -1 });

    // One-time bootstrap migration from file store if MongoDB collection is empty
    const mongoCount = await messagesCollection.countDocuments();
    if (mongoCount === 0) {
      const fileMessages = fileStore.listMessages();
      if (Array.isArray(fileMessages) && fileMessages.length > 0) {
        await messagesCollection.insertMany(fileMessages, { ordered: false });
        console.log(`[DB] Migrated ${fileMessages.length} messages from file store to MongoDB`);
      }
    }
    
    console.log('[DB] Connected to MongoDB');
    return mongoDb;
  } catch (err) {
    console.error('[DB] MongoDB connection failed, falling back to file storage:', err.message);
    mongoDb = null;
    mongoClient = null;
    return null;
  }
}

function normalizeMessageId(raw) {
  if (!raw) return '';
  try {
    return String(raw).trim().replace(/^<|>$/g, '').toLowerCase();
  } catch (e) {
    return String(raw || '').trim();
  }
}

// Database operations - auto-route to MongoDB or file storage
async function listMessages() {
  if (mongoDb) {
    try {
      const messages = await mongoDb
        .collection('messages')
        .find({})
        .sort({ receivedAt: -1, sentAt: -1 })
        .toArray();
      return messages;
    } catch (err) {
      console.error('[DB] MongoDB listMessages error:', err.message);
      return fileStore.listMessages();
    }
  }
  return fileStore.listMessages();
}

async function getMessageById(id) {
  if (!id) return null;
  
  if (mongoDb) {
    try {
      const message = await mongoDb.collection('messages').findOne({ id });
      return message || null;
    } catch (err) {
      console.error('[DB] MongoDB getMessageById error:', err.message);
      return fileStore.getMessageById(id);
    }
  }
  return fileStore.getMessageById(id);
}

async function findMessageByMessageId(messageId) {
  if (!messageId) return null;
  
  if (mongoDb) {
    try {
      const needle = normalizeMessageId(messageId);
      const message = await mongoDb.collection('messages').findOne({
        $or: [
          { normalizedMessageId: needle },
          { messageId: messageId }
        ]
      });
      return message || null;
    } catch (err) {
      console.error('[DB] MongoDB findMessageByMessageId error:', err.message);
      return fileStore.findMessageByMessageId(messageId);
    }
  }
  return fileStore.findMessageByMessageId(messageId);
}

async function addInboundMessage(message) {
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

  if (mongoDb) {
    try {
      // Check for duplicates
      const existing = await mongoDb.collection('messages').findOne({
        $or: [
          { normalizedMessageId: record.normalizedMessageId },
          { messageId: record.messageId }
        ]
      });
      if (existing) return existing;

      await mongoDb.collection('messages').insertOne(record);
      return record;
    } catch (err) {
      console.error('[DB] MongoDB addInboundMessage error:', err.message);
      return fileStore.addInboundMessage(message);
    }
  }
  return fileStore.addInboundMessage(message);
}

async function addOutboundMessage(message) {
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
    normalizedMessageId: normalizeMessageId(message.messageId || ''),
    inReplyTo: message.inReplyTo || '',
    references: message.references || '',
    attachments: message.attachments || [],
    sentAt: message.sentAt || now,
    raw: message.raw || null,
    replies: []
  };

  if (mongoDb) {
    try {
      // Check for duplicates
      const existing = await mongoDb.collection('messages').findOne({
        $or: [
          { normalizedMessageId: record.normalizedMessageId },
          { messageId: record.messageId }
        ]
      });
      if (existing) return existing;

      await mongoDb.collection('messages').insertOne(record);
      return record;
    } catch (err) {
      console.error('[DB] MongoDB addOutboundMessage error:', err.message);
      return fileStore.addOutboundMessage(message);
    }
  }
  return fileStore.addOutboundMessage(message);
}

async function addReply(messageId, reply) {
  if (mongoDb) {
    try {
      const parent = await mongoDb.collection('messages').findOne({ id: messageId });
      if (!parent) return null;

      const record = {
        id: crypto.randomUUID(),
        direction: 'outbound',
        threadId: parent.threadId || parent.id,
        parentId: parent.id,
        to: reply.to,
        subject: reply.subject,
        text: reply.text,
        html: reply.html,
        messageId: reply.messageId || '',
        normalizedMessageId: normalizeMessageId(reply.messageId || ''),
        inReplyTo: reply.inReplyTo || '',
        references: reply.references || '',
        attachments: reply.attachments || [],
        sentAt: reply.sentAt || new Date().toISOString(),
        raw: null,
        replies: []
      };

      await mongoDb.collection('messages').insertOne(record);
      return record;
    } catch (err) {
      console.error('[DB] MongoDB addReply error:', err.message);
      return fileStore.addReply(messageId, reply);
    }
  }
  return fileStore.addReply(messageId, reply);
}

async function linkTelegramMessage(messageId, chatId, telegramMessageId) {
  if (!messageId || !telegramMessageId) return null;
  if (mongoDb) {
    try {
      const update = { $set: { 'telegram.chatId': String(chatId || ''), 'telegram.messageId': Number(telegramMessageId) } };
      await mongoDb.collection('messages').updateOne({ id: messageId }, update);
      const updated = await mongoDb.collection('messages').findOne({ id: messageId });
      return updated;
    } catch (err) {
      console.error('[DB] MongoDB linkTelegramMessage error:', err.message);
      return fileStore.linkTelegramMessage ? fileStore.linkTelegramMessage(messageId, chatId, telegramMessageId) : null;
    }
  }
  return fileStore.linkTelegramMessage ? fileStore.linkTelegramMessage(messageId, chatId, telegramMessageId) : null;
}

async function findMessageByTelegramMessageId(chatId, telegramMessageId) {
  if (!telegramMessageId) return null;
  if (mongoDb) {
    try {
      const msg = await mongoDb.collection('messages').findOne({
        'telegram.messageId': Number(telegramMessageId),
        'telegram.chatId': String(chatId || '')
      });
      if (msg) return msg;
      // Fallback to matching by message_id only when the chatId does not match.
      return await mongoDb.collection('messages').findOne({
        'telegram.messageId': Number(telegramMessageId)
      });
    } catch (err) {
      console.error('[DB] MongoDB findMessageByTelegramMessageId error:', err.message);
      return fileStore.findMessageByTelegramMessageId ? fileStore.findMessageByTelegramMessageId(chatId, telegramMessageId) : null;
    }
  }
  return fileStore.findMessageByTelegramMessageId ? fileStore.findMessageByTelegramMessageId(chatId, telegramMessageId) : null;
}

module.exports = {
  connectToMongo,
  listMessages,
  getMessageById,
  findMessageByMessageId,
  addInboundMessage,
  addOutboundMessage,
  addReply,
  linkTelegramMessage,
  findMessageByTelegramMessageId
};
