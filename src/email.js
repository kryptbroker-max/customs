// Email sending module using Resend.
// Exports a function that sends an email with a PDF Buffer attachment.
const { Resend } = require('resend');

// Resend client is created lazily on first use so this module is easy to require.
let resendClient;

function extractMessageId(data) {
  if (!data) return '';
  if (typeof data === 'string') return data;
  return data.id || data.messageId || data.message_id || '';
}

/**
 * Initialize and cache the Resend client using environment variables.
 * Expected env:
 *  - RESEND_API_KEY
 */
function getResendClient() {
  if (resendClient) return resendClient;

  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error('RESEND_API_KEY is missing. Check environment variables.');
  }

  resendClient = new Resend(apiKey);

  return resendClient;
}

/**
 * Send an email to a recipient with a PDF attachment (Buffer).
 * @param {string} recipientEmail
 * @param {string} subject
 * @param {string} htmlBody - HTML body for the email (cover message)
 * @param {Buffer} pdfBuffer - PDF data
 * @param {string} filename - filename for the attachment (e.g., 'notice.pdf')
 */
async function sendMailWithAttachment(recipientEmail, subject, htmlBody, pdfBuffer, filename = 'document.pdf') {
  if (!recipientEmail || !htmlBody || !pdfBuffer) {
    throw new TypeError('recipientEmail, htmlBody and pdfBuffer are required');
  }

  const resend = getResendClient();
  const from = process.env.FROM_EMAIL || 'Border Force <customs@ukborderforce.site>';
  const textBody = htmlBody.replace(/<[^>]+>/g, '').slice(0, 1000);

  const mailOptions = {
    from,
    to: recipientEmail,
    subject,
    text: textBody,
    html: htmlBody,
    attachments: [
      {
        filename,
        content: pdfBuffer.toString('base64'),
        contentType: 'application/pdf'
      }
    ]
  };

  try {
    const { data, error } = await resend.emails.send(mailOptions);

    if (error) {
      const resendError = new Error(error.message || 'Resend send failed');
      resendError.code = error.name || 'RESEND_SEND_FAILED';
      resendError.stage = 'resend-send';
      resendError.response = error;
      throw resendError;
    }

    const messageId = extractMessageId(data);

    if (!messageId) {
      throw new Error('Resend send failed: missing response id');
    }

    return { messageId, providerMessageId: messageId };
  } catch (error) {
    const wrapped = new Error(error && error.message ? `Resend send failed: ${error.message}` : 'Resend send failed');
    wrapped.code = error && error.code ? error.code : 'RESEND_SEND_FAILED';
    wrapped.stage = error && error.stage ? error.stage : 'resend-send';
    wrapped.responseCode = error && error.responseCode ? error.responseCode : undefined;
    wrapped.command = error && error.command ? error.command : undefined;
    wrapped.response = error && error.response ? error.response : undefined;
    throw wrapped;
  }
}

/**
 * Send a non-attachment email via Resend (used for inbox replies).
 * @param {object} params
 * @param {string} params.to
 * @param {string} params.subject
 * @param {string} [params.html]
 * @param {string} [params.text]
 * @param {string} [params.inReplyTo]
 * @param {string|string[]} [params.references]
 */
async function sendMail(params) {
  const { to, subject, html, text, inReplyTo, references } = params || {};

  if (!to || !subject || (!html && !text)) {
    throw new TypeError('to, subject and one of html/text are required');
  }

  const resend = getResendClient();
  const from = process.env.FROM_EMAIL || 'Border Force <customs@ukborderforce.site>';

  const headers = {};
  if (inReplyTo) headers['In-Reply-To'] = inReplyTo;
  if (references) {
    headers.References = Array.isArray(references) ? references.join(' ') : String(references);
  }

  const mailOptions = {
    from,
    to,
    subject,
    html,
    text,
    headers: Object.keys(headers).length > 0 ? headers : undefined
  };

  try {
    const { data, error } = await resend.emails.send(mailOptions);

    if (error) {
      const resendError = new Error(error.message || 'Resend send failed');
      resendError.code = error.name || 'RESEND_SEND_FAILED';
      resendError.stage = 'resend-send';
      resendError.response = error;
      throw resendError;
    }

    const messageId = extractMessageId(data);

    if (!messageId) {
      throw new Error('Resend send failed: missing response id');
    }

    return { messageId, providerMessageId: messageId };
  } catch (error) {
    const wrapped = new Error(error && error.message ? `Resend send failed: ${error.message}` : 'Resend send failed');
    wrapped.code = error && error.code ? error.code : 'RESEND_SEND_FAILED';
    wrapped.stage = error && error.stage ? error.stage : 'resend-send';
    wrapped.responseCode = error && error.responseCode ? error.responseCode : undefined;
    wrapped.command = error && error.command ? error.command : undefined;
    wrapped.response = error && error.response ? error.response : undefined;
    throw wrapped;
  }
}

module.exports = { sendMailWithAttachment, sendMail };
