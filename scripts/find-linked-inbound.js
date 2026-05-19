const fs = require('fs');
try {
  const j = JSON.parse(fs.readFileSync('data/inbox.json','utf8'));
  const msgs = j.messages || [];
  const m = msgs.slice().reverse().find(x => x.direction === 'inbound' && x.telegram && x.telegram.chatId);
  if (!m) {
    console.error('NO_LINKED_INBOUND');
    process.exit(1);
  }
  console.log(JSON.stringify({ id: m.id, threadId: m.threadId, telegram: m.telegram, from: m.from, subject: m.subject }));
} catch (err) {
  console.error('ERROR', err && err.message ? err.message : err);
  process.exit(2);
}
