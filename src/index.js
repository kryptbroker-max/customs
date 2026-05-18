// Main Express application exposing the POST /send endpoint
// Receives recipient_email and html_content, converts HTML to A4 PDF and emails it.
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { generatePdfFromHtml } = require('./pdf');
const { sendMailWithAttachment, sendMail } = require('./email');
const { generateNoticeHtml } = require('./template');
const {
  connectToMongo,
  listMessages,
  getMessageById,
  findMessageByMessageId,
  addInboundMessage,
  addOutboundMessage,
  addReply
} = require('./db');
const fs = require('fs');
const path = require('path');

const app = express();

// Security and parsing middleware with relaxed CSP for inline scripts
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    }
  }
}));
app.use(express.json({ limit: '2mb' }));

// Trust proxy headers from Render's load balancer for accurate rate limiting
app.set('trust proxy', 1);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/img', express.static(path.join(__dirname, '..', 'img')));

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const ORGANIZATION_NAME = process.env.ORGANIZATION_NAME || 'Border Force';
const CUSTOM_DOMAIN = process.env.CUSTOM_DOMAIN || 'ukborderforce.site';
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || `https://${CUSTOM_DOMAIN}`).replace(/\/$/, '');
const LOGO_PUBLIC_URL = process.env.LOGO_PUBLIC_URL || `${PUBLIC_BASE_URL}/img/logo.png`;
const INBOUND_WEBHOOK_SECRET = process.env.INBOUND_WEBHOOK_SECRET || '';

/**
 * Rate limiter to prevent abuse of the /send endpoint.
 * Limits to 5 requests per minute per IP.
 */
const sendLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // limit each IP to 5 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

function requireAdminAuth(req, res, next) {
  return next();
}

function normalizeEmailAddress(input) {
  if (!input || typeof input !== 'string') return '';
  const match = input.match(/<([^>]+)>/);
  if (match && match[1]) return match[1].trim();
  return input.trim();
}

function parseInboundPayload(body) {
  const payload = body || {};
  const data = payload.data || payload.email || payload;
  const headers = data.headers || payload.headers || {};

  const messageId =
    data.message_id ||
    data.messageId ||
    headers['message-id'] ||
    headers['Message-Id'] ||
    headers['Message-ID'] ||
    '';

  const inReplyTo =
    data.in_reply_to ||
    data.inReplyTo ||
    headers['in-reply-to'] ||
    headers['In-Reply-To'] ||
    '';

  const references =
    data.references ||
    headers.references ||
    headers.References ||
    '';

  // Extract attachments from webhook payload
  const attachments = [];
  if (Array.isArray(data.attachments)) {
    data.attachments.forEach(att => {
      if (att.filename && att.content) {
        attachments.push({
          filename: att.filename,
          contentType: att.contentType || 'application/octet-stream',
          content: att.content, // base64 content from Resend
          size: att.size || null
        });
      }
    });
  }

  return {
    from: data.from || data.sender || payload.from || '',
    to: data.to || payload.to || '',
    subject: data.subject || payload.subject || '(no subject)',
    text: String(data.text || data.text_body || data.plain_text || data.plain || payload.text || payload.text_body || '').trim(),
    html: String(data.html || data.html_body || payload.html || payload.html_body || '').trim(),
    messageId: messageId ? String(messageId).trim().replace(/^<|>$/g, '') : '',
    inReplyTo: inReplyTo ? String(inReplyTo).trim().replace(/^<|>$/g, '') : '',
    references: references ? String(references).trim().replace(/^<|>$/g, '') : '',
    attachments: attachments,
    receivedAt: new Date().toISOString(),
    raw: payload
  };
}

/**
 * POST /send
 * Body may include either:
 * - recipient_email + html_content, or
 * - recipient_email + templated notice fields
 * - Validates inputs
 * - Converts the provided HTML to a PDF buffer
 * - Sends a short cover email with the PDF attached
 */
