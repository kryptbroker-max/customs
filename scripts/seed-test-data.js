const store = require('../src/inboxStore');

const outbound = store.addOutboundMessage({
  threadId: 'thread-test-001',
  from: 'customs@ukborderforce.site',
  to: 'customer.alice@example.com',
  subject: 'Official Notice - Border Force',
  text: 'Please find the attached formal notice regarding your vehicle. The document contains the full record and instructions for action.',
  html: '<p>Please find the attached formal notice regarding your vehicle. The document contains the full record and instructions for action.</p>',
  messageId: '<outbound-test-001@ukborderforce.site>',
  sentAt: new Date(Date.now() - 7200000).toISOString(),
  raw: { source: 'test-seed' }
});

console.log('Outbound message added:', outbound.id);

const all = store.listMessages();
console.log('Total messages in store:', all.length);
all.forEach(m => {
  console.log(`- ${m.direction.toUpperCase()}: "${m.subject.substring(0, 40)}..." from ${m.from}`);
});
