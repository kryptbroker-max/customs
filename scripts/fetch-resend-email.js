const https = require('https');
const id = process.argv[2];
const key = process.env.RESEND_API_KEY || process.env.RESEND_KEY || '';
if (!id) {
  console.error('Usage: node fetch-resend-email.js <email_id>');
  process.exit(2);
}
if (!key) {
  console.error('No RESEND_API_KEY in environment');
  process.exit(2);
}
const opts = { headers: { Authorization: 'Bearer ' + key } };
https.get('https://api.resend.com/emails/' + id, opts, res => {
  let b = '';
  res.on('data', c => b += c);
  res.on('end', () => {
    try {
      const j = JSON.parse(b);
      console.log('FETCHED KEYS:', Object.keys(j));
      const text = j.text || j.html;
      if (text && typeof text === 'string') {
        const plain = /<[^>]+>/.test(text) ? text.replace(/<[^>]+>/g, '') : text;
        console.log('\nTEXT PREVIEW:\n', plain.slice(0, 2000));
      } else {
        console.log('\nTEXT PREVIEW:\n No body found');
      }
    } catch (e) {
      console.error('PARSE ERROR', e);
      console.log('RAW:', b.slice(0, 2000));
    }
  });
}).on('error', e => {
  console.error('REQ ERROR', e);
});
