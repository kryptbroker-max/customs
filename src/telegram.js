// Lightweight Telegram helper to send messages and parse updates
const https = require('https');

function buildTelegramApiUrl(token, method) {
  return `https://api.telegram.org/bot${token}/${method}`;
}

function escapeMarkdownV2(text) {
  if (!text) return '';
  return String(text).replace(/([_\*\[\]\(\)~`>#+\-=|{}\\.!])/g, '\\$1');
}

async function sendTelegramMessage(token, chatId, text, opts = {}) {
  if (!token || !chatId) {
    throw new Error('TELEGRAM_BOT_TOKEN and chatId are required');
  }

  const payload = {
    chat_id: chatId,
    text: text || '',
    disable_web_page_preview: !!opts.disable_web_page_preview
  };

  if (opts.parse_mode !== undefined && opts.parse_mode !== null && opts.parse_mode !== '') {
    payload.parse_mode = opts.parse_mode;
  } else if (opts.parse_mode !== '') {
    payload.parse_mode = 'MarkdownV2';
  }

  const body = JSON.stringify(payload);
  const url = buildTelegramApiUrl(token, 'sendMessage');

  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data || '{}');
          if (!parsed || parsed.ok !== true) return reject(new Error('Telegram API error: ' + (data || 'no-response')));
          resolve(parsed.result);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.setTimeout(5000, () => {
      const timeoutError = new Error('Telegram request timed out');
      req.destroy(timeoutError);
      reject(timeoutError);
    });
    req.on('error', err => reject(err));
    req.write(body);
    req.end();
  });
}

module.exports = { sendTelegramMessage, escapeMarkdownV2 };
