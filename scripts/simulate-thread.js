#!/usr/bin/env node
const store = require('../src/inboxStore');
const crypto = require('crypto');

function log(...args){ console.log(...args); }

(async()=>{
  const domain = process.env.CUSTOM_DOMAIN || 'local';
  const outboundMsgId = `<${crypto.randomUUID()}@${domain}>`;
  const customerEmail = 'customer@example.com';
  const borderForceEmail = process.env.FROM_EMAIL || 'customs@ukborderforce.site';

  log('=== THREADING + REPLY ROUTING TEST ===\n');
  const outbound = store.addOutboundMessage({
    threadId: `thread-${crypto.randomUUID()}`,
    from: borderForceEmail,
    to: customerEmail,
    subject: 'Simulated Outbound Test',
    text: 'This is a simulated outbound message with full text body.',
    html: '<p>This is a simulated outbound message.</p>',
    messageId: outboundMsgId,
    sentAt: new Date().toISOString(),
    raw: { source: 'simulate-thread' }
  });

  log('✓ OUTBOUND MESSAGE SAVED');
  log('  From:', outbound.from);
  log('  To:', outbound.to);
  log('  Text:', outbound.text.substring(0, 60) + '...');
  log('  Message-ID:', outbound.messageId);

  const inReplyToVal = outbound.messageId;
  const repliedTo = store.findMessageByMessageId(inReplyToVal);
  const inboundMsgId = `<reply-${crypto.randomUUID()}@${domain}>`;
  const inboundPayload = {
    from: customerEmail,
    to: borderForceEmail,
    subject: `Re: ${outbound.subject}`,
    text: 'This is a simulated reply with full text content from customer.',
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
  log('\n✓ INBOUND REPLY SAVED');
  log('  From:', inbound.from);
  log('  To:', inbound.to);
  log('  Text:', inbound.text.substring(0, 60) + '...');
  log('  Linked to outbound:', inbound.parentId === outbound.id ? 'YES' : 'NO', '(parentId matches)');

  log('\n=== REPLY ROUTING TEST ===');
  log('If replying to OUTBOUND message (direction="outbound"):');
  log('  toEmail should be:', outbound.to, '(customer, not Border Force)');
  log('\nIf replying to INBOUND message (direction="inbound"):');
  log('  toEmail should be:', inbound.from, '(sender, which is customer)');

  const threadMessages = store.listMessages().filter(m => (m.threadId||m.id) === outbound.threadId).sort((a,b)=> new Date(a.receivedAt||a.sentAt||0)-new Date(b.receivedAt||b.sentAt||0));
  log('\n=== THREAD MESSAGES ===');
  for (const m of threadMessages) {
    const recipientForReply = m.direction === 'outbound' ? m.to : m.from;
    log(`- ${m.direction.toUpperCase()}: text="${m.text.substring(0, 40)}..." replyWouldGoTo="${recipientForReply}"`);
  }
})();
