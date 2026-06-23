// ============================================================
// server/emailService.js — FULL REPLACEMENT
// Fixes: Outlook-safe solid-color buttons (no gradients, no CSS
// that Outlook strips), adds return approval email + embeds the
// delivery challan as an HTML table inside both emails.
// ============================================================
const nodemailer = require('nodemailer')
require('dotenv').config()

function createTransporter() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.office365.com',
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
    tls: { ciphers: 'SSLv3' },
  })
}

async function sendHtml(toEmail, subject, htmlBody) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    console.warn('⚠️  Email not configured — skipping send to', toEmail)
    return { skipped: true }
  }
  const transporter = createTransporter()
  const info = await transporter.sendMail({
    from: `"${process.env.SMTP_FROM_NAME || 'AssetHub'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
    to:   toEmail,
    subject,
    html: htmlBody,
  })
  console.log(`✓ Email sent to ${toEmail} — MessageId: ${info.messageId}`)
  return info
}

// ── Reusable: build the delivery-challan-style asset table ───
function buildChallanTable(assets) {
  const fmt = v => Number(v||0).toLocaleString('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 })
  const rows = assets.map((a, i) => `
    <tr>
      <td style="padding:8px;border:1px solid #ddd;font-size:13px">${i+1}</td>
      <td style="padding:8px;border:1px solid #ddd;font-size:13px">${a.asset_tag}</td>
      <td style="padding:8px;border:1px solid #ddd;font-size:13px">${a.name}</td>
      <td style="padding:8px;border:1px solid #ddd;font-size:13px">${a.category || '—'}</td>
      <td style="padding:8px;border:1px solid #ddd;font-size:13px">${a.dept_name || '—'}</td>
      <td style="padding:8px;border:1px solid #ddd;font-size:13px">${fmt(a.value)}</td>
    </tr>`).join('')

  const total = assets.reduce((s,a) => s + Number(a.value||0), 0)

  return `
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:13px">
    <thead>
      <tr style="background:#f59e0b">
        <th style="padding:8px;border:1px solid #e5a000;text-align:left;color:#ffffff">#</th>
        <th style="padding:8px;border:1px solid #e5a000;text-align:left;color:#ffffff">Asset ID</th>
        <th style="padding:8px;border:1px solid #e5a000;text-align:left;color:#ffffff">Asset Name</th>
        <th style="padding:8px;border:1px solid #e5a000;text-align:left;color:#ffffff">Category</th>
        <th style="padding:8px;border:1px solid #e5a000;text-align:left;color:#ffffff">Department</th>
        <th style="padding:8px;border:1px solid #e5a000;text-align:left;color:#ffffff">Value</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr style="background:#f8f6f2">
        <td colspan="5" style="padding:8px;border:1px solid #ddd;text-align:right;font-weight:bold">Total Value</td>
        <td style="padding:8px;border:1px solid #ddd;font-weight:bold">${fmt(total)}</td>
      </tr>
    </tfoot>
  </table>`
}

// ── Outlook-safe button (VML fallback + bulletproof table button) ──
// Outlook on Windows uses Word's rendering engine, which strips
// gradients, border-radius, and box-shadow. This uses a solid
// background-color on a <table><td> — the only style Outlook
// reliably renders — plus a VML fallback for true bulletproofing.
function safeButton(label, url, color) {
  return `
  <!--[if mso]>
  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
    href="${url}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="12%" stroke="f" fillcolor="${color}">
    <w:anchorlock/>
    <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${label}</center>
  </v:roundrect>
  <![endif]-->
  <!--[if !mso]><!-- -->
  <table cellpadding="0" cellspacing="0" border="0" style="display:inline-block;margin:0 8px">
    <tr>
      <td align="center" bgcolor="${color}" style="border-radius:8px;">
        <a href="${url}" target="_blank" style="
          display:inline-block;
          padding:14px 36px;
          font-family:Arial,sans-serif;
          font-size:16px;
          font-weight:bold;
          color:#ffffff !important;
          text-decoration:none;
          border-radius:8px;
          background-color:${color};
          mso-hide:all;">
          ${label}
        </a>
      </td>
    </tr>
  </table>
  <!--<![endif]-->`
}

// ════════════════════════════════════════════════════════════
// TRANSFER APPROVAL EMAIL
// ════════════════════════════════════════════════════════════

function buildApprovalEmail({ transfer, fromPlant, toPlant, initiatedBy, assets, approveUrl, rejectUrl }) {
  const challanTable = buildChallanTable(assets)

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="font-family:Arial,sans-serif;background:#f8f6f2;padding:24px;color:#2e2e2e;margin:0">
  <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #eee">

    <div style="background-color:#f59e0b;padding:28px 32px">
      <h1 style="color:#ffffff;margin:0;font-size:22px;font-family:Arial,sans-serif">Asset Transfer Approval Request</h1>
      <p style="color:#ffffff;margin:6px 0 0;font-size:14px;font-family:Arial,sans-serif">
        Transfer ID: <strong>${transfer.transfer_code}</strong>
      </p>
    </div>

    <div style="padding:28px 32px">
      <p style="font-size:15px;margin:0 0 20px">
        <strong>${initiatedBy}</strong> has initiated an asset transfer that requires your approval.
      </p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr>
          <td style="padding:10px;background:#fef3c7;font-size:12px;color:#92400e;font-weight:bold;width:40%">FROM PLANT</td>
          <td style="padding:10px;background:#fef3c7;font-size:14px;font-weight:600">${fromPlant}</td>
        </tr>
        <tr>
          <td style="padding:10px;background:#f8f6f2;font-size:12px;color:#6b7280;font-weight:bold">TO PLANT</td>
          <td style="padding:10px;background:#f8f6f2;font-size:14px;font-weight:600">${toPlant}</td>
        </tr>
        <tr>
          <td style="padding:10px;background:#fef3c7;font-size:12px;color:#92400e;font-weight:bold">TRANSFER TYPE</td>
          <td style="padding:10px;background:#fef3c7;font-size:14px">${transfer.transfer_type}</td>
        </tr>
        <tr>
          <td style="padding:10px;background:#f8f6f2;font-size:12px;color:#6b7280;font-weight:bold">TOTAL ASSETS</td>
          <td style="padding:10px;background:#f8f6f2;font-size:14px;font-weight:600">${assets.length} asset(s)</td>
        </tr>
        ${transfer.notes ? `
        <tr>
          <td style="padding:10px;background:#fef3c7;font-size:12px;color:#92400e;font-weight:bold">NOTES</td>
          <td style="padding:10px;background:#fef3c7;font-size:14px">${transfer.notes}</td>
        </tr>` : ''}
      </table>

      <h3 style="font-size:14px;margin:0 0 12px;color:#2e2e2e">Assets Being Transferred</h3>
      ${challanTable}

      <table cellpadding="0" cellspacing="0" border="0" style="margin:32px auto;width:100%">
        <tr>
          <td align="center">
            <p style="font-size:14px;color:#6b7280;margin-bottom:20px">
              Please review and take action. This link expires in <strong>74 hours</strong>.
            </p>
          </td>
        </tr>
        <tr>
          <td align="center">
            ${safeButton('✓ APPROVE TRANSFER', approveUrl, '#16a34a')}
            ${safeButton('✗ REJECT TRANSFER', rejectUrl, '#dc2626')}
          </td>
        </tr>
      </table>

      <p style="font-size:12px;color:#9ca3af;text-align:center;margin-top:24px">
        This email was sent by AssetHub Asset Management System.<br/>
        If you did not expect this email, please ignore it.
      </p>
    </div>
  </div>
</body>
</html>`
}

// ════════════════════════════════════════════════════════════
// RETURN APPROVAL EMAIL (NEW)
// ════════════════════════════════════════════════════════════

function buildReturnApprovalEmail({ transferReturn, transfer, fromPlant, toPlant, returnedBy, assets, isFullReturn, approveUrl, rejectUrl }) {
  const challanTable = buildChallanTable(assets)
  const returnTypeLabel = isFullReturn ? 'FULL RETURN (closes transfer)' : 'PARTIAL RETURN'

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="font-family:Arial,sans-serif;background:#f8f6f2;padding:24px;color:#2e2e2e;margin:0">
  <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #eee">

    <div style="background-color:#0d9488;padding:28px 32px">
      <h1 style="color:#ffffff;margin:0;font-size:22px;font-family:Arial,sans-serif">Asset Return Approval Request</h1>
      <p style="color:#ffffff;margin:6px 0 0;font-size:14px;font-family:Arial,sans-serif">
        Return ID: <strong>${transferReturn.return_code}</strong> &nbsp;·&nbsp;
        Original Transfer: <strong>${transfer.transfer_code}</strong>
      </p>
    </div>

    <div style="padding:28px 32px">
      <p style="font-size:15px;margin:0 0 20px">
        <strong>${returnedBy}</strong> has initiated a return of assets that requires your approval.
      </p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr>
          <td style="padding:10px;background:#ccfbf1;font-size:12px;color:#0f766e;font-weight:bold;width:40%">RETURN TYPE</td>
          <td style="padding:10px;background:#ccfbf1;font-size:14px;font-weight:600">${returnTypeLabel}</td>
        </tr>
        <tr>
          <td style="padding:10px;background:#f8f6f2;font-size:12px;color:#6b7280;font-weight:bold">RETURNING FROM</td>
          <td style="padding:10px;background:#f8f6f2;font-size:14px;font-weight:600">${toPlant}</td>
        </tr>
        <tr>
          <td style="padding:10px;background:#ccfbf1;font-size:12px;color:#0f766e;font-weight:bold">RETURNING TO</td>
          <td style="padding:10px;background:#ccfbf1;font-size:14px;font-weight:600">${fromPlant}</td>
        </tr>
        <tr>
          <td style="padding:10px;background:#f8f6f2;font-size:12px;color:#6b7280;font-weight:bold">ASSETS IN THIS RETURN</td>
          <td style="padding:10px;background:#f8f6f2;font-size:14px;font-weight:600">${assets.length} asset(s)</td>
        </tr>
        ${transferReturn.notes ? `
        <tr>
          <td style="padding:10px;background:#ccfbf1;font-size:12px;color:#0f766e;font-weight:bold">NOTES</td>
          <td style="padding:10px;background:#ccfbf1;font-size:14px">${transferReturn.notes}</td>
        </tr>` : ''}
      </table>

      <h3 style="font-size:14px;margin:0 0 12px;color:#2e2e2e">Assets Being Returned</h3>
      ${challanTable}

      <table cellpadding="0" cellspacing="0" border="0" style="margin:32px auto;width:100%">
        <tr>
          <td align="center">
            <p style="font-size:14px;color:#6b7280;margin-bottom:20px">
              Please review and take action. This link expires in <strong>74 hours</strong>.
            </p>
          </td>
        </tr>
        <tr>
          <td align="center">
            ${safeButton('✓ APPROVE RETURN', approveUrl, '#16a34a')}
            ${safeButton('✗ REJECT RETURN', rejectUrl, '#dc2626')}
          </td>
        </tr>
      </table>

      <p style="font-size:12px;color:#9ca3af;text-align:center;margin-top:24px">
        This email was sent by AssetHub Asset Management System.<br/>
        If you did not expect this email, please ignore it.
      </p>
    </div>
  </div>
</body>
</html>`
}

// ── Approval result page (shown after clicking approve/reject) ──
function buildApprovalResultHtml(approved, code, reason, type = 'Transfer') {
  const color = approved ? '#16a34a' : '#dc2626'
  const icon  = approved ? '✓' : '✗'
  const title = approved ? `${type} Approved` : `${type} Rejected`
  const msg   = approved
    ? `${type} <strong>${code}</strong> has been approved successfully.`
    : `${type} <strong>${code}</strong> has been rejected.`

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><title>${title}</title></head>
<body style="font-family:Arial,sans-serif;background:#f8f6f2;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
  <div style="background:#fff;border-radius:16px;padding:48px 40px;text-align:center;max-width:480px;width:90%;border:1px solid #eee">
    <div style="width:72px;height:72px;border-radius:50%;background-color:${color};display:flex;align-items:center;justify-content:center;margin:0 auto 24px;font-size:36px;color:#fff;line-height:72px">
      ${icon}
    </div>
    <h1 style="color:#2e2e2e;font-size:24px;margin:0 0 12px">${title}</h1>
    <p style="color:#6b7280;font-size:15px;margin:0 0 24px">${msg}</p>
    ${reason ? `<p style="color:#6b7280;font-size:13px;background:#f8f6f2;padding:12px;border-radius:8px">Reason: ${reason}</p>` : ''}
    <p style="color:#9ca3af;font-size:13px;margin-top:24px">You can close this tab.</p>
  </div>
</body>
</html>`
}

module.exports = {
  sendHtml,
  buildApprovalEmail,
  buildReturnApprovalEmail,
  buildApprovalResultHtml,
  buildChallanTable,
}
