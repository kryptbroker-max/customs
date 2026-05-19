// Email sending module using Resend.
// Exports a function that sends an email with a PDF Buffer attachment.
const { Resend } = require('resend');
const crypto = require('crypto');

// Resend client is created lazily on first use so this module is easy to require.
let resendClient;

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

  const messageIdHeader = `<${crypto.randomUUID()}@${process.env.CUSTOM_DOMAIN || 'local'}>`;
  const headers = { 'Message-ID': messageIdHeader };

  const mailOptions = {
    from,
    to: recipientEmail,
    subject,
    text: textBody,
    html: htmlBody,
    headers,
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

    if (!data || !data.id) {
      throw new Error('Resend send failed: missing response id');
    }

    // Prefer the explicit Message-ID we set for threading, fall back to provider id
    return { messageId: messageIdHeader || data.id, raw: data };
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

  const messageIdHeader = `<${crypto.randomUUID()}@${process.env.CUSTOM_DOMAIN || 'local'}>`;
  const headers = { 'Message-ID': messageIdHeader };
  
  // Set In-Reply-To header - Resend expects the message-id without angle brackets for matching
  if (inReplyTo) {
    const inReplyToClean = String(inReplyTo).trim().replace(/^<|>$/g, '');
    headers['In-Reply-To'] = `<${inReplyToClean}>`;
  }
  if (references) {
    const referencesList = Array.isArray(references) 
      ? references.map(r => `<${String(r).trim().replace(/^<|>$/g, '')}>`) 
      : [String(references).trim().replace(/^<|>$/g, '')].map(r => `<${r}>`);
    headers.References = referencesList.join(' ');
  }

  console.log('[EMAIL] Sending mail via Resend:', {
    to,
    subject: subject.substring(0, 60),
    hasInReplyTo: !!inReplyTo,
    inReplyTo: headers['In-Reply-To'],
    hasReferences: !!references,
    references: headers.References || '(none)',
    headers: Object.keys(headers)
  });

  const mailOptions = {
    from,
    to,
    subject,
    html,
    text,
    headers: Object.keys(headers).length > 0 ? headers : undefined
  };

  async function sendWithResend(options) {
    const { data, error } = await resend.emails.send(options);
    if (error) {
      const resendError = new Error(error.message || 'Resend send failed');
      resendError.code = error.name || 'RESEND_SEND_FAILED';
      resendError.stage = 'resend-send';
      resendError.response = error;
      throw resendError;
    }
    if (!data || !data.id) {
      throw new Error('Resend send failed: missing response id');
    }
    return { messageId: messageIdHeader || data.id, raw: data };
  }

  try {
    try {
      return await sendWithResend(mailOptions);
    } catch (error) {
      const canRetry = error && error.code === 'application_error' && error.response && (headers['In-Reply-To'] || headers.References);
      if (canRetry) {
        console.warn('[EMAIL] Resend replied with application_error for reply headers; retrying without In-Reply-To/References.');
        const fallbackOptions = { ...mailOptions, headers: { ...mailOptions.headers } };
        delete fallbackOptions.headers['In-Reply-To'];
        delete fallbackOptions.headers.References;
        if (Object.keys(fallbackOptions.headers).length === 0) {
          delete fallbackOptions.headers;
        }
        return await sendWithResend(fallbackOptions);
      }
      throw error;
    }
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
