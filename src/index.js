// Main Express application exposing the POST /send endpoint
// Receives recipient_email and html_content, converts HTML to A4 PDF and emails it.
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { generatePdfFromHtml } = require('./pdf');
const { sendMailWithAttachment } = require('./email');
const { generateNoticeHtml } = require('./template');
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

    // Generate the PDF buffer in memory
    let pdfBuffer;
    try {
      pdfBuffer = await generatePdfFromHtml(htmlToConvert);
    } catch (pdfErr) {
      console.error('PDF generation failed:', pdfErr);
      const message = pdfErr && pdfErr.message ? pdfErr.message : 'PDF generation failed';
      return res.status(500).json({ error: message });
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
      const info = await sendMailWithAttachment(recipientEmail, subject, coverHtml, pdfBuffer, 'notice.pdf');
      return res.json({ success: true, messageId: info && info.messageId });
    } catch (mailErr) {
      console.error('SMTP send failed:', mailErr);
      const message = mailErr && mailErr.message ? mailErr.message : 'SMTP send failed';
      return res.status(500).json({ error: message });
    }
  } catch (err) {
    console.error('Error in /send:', err);
    return res.status(500).json({ error: err && err.message ? err.message : 'Internal server error' });
  }
});

app.get('/', (req, res) => {
  res.send(`${ORGANIZATION_NAME} Mailing API is running. Use POST /send`);
});

app.get('/health', (req, res) => {
  return res.status(200).json({ status: 'healthy' });
});

app.listen(PORT, () => {
  console.log(`Automated Mailing API listening on port ${PORT}`);
});
