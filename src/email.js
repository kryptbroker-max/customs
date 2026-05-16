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
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const secure = process.env.SMTP_SECURE === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass || !process.env.FROM_EMAIL) {
    throw new Error('SMTP configuration incomplete. Check environment variables.');
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
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

  // returns the result of transporter.sendMail
  return transporter.sendMail(mailOptions);
}

module.exports = { sendMailWithAttachment };
