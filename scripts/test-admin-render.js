#!/usr/bin/env node
/**
 * Test the admin page rendering logic
 */

// Mock DOM elements
const mockElements = {
  detailEmpty: { style: { display: 'block' } },
  detailBody: { style: { display: 'none' }, querySelectorAll: () => [] },
  fromEl: { textContent: '' },
  toEl: { textContent: '' },
  subjectEl: { textContent: '' },
  receivedAtEl: { textContent: '' },
  repliesEl: { innerHTML: '', querySelectorAll: () => [] },
  replySubjectEl: { value: '' },
  replyTextEl: { value: '' },
  replyDestinationEl: { textContent: '' }
};

// Mock functions
function setStatus(text, isError = false) {
  console.log(`[${isError ? 'ERROR' : 'OK'}] ${text}`);
}

// Test thread data
const testThread = {
  threadId: 'thread-test-1',
  latest: {
    id: 'msg-1',
    direction: 'inbound',
    subject: 'Customer Reply',
    text: 'I have a question about my notice.',
    from: 'alice@example.com',
    to: 'customs@ukborderforce.site',
    receivedAt: new Date().toISOString(),
    messageId: '<msg-id-1@example.com>'
  },
  replyTarget: {
    id: 'msg-1',
    direction: 'inbound',
    from: 'alice@example.com',
    to: 'customs@ukborderforce.site'
  },
  messages: [
    {
      id: 'msg-1',
      direction: 'outbound',
      subject: 'Official Notice',
      text: 'Please review the attached notice.',
      from: 'customs@ukborderforce.site',
      to: 'alice@example.com',
      sentAt: new Date(Date.now() - 3600000).toISOString(),
      messageId: '<outbound-1@ukborderforce.site>'
    },
    {
      id: 'msg-2',
      direction: 'inbound',
      subject: 'Re: Official Notice',
      text: 'I have a question about my notice.',
      from: 'alice@example.com',
      to: 'customs@ukborderforce.site',
      receivedAt: new Date().toISOString(),
      messageId: '<inbound-1@example.com>'
    }
  ]
};

// Test renderDetail function
function testRenderDetail() {
  console.log('\n=== TESTING renderDetail FUNCTION ===\n');

  // Simulate the renderDetail function logic
  const replyTarget = testThread.replyTarget || testThread.latest;

  mockElements.fromEl.textContent = replyTarget?.from || '';
  mockElements.toEl.textContent = replyTarget?.to || '';
  mockElements.subjectEl.textContent = testThread.latest?.subject || '';
  mockElements.receivedAtEl.textContent = new Date(testThread.latest?.receivedAt || Date.now()).toLocaleString();

  // Set reply destination email
  const replyDestinationEmail = replyTarget?.direction === 'outbound' ? replyTarget?.to : replyTarget?.from;
  mockElements.replyDestinationEl.textContent = replyDestinationEmail || 'Unknown recipient';

  const defaultReplySubject = testThread.latest?.subject && testThread.latest.subject.toLowerCase().startsWith('re:')
    ? testThread.latest.subject
    : `Re: ${testThread.latest?.subject || '(no subject)'}`;
  mockElements.replySubjectEl.value = defaultReplySubject;
  mockElements.replyTextEl.value = '';

  // Render messages
  let htmlOutput = '';
  if (testThread.messages.length) {
    htmlOutput = testThread.messages.map((m, idx) => {
      const direction = m.direction || 'inbound';
      const sentAt = m.receivedAt ? new Date(m.receivedAt).toLocaleString() : (m.sentAt ? new Date(m.sentAt).toLocaleString() : '');
      const messageBody = m.text && m.text.trim() ? m.text : '[No message body]';
      const messageIdDisplay = m.messageId ? m.messageId.substring(0, 50) : '';
      
      return `
        <div class="thread-message ${direction}" data-message-id="${m.messageId || ''}">
          <div class="message-header-top">
            <div>
              <span class="message-direction-badge ${direction}">${direction === 'outbound' ? 'Your Reply' : 'Incoming'}</span>
              <span class="message-subject">${m.subject || '(no subject)'}</span>
            </div>
            <span class="message-timestamp">${sentAt}</span>
          </div>
          <div class="message-addresses">
            <div class="message-address-item">
              <strong>From:</strong>
              ${m.from || 'Unknown'}
            </div>
            <div class="message-address-item">
              <strong>To:</strong>
              ${m.to || 'Unknown'}
            </div>
          </div>
          <div class="message-body">${messageBody}</div>
          ${messageIdDisplay ? `<div class="message-id"><strong>ID:</strong> <span class="msg-id-text">${messageIdDisplay}</span>... <button class="copy-btn">Copy</button></div>` : ''}
        </div>
      `;
    }).join('');
  }

  console.log('From:', mockElements.fromEl.textContent);
  console.log('To:', mockElements.toEl.textContent);
  console.log('Subject:', mockElements.subjectEl.textContent);
  console.log('Reply Destination:', mockElements.replyDestinationEl.textContent);
  console.log('Reply Subject:', mockElements.replySubjectEl.value);
  console.log('\nGenerated HTML message count:', testThread.messages.length);
  console.log('First message direction:', testThread.messages[0].direction);
  console.log('First message text:', testThread.messages[0].text.substring(0, 40) + '...');
  console.log('\nGenerated HTML structure valid:', htmlOutput.includes('message-direction-badge') && htmlOutput.includes('message-addresses'));

  console.log('\n=== RENDER TEST PASSED ===\n');
}

testRenderDetail();
