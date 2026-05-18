#!/usr/bin/env node
const store = require('../src/inboxStore');
const crypto = require('crypto');

function log(...args){ console.log(...args); }

(async()=>{
  const domain = process.env.CUSTOM_DOMAIN || 'local';
  const outboundMsgId = `<${crypto.randomUUID()}@${domain}>`;
  const outbound = store.addOutboundMessage({
    threadId: `thread-${crypto.randomUUID()}`,
    from: process.env.FROM_EMAIL || 'Border Force <customs@ukborderforce.site>',
    to: 'customer@example.com',
    subject: 'Simulated Outbound Test',
    text: 'This is a simulated outbound message.',
    html: '<p>This is a simulated outbound message.</p>',
    messageId: outboundMsgId,
    sentAt: new Date().toISOString(),
    raw: { source: 'simulate-thread' }
  });

  log('Outbound saved:', {id: outbound.id, messageId: outbound.messageId, normalized: outbound.normalizedMessageId, threadId: outbound.threadId});

  const inReplyToVal = outbound.messageId;
  const repliedTo = store.findMessageByMessageId(inReplyToVal);
  const inboundMsgId = `<reply-${crypto.randomUUID()}@${domain}>`;
  const inboundPayload = {
    from: 'customer@example.com',
    to: process.env.FROM_EMAIL || 'customs@ukborderforce.site',
    subject: `Re: ${outbound.subject}`,
    text: 'This is a simulated reply',
    html: '<p>This is a simulated reply</p>',
    messageId: inboundMsgId,
    inReplyTo: inReplyToVal,
    references: inReplyToVal,
    receivedAt: new Date().toISOString(),
    raw: { simulated: true }
  };
  if (repliedTo) {
    inboundPayload.threadId = repliedTo.threadId || repliedTo.id || repliedTo.messageId;
    inboundPayload.parentId = repliedTo.id;
  }
  const inbound = store.addInboundMessage(inboundPayload);
  log('Inbound saved:', {id: inbound.id, messageId: inbound.messageId, threadId: inbound.threadId, parentId: inbound.parentId});

  const threadMessages = store.listMessages().filter(m => (m.threadId||m.id) === outbound.threadId).sort((a,b)=> new Date(a.receivedAt||a.sentAt||0)-new Date(b.receivedAt||b.sentAt||0));
  log('Thread messages:');
  for (const m of threadMessages) {
    log('-', {id:m.id, direction:m.direction, messageId:m.messageId, normalized:m.normalizedMessageId, parentId:m.parentId});
  }
})();
