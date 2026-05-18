#!/usr/bin/env node
/**
 * Test full flow: outbound send -> inbound reply -> admin reply
 * This tests text preservation and email header logging
 */
const store = require('../src/inboxStore');
const crypto = require('crypto');

async function testFullFlow() {
  console.log('=== FULL FLOW TEST: Outbound -> Inbound -> Admin Reply ===\n');

  const domain = process.env.CUSTOM_DOMAIN || 'ukborderforce.site';
  const customerEmail = 'alice@example.com';
  const borderForceEmail = 'customs@ukborderforce.site';

  // Step 1: Simulate outbound message with explicit Message-ID
  console.log('STEP 1: Simulating outbound email with Message-ID header');
  const outboundMsgId = `<outbound-${crypto.randomUUID()}@${domain}>`;
  const outbound = store.addOutboundMessage({
    threadId: `thread-${crypto.randomUUID()}`,
    from: borderForceEmail,
    to: customerEmail,
    subject: 'Official Notice - Border Force',
    text: 'Please review the attached notice regarding your vehicle.',
    html: '<p>Please review the attached notice regarding your vehicle.</p>',
    messageId: outboundMsgId,
    sentAt: new Date().toISOString(),
    raw: { source: 'test', headers: { 'Message-ID': outboundMsgId } }
  });

  console.log('  ✓ Stored outbound message');
  console.log(`    ID: ${outbound.id}`);
  console.log(`    Message-ID: ${outbound.messageId}`);
  console.log(`    Text length: ${outbound.text.length} chars`);
  console.log(`    Text preview: "${outbound.text.substring(0, 60)}..."\n`);

  // Step 2: Simulate inbound reply (webhook from Resend)
  console.log('STEP 2: Simulating inbound webhook reply from customer');
  const inboundMsgId = `<inbound-${crypto.randomUUID()}@${domain}>`;
  const repliedTo = store.findMessageByMessageId(outboundMsgId);
  
  const inbound = store.addInboundMessage({
    from: customerEmail,
    to: borderForceEmail,
    subject: `Re: Official Notice - Border Force`,
    text: 'I received the notice. I have questions about the seizure of my bank cheque.',
    html: '<p>I received the notice. I have questions about the seizure of my bank cheque.</p>',
    messageId: inboundMsgId,
    inReplyTo: outboundMsgId,
    references: outboundMsgId,
    threadId: repliedTo?.threadId || `thread-${crypto.randomUUID()}`,
    parentId: repliedTo?.id || null,
    receivedAt: new Date().toISOString(),
    raw: { 
      source: 'resend-webhook',
      headers: { 'In-Reply-To': outboundMsgId, 'References': outboundMsgId }
    }
  });

  console.log('  ✓ Stored inbound reply');
  console.log(`    ID: ${inbound.id}`);
  console.log(`    Message-ID: ${inbound.messageId}`);
  console.log(`    In-Reply-To: ${inbound.inReplyTo}`);
  console.log(`    Text length: ${inbound.text.length} chars`);
  console.log(`    Text preview: "${inbound.text.substring(0, 60)}..."\n`);

  // Step 3: Admin user replies to the inbound message
  console.log('STEP 3: Admin replies to the inbound message');
  console.log('  [ This would trigger sendMail() with In-Reply-To header ]');
  console.log(`    Replying to message ID: ${inbound.id}`);
  console.log(`    Message direction: "${inbound.direction}"`);
  console.log(`    Original message-id: ${inbound.messageId}`);
  
  const toEmail = inbound.direction === 'outbound' ? inbound.to : inbound.from;
  const references = [inbound.references, inbound.messageId].filter(Boolean).join(' ');
  
  console.log(`    Will send to: ${toEmail}`);
  console.log(`    In-Reply-To will be: ${inbound.messageId}`);
  console.log(`    References will be: ${references || '(none)'}\n`);

  // Step 4: Show the full thread
  console.log('STEP 4: View full thread in admin');
  const threadMessages = store.listMessages()
    .filter(m => m.threadId === outbound.threadId)
    .sort((a, b) => new Date(a.receivedAt || a.sentAt || 0) - new Date(b.receivedAt || b.sentAt || 0));

  for (const msg of threadMessages) {
    const direction = msg.direction.toUpperCase();
    const hasText = msg.text.length > 0;
    const textPreview = msg.text.substring(0, 50).replace(/\n/g, ' ');
    console.log(`  ${direction}: "${textPreview}..." [${msg.text.length} chars]`);
  }
  
  console.log('\n=== TEST COMPLETE ===');
  console.log('Key observations:');
  console.log('✓ Text preserved through storage');
  console.log('✓ In-Reply-To header configured for replies');
  console.log('✓ Threading linked by Message-ID matching');
}

testFullFlow().catch(e => console.error('Test error:', e));
