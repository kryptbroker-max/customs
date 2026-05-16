// Email sending module using Nodemailer
// Exports a function that sends an email with a PDF Buffer attachment.
const nodemailer = require('nodemailer');
const { URL } = require('url');

// Transporter is created lazily on first use so this module is easy to require.
let transporter;

/**
 * Initialize and cache the Nodemailer transporter using environment variables.
 * Expected env:
 *  - SMTP_HOST
 *  - SMTP_PORT
 *  - SMTP_SECURE (true/false)
 *  - SMTP_USER
 *  - SMTP_PASS
 *  - FROM_EMAIL
 */
function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = 465;
  const secure = true;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass || !process.env.FROM_EMAIL) {
    throw new Error('SMTP configuration incomplete. Check environment variables.');
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    pool: true,
    maxConnections: 1,
    maxMessages: 20,
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 45000
  });

  return transporter;
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

  const transporter = getTransporter();

  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to: recipientEmail,
    subject,
    // Provide both text and html fallback. Keep the email professional and concise.
    text: htmlBody.replace(/<[^>]+>/g, '').slice(0, 1000),
    html: htmlBody,
    attachments: [
      {
        filename,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }
    ]
  };

  try {
    // returns the result of transporter.sendMail
    return await transporter.sendMail(mailOptions);
  } catch (error) {
    const wrapped = new Error(error && error.message ? `SMTP send failed: ${error.message}` : 'SMTP send failed');
    wrapped.code = error && error.code ? error.code : 'SMTP_SEND_FAILED';
    wrapped.stage = 'smtp-send';
    wrapped.responseCode = error && error.responseCode ? error.responseCode : undefined;
    wrapped.command = error && error.command ? error.command : undefined;
    wrapped.response = error && error.response ? error.response : undefined;
    throw wrapped;
  }
}

module.exports = { sendMailWithAttachment };