app.post('/send', sendLimiter, async (req, res) => {
  try {
    const {
      recipient_email: recipientEmail,
      html_content: htmlContent,
      recipient_name,
      recipient_address,
      vehicle_vin,
      vehicle_description,
      date_of_notice
    } = req.body || {};

    // Basic validation: ensure recipientEmail is present and looks like an email
    if (!recipientEmail || typeof recipientEmail !== 'string') {
      return res.status(400).json({ error: 'recipient_email is required and must be a string' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipientEmail)) {
      return res.status(400).json({ error: 'recipient_email must be a valid email address' });
    }

    const hasRawHtml = typeof htmlContent === 'string' && htmlContent.trim().length > 0;
    const hasTemplateFields =
      typeof recipient_name === 'string' && recipient_name.trim().length > 0 &&
      Array.isArray(recipient_address) &&
      recipient_address.length > 0 &&
      recipient_address.every(line => typeof line === 'string' && line.trim().length > 0) &&
      typeof vehicle_vin === 'string' && vehicle_vin.trim().length > 0 &&
      typeof vehicle_description === 'string' && vehicle_description.trim().length > 0;

    if (!hasRawHtml && !hasTemplateFields) {
      return res.status(400).json({
        error: 'Provide either html_content or the full templated notice fields (recipient_name, recipient_address, vehicle_vin, vehicle_description).'
      });
    }

    let htmlToConvert = hasRawHtml
      ? htmlContent
      : generateNoticeHtml({
          recipient_name,
          recipient_address,
          vehicle_vin,
          vehicle_description,
          date_of_notice
        });

    // Try to find a local logo image in ./img for both PDF and email cover
    let logoDataUri = null;
    let logoBuffer = null;
    let logoMimeType = null;
    try {
      const imgDir = path.resolve(__dirname, '..', 'img');
      if (fs.existsSync(imgDir) && fs.statSync(imgDir).isDirectory()) {
        const candidates = ['logo.png', 'logo.jpg', 'logo.jpeg', 'logo.svg', 'img_logo.svg', 'brand.png', 'brand.jpg'];
        for (const name of candidates) {
          const p = path.join(imgDir, name);
          if (fs.existsSync(p) && fs.statSync(p).isFile()) {
            const ext = path.extname(p).toLowerCase().replace('.', '');
            logoBuffer = fs.readFileSync(p);
            if (ext === 'jpg' || ext === 'jpeg') logoMimeType = 'image/jpeg';
            else if (ext === 'png') logoMimeType = 'image/png';
            else if (ext === 'svg') logoMimeType = 'image/svg+xml';
            // for PDF, still need data-URI
            logoDataUri = `data:${logoMimeType};base64,${logoBuffer.toString('base64')}`;
            console.log(`✓ Logo found: ${name} (${logoMimeType})`);
            break;
          }
        }
      }
    } catch (err) {
      console.error('Logo detection error:', err);
    }
    // If we're using the templated generator (not raw HTML), attach the local logo data URI
    if (!hasRawHtml && logoDataUri) {
      htmlToConvert = generateNoticeHtml({
        recipient_name,
        recipient_address,
        vehicle_vin,
        vehicle_description,
        date_of_notice,
        logo_url: logoDataUri
      });
    }

    console.log(`Starting send for ${recipientEmail}`);

    // Generate the PDF buffer in memory
    let pdfBuffer;
    try {
      const pdfStart = Date.now();
      pdfBuffer = await generatePdfFromHtml(htmlToConvert);
      console.log(`PDF generated in ${Date.now() - pdfStart}ms`);
    } catch (pdfErr) {
      console.error('PDF generation failed:', pdfErr);
      const message = pdfErr && pdfErr.message ? pdfErr.message : 'PDF generation failed';
      return res.status(500).json({ error: message, stage: 'pdf-generation' });
    }

    const escapeHtml = value => String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    // Build logo HTML for cover using a public image URL so the image can
    // render in the message body without being sent as a separate attachment.
    let coverLogoHtml = '';
    if (LOGO_PUBLIC_URL) {
      coverLogoHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="vertical-align:middle; padding:0; padding-right:16px; width:auto;">
            <img src="${escapeHtml(LOGO_PUBLIC_URL)}" alt="Company" style="display:block; width:110px; height:auto; max-width:220px; border:none; margin:0; padding:0;" />
          </td>
          <td style="vertical-align:middle; text-align:right; color:#64748B; font-size:11px; line-height:1.4; padding:0;">
            <div style="font-weight:600; color:#334155; font-size:12px;">Secure Delivery Notice</div>
            <div style="margin-top:2px;">Reference BF-2026-0415-09</div>
          </td>
        </tr>
      </table>`;
    } else {
      coverLogoHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="vertical-align:middle; padding:0; padding-right:12px; width:auto;">
            <div style="width:40px; height:40px; border-radius:8px; background:#0F172A; display:block; flex-shrink:0;"></div>
          </td>
          <td style="vertical-align:middle; padding:0; padding-right:16px;">
            <div style="font-size:13px; line-height:1.1; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#0F172A;">${ORGANIZATION_NAME}</div>
            <div style="margin-top:2px; font-size:10px; line-height:1.1; color:#64748B;">Official Notice</div>
          </td>
          <td style="vertical-align:middle; text-align:right; color:#64748B; font-size:11px; line-height:1.4; padding:0;">
            <div style="font-weight:600; color:#334155; font-size:12px;">Secure Delivery Notice</div>
            <div style="margin-top:2px;">Reference BF-2026-0415-09</div>
          </td>
        </tr>
      </table>`;
    }

    // Premium email template with inline CSS for broad client compatibility
    const coverHtml = `
      <div style="margin:0; padding:0; background-color:#FFFFFF;">
        <div style="max-width:100%; margin:0 auto; padding:0; font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#334155;">
          <div style="background:#FFFFFF; overflow:hidden;">
            <div style="height:3px; background:#0F172A;"></div>
            <div style="padding:16px 24px 12px 24px;">
              ${coverLogoHtml}
            </div>

            <div style="padding:16px 24px;">
              <h1 style="margin:0 0 8px 0; font-size:20px; line-height:1.3; color:#0F172A; font-weight:700;">Official Notice</h1>
              <p style="margin:0 0 12px 0; font-size:13px; line-height:1.6; color:#334155;">Dear Sir/Madam,</p>
              <p style="margin:0 0 16px 0; font-size:13px; line-height:1.6; color:#334155;">Please find attached the formal vehicle notice from ${ORGANIZATION_NAME}. The document contains the full record of the matter and instructions for action.</p>
            </div>

            <div style="margin:0; border-top:1px solid #E2E8F0; background:#F9FAFB;">
              <div style="padding:12px 24px;">
                <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#64748B; margin-bottom:8px; font-weight:600;">Vehicle Details</div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:12px;">
                  <tr>
                    <td style="width:33%; vertical-align:top; padding-right:12px; padding-bottom:8px;">
                      <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.08em; color:#94A3B8; margin-bottom:3px;">VIN</div>
                      <div style="font-weight:600; color:#0F172A; word-break:break-word;">${escapeHtml(vehicle_vin)}</div>
                    </td>
                    <td style="width:33%; vertical-align:top; padding:0 12px; padding-bottom:8px;">
                      <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.08em; color:#94A3B8; margin-bottom:3px;">Date</div>
                      <div style="font-weight:600; color:#0F172A;">${escapeHtml(date_of_notice)}</div>
                    </td>
                    <td style="width:34%; vertical-align:top; padding-left:12px; padding-bottom:8px;">
                      <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.08em; color:#94A3B8; margin-bottom:3px;">Description</div>
                      <div style="font-weight:600; color:#0F172A;">${escapeHtml(vehicle_description)}</div>
                    </td>
                  </tr>
                </table>
              </div>
            </div>

            <div style="margin:0; border-top:1px solid #E2E8F0; background:#F9FAFB;">
              <div style="padding:12px 24px;">
                <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#64748B; margin-bottom:8px; font-weight:600;">Items Seized</div>
                <div style="font-size:12px; line-height:1.5; color:#334155;">
                  <div style="margin-bottom:4px;"><strong style="color:#0F172A;">Bank Cheque</strong></div>
                  <div style="font-size:11px; color:#64748B;">Bank cheque seized and held as evidence. Documented and retained per established procedures.</div>
                </div>
              </div>
            </div>

            <div style="padding:12px 24px;">
              <div style="background:#FBF5E6; padding:10px 12px; border-left:3px solid #0F172A; margin-bottom:12px;">
                <div style="font-size:12px; line-height:1.5; color:#334155;"><strong style="color:#0F172A;">Action required:</strong> Review the attached document and retain for your records.</div>
              </div>

              <p style="margin:0 0 6px 0; font-size:12px; line-height:1.5; color:#334155;">Yours faithfully,</p>
              <p style="margin:0 0 12px 0; font-size:11px; line-height:1.5; color:#64748B;">${ORGANIZATION_NAME} Officer<br/>Inland Border Command<br/>${CUSTOM_DOMAIN}</p>
            </div>

            <div style="padding:8px 24px 12px 24px; text-align:center; font-size:10px; line-height:1.4; color:#94A3B8; border-top:1px solid #E2E8F0;">
              <div style="margin-bottom:4px;">123 Sovereign Way, London, United Kingdom</div>
              <div>Confidentiality Notice: For named recipient only.</div>
            </div>
          </div>
        </div>
      </div>
    `;

    const subject = `Official Notice - ${ORGANIZATION_NAME}`;

    // Send the email with the PDF attachment.
    try {
      if (!logoDataUri) {
        console.log('⚠ No logo found - using fallback branding');
      }
      const mailStart = Date.now();
      const info = await sendMailWithAttachment(recipientEmail, subject, coverHtml, pdfBuffer, 'notice.pdf');
      await addOutboundMessage({
        threadId: info && info.messageId,
        from: process.env.FROM_EMAIL || 'Border Force <customs@ukborderforce.site>',
        to: recipientEmail,
        subject,
        text: coverHtml.replace(/<[^>]+>/g, '').slice(0, 1000),
        html: coverHtml,
        messageId: info && info.messageId,
        attachments: [
          {
            filename: 'notice.pdf',
            contentType: 'application/pdf',
            size: Buffer.byteLength(pdfBuffer)
          }
        ],
        sentAt: new Date().toISOString(),
        raw: {
          recipientEmail,
          subject,
          hasAttachment: true
        }
      });
      console.log(`Email sent in ${Date.now() - mailStart}ms`);
      return res.json({ success: true, messageId: info && info.messageId });
    } catch (mailErr) {
      console.error('SMTP send failed:', {
        message: mailErr && mailErr.message ? mailErr.message : 'SMTP send failed',
        code: mailErr && mailErr.code ? mailErr.code : undefined,
        stage: mailErr && mailErr.stage ? mailErr.stage : undefined,
        responseCode: mailErr && mailErr.responseCode ? mailErr.responseCode : undefined,
        command: mailErr && mailErr.command ? mailErr.command : undefined
      });
      const message = mailErr && mailErr.message ? mailErr.message : 'SMTP send failed';
      return res.status(500).json({
        error: message,
        stage: mailErr && mailErr.stage ? mailErr.stage : 'smtp-send',
        code: mailErr && mailErr.code ? mailErr.code : undefined,
        responseCode: mailErr && mailErr.responseCode ? mailErr.responseCode : undefined,
        command: mailErr && mailErr.command ? mailErr.command : undefined
      });
    }
  } catch (err) {
    console.error('Error in /send:', {
      message: err && err.message ? err.message : 'Internal server error',
      code: err && err.code ? err.code : undefined,
      stage: err && err.stage ? err.stage : undefined
    });
    return res.status(500).json({
      error: err && err.message ? err.message : 'Internal server error',
      stage: err && err.stage ? err.stage : 'request'
    });
  }
});

app.post('/inbound/email', async (req, res) => {
  try {
    if (INBOUND_WEBHOOK_SECRET) {
      const providedSecret = (req.get('x-webhook-secret') || req.get('x-resend-signature') || req.get('x-resend-webhook-secret') || '').trim();
      if (!providedSecret || providedSecret !== INBOUND_WEBHOOK_SECRET) {
        console.warn('Inbound webhook secret mismatch; provided headers:', {
          'x-webhook-secret': req.get('x-webhook-secret'),
          'x-resend-signature': req.get('x-resend-signature')
        });
        return res.status(401).json({ error: 'Invalid webhook secret' });
      }
    }

    const inbound = parseInboundPayload(req.body);
    
    // Log received message details for debugging
    console.log('[INBOUND] Received email:', {
      from: inbound.from,
      to: inbound.to,
      subject: inbound.subject,
      hasText: inbound.text.length > 0,
      textLength: inbound.text.length,
      textPreview: inbound.text.substring(0, 100),
      hasHtml: inbound.html.length > 0,
      messageId: inbound.messageId,
      inReplyTo: inbound.inReplyTo
    });

    if (!inbound.from) {
      return res.status(400).json({ error: 'Inbound payload is missing sender information.' });
    }

    const repliedToMessage = inbound.inReplyTo ? await findMessageByMessageId(inbound.inReplyTo) : null;
    if (repliedToMessage) {
      inbound.threadId = repliedToMessage.threadId || repliedToMessage.id || repliedToMessage.messageId;
      inbound.parentId = repliedToMessage.id;
      console.log('[INBOUND] Linked to thread:', inbound.threadId);
    }

    const saved = await addInboundMessage(inbound);
    return res.status(200).json({ success: true, id: saved.id });
  } catch (error) {
    console.error('[INBOUND] Error processing email:', error);
    return res.status(500).json({ error: error && error.message ? error.message : 'Failed to process inbound email' });
  }
});

app.get('/admin', (req, res) => {
  res.sendFile(path.resolve(__dirname, '..', 'public', 'admin.html'));
});

app.get('/admin/api/messages', requireAdminAuth, async (req, res) => {
  const messages = (await listMessages()).map(message => ({
    id: message.id,
    threadId: message.threadId,
    parentId: message.parentId || null,
    direction: message.direction,
    messageId: message.messageId || '',
    inReplyTo: message.inReplyTo || '',
    references: message.references || '',
    from: message.from,
    to: message.to,
    subject: message.subject,
    textPreview: (message.text || '').slice(0, 180),
    receivedAt: message.receivedAt,
    replyCount: Array.isArray(message.replies) ? message.replies.length : 0
  }));

  return res.json({ messages });
});

app.get('/admin/api/messages/:id', requireAdminAuth, async (req, res) => {
  const message = await getMessageById(req.params.id);
  if (!message) return res.status(404).json({ error: 'Message not found' });
  
  // Prepare response with attachments metadata (without base64 content to reduce payload)
  const responseMessage = {
    ...message,
    attachments: (message.attachments || []).map(att => ({
      filename: att.filename,
      contentType: att.contentType,
      size: att.size,
      hasContent: !!att.content
    }))
  };
  
  return res.json({ message: responseMessage });
});

app.post('/admin/api/messages/:id/reply', requireAdminAuth, async (req, res) => {
  try {
    const message = await getMessageById(req.params.id);
    if (!message) return res.status(404).json({ error: 'Message not found' });

    const bodyText = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    const bodyHtml = typeof req.body?.html === 'string' ? req.body.html.trim() : '';
    if (!bodyText && !bodyHtml) {
      return res.status(400).json({ error: 'Provide text or html for the reply body.' });
    }

    // Determine recipient based on message direction:
    // - If replying to outbound: send to the original recipient (message.to)
    // - If replying to inbound: send to the original sender (message.from)
    const toEmail = normalizeEmailAddress(
      message.direction === 'outbound' ? message.to : message.from
    );
    if (!toEmail) {
      return res.status(400).json({ error: 'Unable to resolve recipient email. Message may be malformed.' });
    }

    const defaultSubject = message.subject.toLowerCase().startsWith('re:')
      ? message.subject
      : `Re: ${message.subject}`;
    const subject = typeof req.body?.subject === 'string' && req.body.subject.trim()
      ? req.body.subject.trim()
      : defaultSubject;

    const html = bodyHtml || `<div style="white-space:pre-wrap;">${bodyText.replace(/[&<>\"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[c]))}</div>`;
    const text = bodyText || bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    const references = [message.references, message.messageId].filter(Boolean).join(' ').trim();

    console.log('[REPLY] Sending reply:', {
      messageId: message.id,
      messageDirection: message.direction,
      originalMessageId: message.messageId,
      toEmail,
      subject: subject.substring(0, 60),
      inReplyTo: message.messageId,
      references: references || '(none)'
    });

    const sent = await sendMail({
      to: toEmail,
      subject,
      html,
      text,
      inReplyTo: message.messageId || undefined,
      references: references || undefined
    });

    await addOutboundMessage({
      threadId: message.threadId || message.id,
      from: process.env.FROM_EMAIL || 'Border Force <customs@ukborderforce.site>',
      to: toEmail,
      subject,
      text,
      html,
      messageId: sent.messageId,
      inReplyTo: message.messageId || '',
      references: references || '',
      sentAt: new Date().toISOString(),
      raw: {
        source: 'admin-reply',
        parentMessageId: message.id
      }
    });

    const savedReply = await addReply(message.id, {
      to: toEmail,
      subject,
      text,
      html,
      messageId: sent.messageId
    });

    return res.json({ success: true, messageId: sent.messageId, reply: savedReply });
  } catch (error) {
    return res.status(500).json({ error: error && error.message ? error.message : 'Failed to send reply' });
  }
});

app.get('/', (req, res) => {
  res.send(`${ORGANIZATION_NAME} Mailing API is running. Use POST /send`);
});

app.get('/health', (req, res) => {
  return res.status(200).json({ status: 'healthy' });
});

// Initialize database and start server
async function startServer() {
  try {
    await connectToMongo();
  } catch (err) {
    console.error('Failed to initialize database:', err.message);
    // Continue with file-based storage as fallback
  }

  app.listen(PORT, () => {
    console.log(`Automated Mailing API listening on port ${PORT}`);
  });
}

startServer();
