// Templating helper to generate the seizure notice HTML from dynamic fields.
// Uses strict HTML escaping and input validation to prevent XSS injection.

const ORGANIZATION_NAME = process.env.ORGANIZATION_NAME || 'Border Force';

// Escape HTML entities and dangerous characters; remove newlines from single-line fields
function escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\//g, '&#x2F;')
    .replace(/\n/g, ' ')
    .trim();
}

// Escape HTML but preserve newline structure for multi-line address fields
function escapeHtmlPreserveNewlines(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\//g, '&#x2F;')
    .trim();
}

/**
 * Generate the official notice HTML.
 * fields: {
 *   recipient_name: string,
 *   recipient_address: string[] (array of address lines),
 *   vehicle_vin: string,
 *   vehicle_description: string,
 *   date_of_notice: string (optional)
 * }
 */
function generateNoticeHtml(fields) {
  const recipientName = escapeHtml(fields.recipient_name || '');
  let recipientAddressHtml = '';
  if (Array.isArray(fields.recipient_address) && fields.recipient_address.length > 0) {
    recipientAddressHtml = fields.recipient_address
      .map(line => escapeHtmlPreserveNewlines(String(line)))
      .join('<br/>');
  }
  const vehicleVin = escapeHtml(fields.vehicle_vin || '');
  const vehicleDescription = escapeHtml(fields.vehicle_description || '');
  const dateOfNotice = escapeHtml(fields.date_of_notice || '[Date]');
  // optional logo URL (user-provided). Keep as-is if provided; else show generic mark.
  const logoUrlRaw = fields.logo_url || '';
  const logoUrl = typeof logoUrlRaw === 'string' ? logoUrlRaw.trim() : '';
  const logoAttr = logoUrl.replace(/"/g, '&quot;');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>NOTICE OF SEIZURE OF VEHICLE</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    @page { size: A4; margin: 0; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      min-height: 100%;
      background: #FFFFFF;
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #334155;
      font-size: 11pt;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    .page {
      box-sizing: border-box;
      width: 100%;
      min-height: 100vh;
      padding: 28px 28px 36px 28px;
      background: #FFFFFF;
      color-adjust: exact;
    }
    .sheet {
      min-height: calc(100vh - 80px);
      display: flex;
      flex-direction: column;
    }
    .letterhead {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 14px;
      margin-bottom: 20px;
      border-bottom: 1px solid #E6EEF6;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      flex: 1 1 auto;
    }
    .brand-logo {
      flex: 0 0 auto;
      width: 112px;
      min-width: 112px;
    }
    .brand-mark {
      width: 38px;
      height: 38px;
      border-radius: 8px;
      background: #0B1220;
      position: relative;
      flex: 0 0 auto;
    }
    .brand-mark:before,
    .brand-mark:after {
      content: '';
      position: absolute;
      background: rgba(255,255,255,0.92);
      border-radius: 2px;
    }
    .brand-mark:before {
      width: 18px;
      height: 2px;
      left: 12px;
      top: 15px;
    }
    .brand-mark:after {
      width: 18px;
      height: 2px;
      left: 12px;
      top: 25px;
    }
    .brand-copy h1 {
      margin: 0;
      font-size: 13pt;
      line-height: 1.18;
      color: #071126;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .brand-copy p {
      margin: 3px 0 0 0;
      font-size: 9pt;
      line-height: 1.25;
      color: #6B7280;
      letter-spacing: 0.02em;
      text-transform: none;
    }
    .brand-copy {
      flex: 1 1 auto;
      min-width: 0;
    }
    .meta {
      text-align: right;
      font-size: 9.5pt;
      line-height: 1.45;
      color: #6B7280;
    }
    .meta.meta-box {
      border: 1px solid #E6EEF6;
      padding: 10px 12px;
      border-radius: 6px;
      background: #FCFDFF;
      min-width: 180px;
      box-shadow: 0 1px 0 rgba(10,11,12,0.02);
    }
    .meta .label {
      display: block;
      font-size: 8.25pt;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #9AA6B2;
      margin-bottom: 4px;
    }
    .meta .value {
      color: #071126;
      font-weight: 700;
      font-size: 10pt;
    }
    .content {
      flex: 1;
    }
    .recipient-block {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      margin-bottom: 18px;
    }
    .recipient {
      max-width: 52%;
      font-size: 10.5pt;
      line-height: 1.7;
      color: #334155;
    }
    .recipient .label,
    .section-label {
      display: block;
      font-size: 8.5pt;
      line-height: 1.4;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #94A3B8;
      margin-bottom: 6px;
      font-weight: 700;
    }
    .recipient-name {
      font-size: 12pt;
      line-height: 1.35;
      color: #0F172A;
      font-weight: 700;
      margin-bottom: 6px;
    }
    .recipient-address {
      color: #475569;
    }
    .status-badge {
      align-self: flex-start;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border-radius: 999px;
      background: #ECFDF5;
      color: #166534;
      border: 1px solid #A7F3D0;
      font-size: 9.5pt;
      line-height: 1;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .status-badge:before {
      content: '';
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: #22C55E;
      display: inline-block;
      box-shadow: 0 0 0 4px rgba(34,197,94,0.12);
    }
    .title {
      margin: 4px 0 8px 0;
      text-align: center;
      font-size: 15pt;
      line-height: 1.22;
      color: #071126;
      font-weight: 800;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }
    .intro {
      margin: 0 0 12px 0;
      font-size: 10.5pt;
      line-height: 1.6;
      color: #334155;
    }
    .data-card {
      border: 1px solid #E9F0F6;
      border-radius: 6px;
      overflow: hidden;
      margin: 0 0 12px 0;
      background: #FFFFFF;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 10.5pt;
    }
    .data-table th,
    .data-table td {
      border: 1px solid #E2E8F0;
      padding: 9px 12px;
      text-align: left;
      vertical-align: top;
    }
    .data-table th {
      background: #FBFDFF;
      color: #071126;
      font-size: 9pt;
      line-height: 1.35;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-weight: 700;
    }
    .data-table td {
      color: #263238;
      line-height: 1.4;
      word-break: break-word;
    }
    .data-table td strong {
      color: #0F172A;
      font-weight: 700;
    }
    .body-copy {
      margin-top: 0;
    }
    .body-copy p {
      margin: 0 0 10px 0;
      font-size: 10.25pt;
      line-height: 1.5;
      color: #334155;
      text-align: justify;
    }
    .body-copy .subhead {
      margin: 12px 0 6px 0;
      font-size: 9.5pt;
      line-height: 1.4;
      color: #0F172A;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .info-callout {
      margin: 10px 0 0 0;
      padding: 10px 12px;
      border: 1px solid #E9F0F6;
      border-left: 4px solid #0B1220;
      border-radius: 6px;
      background: #FBFDFF;
      color: #263238;
      font-size: 9.75pt;
      line-height: 1.45;
    }
    .signature {
      margin-top: 14px;
    }
    .signature-farewell {
      margin: 0 0 10px 0;
      font-size: 10.5pt;
      color: #334155;
    }
    .signature-line {
      width: 220px;
      height: 1.8px;
      background: #071126;
      margin: 18px 0 6px 0;
    }
    .signature-title {
      font-size: 10pt;
      line-height: 1.4;
      color: #0F172A;
      font-weight: 700;
    }
    .signature-office {
      margin-top: 2px;
      font-size: 9pt;
      line-height: 1.45;
      color: #64748B;
      font-weight: 500;
    }
    .footer {
      margin-top: auto;
      padding-top: 12px;
      border-top: 1px dashed #E6EEF6;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 18px;
    }
    .footer-copy {
      font-size: 8.5pt;
      line-height: 1.45;
      color: #8B98A4;
      max-width: 70%;
    }
    .footer-copy strong {
      color: #0F172A;
    }
    .auth-area {
      display: flex;
      align-items: flex-end;
      gap: 18px;
      flex: 0 0 auto;
    }
    .barcode {
      display: flex;
      align-items: flex-end;
      gap: 2px;
      height: 46px;
      padding: 6px 8px;
      border: 1px solid #E6EEF6;
      border-radius: 4px;
      background: #FFFFFF;
    }
    .barcode span {
      width: 2px;
      background: #0F172A;
      display: inline-block;
    }
    .barcode span:nth-child(1) { height: 28px; }
    .barcode span:nth-child(2) { height: 42px; }
    .barcode span:nth-child(3) { height: 34px; }
    .barcode span:nth-child(4) { height: 48px; }
    .barcode span:nth-child(5) { height: 30px; }
    .barcode span:nth-child(6) { height: 50px; }
    .barcode span:nth-child(7) { height: 24px; }
    .barcode span:nth-child(8) { height: 46px; }
    .barcode span:nth-child(9) { height: 32px; }
    .barcode span:nth-child(10) { height: 44px; }
    .barcode span:nth-child(11) { height: 26px; }
    .barcode span:nth-child(12) { height: 52px; }
    .barcode-label {
      font-size: 8.5pt;
      line-height: 1.4;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #94A3B8;
      text-align: right;
    }
    .qr {
      width: 72px;
      height: 72px;
      border: 1px solid #CBD5E1;
      border-radius: 8px;
      background:
        linear-gradient(90deg, #0F172A 20%, transparent 20%) 0 0/18px 18px,
        linear-gradient(#0F172A 20%, transparent 20%) 0 0/18px 18px,
        #FFFFFF;
      position: relative;
      box-sizing: border-box;
      overflow: hidden;
    }
    .qr:before,
    .qr:after {
      content: '';
      position: absolute;
      border: 2px solid #0F172A;
      box-sizing: border-box;
    }
    .qr:before {
      width: 24px;
      height: 24px;
      left: 8px;
      top: 8px;
    }
    .qr:after {
      width: 18px;
      height: 18px;
      right: 10px;
      bottom: 10px;
    }
    p, .data-table, .signature { page-break-inside: avoid; }
  </style>
</head>
<body>
  <div class="page">
    <div class="sheet">
      <div class="letterhead">
        <div class="brand">
          ${logoUrl ? `<div class="brand-logo"><img src="${logoAttr}" alt="Logo" style="width:100%;height:30px;object-fit:contain;object-position:left center;display:block;"></div>` : '<div class="brand-mark" aria-hidden="true"></div>'}
        </div>
        <div class="meta">
          <span class="label">Date</span>
          <div class="value">${dateOfNotice}</div>
          <div style="height:8px;"></div>
          <span class="label">Document Reference ID</span>
          <div class="value">DOC-REF-2026-04A9</div>
        </div>
      </div>
        <div class="data-card">
          <div style="padding:12px 14px; border-bottom:1px solid #E9F0F6; background:#FBFDFF; font-weight:700; text-transform:uppercase; font-size:9pt; color:#071126;">What Was Held</div>
          <table class="data-table" role="presentation" cellpadding="0" cellspacing="0">
            <tbody>
              <tr>
                <td style="width:28%;">Bank cheque</td>
                <td>Bank cheque(s) — if applicable, include payee name, amount, date, cheque/account number and issuer. Keep cheque in a secure evidence bag and note any endorsements or accompanying documentation.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="body-copy">
      <div class="content">
            <div class="recipient-block">
          <div class="recipient">
            <span class="label">Addressee</span>
            <div class="recipient-name">${recipientName}</div>
            <div class="recipient-address">${recipientAddressHtml}</div>
          </div>
        </div>

        <div class="title">Notice of Seizure of Vehicle</div>

        <div class="intro">Dear Sir/Madam,</div>

        <div class="data-card">
          <table class="data-table" role="presentation" cellpadding="0" cellspacing="0">
            <thead>
              <tr>
                <th style="width:28%;">Field</th>
                <th style="width:72%;">Details</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>VIN Number</td>
                <td><strong>${vehicleVin}</strong></td>
              </tr>
              <tr>
                <td>Description</td>
                <td>${vehicleDescription}</td>
              </tr>
              <tr>
                <td>Date of Notice</td>
                <td>${dateOfNotice}</td>
              </tr>
              <tr>
                <td>Seizure Status</td>
                <td>Liable to Forfeiture</td>
              </tr>
              <tr>
                <td>Legal Basis</td>
                <td>Customs &amp; Excise Management Act 1979 (Section 139(1), 141(1)(a))</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="body-copy">
          <p>The vehicle detailed above is liable to forfeiture on the grounds that it was used for the carriage, handling, deposit, or concealment of things liable to forfeiture, contrary to section 141(1)(a) of the Customs and Excise Management Act 1979. It has been seized under section 139(1) of the said Act.</p>

          <p><strong>Your Right to Claim:</strong> If you claim that the item is not liable to forfeiture, you must, within one month of the date shown above, give notice in writing of your claim to the above office of ${ORGANIZATION_NAME}, stating your full name and address.</p>

          <p><strong>Items Taken:</strong> During the seizure, a bank cheque was taken and held as evidence. Details of the cheque, including payee name, amount, date, and cheque number, are recorded in the evidence register and will be retained pending the outcome of any claim or legal proceedings.</p>

          <p><strong>Application for Restoration:</strong> You may apply for the restoration of the vehicle. If your request is approved, the vehicle may be returned to you subject to the payment of a restoration penalty, alongside any outstanding duties, taxes, or storage fees. By applying for restoration and paying the penalty, you accept that the vehicle was legally seized. If no claim against forfeiture is made and no request for restoration is filed within the specified timeframe, the item will be deemed to have been duly condemned as forfeited.</p>

          <div class="subhead">Further Information</div>
          <p>Notice 12A provides important advice and information about what to do if you have had something seized by Border Force or HMRC. Visit <strong>www.gov.uk</strong> and search "Notice 12a".</p>

          <p>If you are in doubt about the effect of this Seizure Notice, you may consult the office named above or, if you prefer, consult a solicitor.</p>

          <div class="info-callout">This document has been formatted for print and archival use. The status marker and reference ID are provided for authenticity-style presentation only.</div>

          <div class="signature">
            <p class="signature-farewell">Yours faithfully,</p>
            <span class="signature-line"></span>
            <div class="signature-title">${ORGANIZATION_NAME} Officer</div>
            <div class="signature-office">Inland Border Command<br/>${ORGANIZATION_NAME}</div>
          </div>
        </div>
      </div>

      <div class="footer">
        <div class="footer-copy">
          <strong>Confidentiality Notice.</strong> This document and any attachments are intended solely for the named recipient and may contain confidential information. 123 Sovereign Way, London, United Kingdom.
        </div>
        <div class="auth-area">
          <div class="barcode" aria-hidden="true">
            <span></span><span></span><span></span><span></span><span></span><span></span>
            <span></span><span></span><span></span><span></span><span></span><span></span>
          </div>
          <div class="qr" aria-hidden="true"></div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { generateNoticeHtml };
