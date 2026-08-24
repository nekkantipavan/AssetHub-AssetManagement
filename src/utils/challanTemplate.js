// Shared delivery/return challan HTML — used by the real print flow
// (TransferDetail.jsx) and the live preview on the Challan Settings page,
// so the two can never drift apart.

// The visual template a designer can customise. These defaults reproduce the
// original standard challan look exactly, so a fresh install looks unchanged.
export const DEFAULT_CHALLAN_DESIGN = {
  accentColor: '#333333',   // frame + line colour
  headerBg:    '#f0f0f0',   // table header row background
  companyName: '',          // optional line above the title
  logoImage:   null,        // optional embedded logo (data URI), top-left
  signatureWidth:  200,     // signature width in px (60 to 400)
  signatureHeight: 80,      // signature height in px (30 to 200)
  labels: {
    billFrom:      'Bill From',
    consignee:     'Original for Consignee',
    billTo:        'Details of Buyer (Bill To)',
    shipTo:        'Details of Consignee (Ship To)',
    transport:     'Transport Vehicle NO:',
    placeOfSupply: 'Place of Supply:',
    amountWords:   'Rupees (in words):',
  },
  columns: {
    sno: 'S.No', assetNo: 'Asset No', description: 'Description',
    qty: 'Qty', uom: 'UOM', rate: 'Rate (INR)', amount: 'Amount (INR)',
  },
  show: {
    transportRow: true,   // the Transport Vehicle / Place of Supply row
    amountWords:  true,   // the "Amount (in words)" line above the footer note
  },
}

// Escape user-editable text so a stray "<" can't break (or inject into) the HTML.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]))

// Only emit an <img src> if it's a genuine embedded image data URI.
const safeImg = v => (typeof v === 'string' && /^data:image\/(png|jpe?g|gif|webp);base64,/.test(v)) ? v : null

// ── Number to words (Indian numbering system: Thousand / Lakh / Crore) ──
const ONES = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten',
  'Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
const TENS = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']
const two = n => n < 20 ? ONES[n] : (TENS[Math.floor(n/10)] + (n%10 ? ' ' + ONES[n%10] : ''))
const three = n => {
  const h = Math.floor(n/100), r = n%100
  return (h ? ONES[h] + ' Hundred' + (r ? ' ' : '') : '') + (r ? two(r) : '')
}
function intToWordsIndian(n) {
  if (n === 0) return 'Zero'
  let s = ''
  const crore = Math.floor(n/10000000); n %= 10000000
  const lakh  = Math.floor(n/100000);   n %= 100000
  const thou  = Math.floor(n/1000);     n %= 1000
  if (crore) s += intToWordsIndian(crore) + ' Crore '
  if (lakh)  s += two(lakh) + ' Lakh '
  if (thou)  s += two(thou) + ' Thousand '
  if (n)     s += three(n)
  return s.trim().replace(/\s+/g, ' ')
}
// "Sixty Two Thousand Seven Hundred Only" (with paise if present).
// The "Rupees" prefix lives in the line's label, so it isn't repeated here.
function amountInWords(value) {
  const num = Math.max(0, Number(value) || 0)
  let rupees = Math.floor(num)
  let paise  = Math.round((num - rupees) * 100)
  if (paise === 100) { rupees += 1; paise = 0 }
  let out = ''
  if (rupees > 0) out += intToWordsIndian(rupees)
  if (paise > 0)  out += (out ? ' and ' : '') + intToWordsIndian(paise) + ' Paise'
  if (!out) out = 'Zero'
  return out + ' Only'
}

export function buildChallanHtml({
  challanNo, date, fromName, fromLoc, toName, toLoc,
  transferType, items, approvedDate, label,
  footerNote = 'Material transferred internally for business use only. Not intended for sale.',
  signatoryLabel = 'AUTHORISED SIGNATORY',
  signatureImage = null,
  design = {},
}) {
  // Merge caller design over defaults (one level deep for the nested groups)
  const D = {
    ...DEFAULT_CHALLAN_DESIGN, ...design,
    labels:  { ...DEFAULT_CHALLAN_DESIGN.labels,  ...(design.labels  || {}) },
    columns: { ...DEFAULT_CHALLAN_DESIGN.columns, ...(design.columns || {}) },
    show:    { ...DEFAULT_CHALLAN_DESIGN.show,    ...(design.show     || {}) },
  }
  const accent = esc(D.accentColor || '#333333')
  const headBg = esc(D.headerBg    || '#f0f0f0')
  const logo   = safeImg(D.logoImage)
  const sig    = safeImg(signatureImage)

  const fmt = v => Number(v||0).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 })
  const totalVal = items.reduce((s, a) => s + Number(a.value||0), 0)
  const rows = items.map((a, i) => `
    <tr>
      <td>${i+1}</td>
      <td>${esc(a.asset_tag || '—')}</td>
      <td>${esc(a.name || '—')}</td>
      <td>1</td>
      <td>EA</td>
      <td>${fmt(a.value)}</td>
      <td>${fmt(a.value)}</td>
    </tr>`).join('')

  const transportRow = D.show.transportRow ? `
    <div class="box">
      <div class="box-title">${esc(D.labels.transport)}</div>
      <p>&nbsp;</p>
    </div>
    <div class="box">
      <div class="box-title">${esc(D.labels.placeOfSupply)}</div>
      <p>&nbsp;</p>
    </div>` : ''

  const sigHeight = Math.min(300, Math.max(30, parseInt(D.signatureHeight || 80, 10)))
  const sigWidth  = Math.min(500, Math.max(60, parseInt(D.signatureWidth  || 200, 10)))

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${esc(label)} - ${esc(challanNo)}</title>
<style>
  body{font-family:Arial,sans-serif;margin:0;padding:14px;color:#111}
  .challan{border:2px solid ${accent};max-width:900px;margin:0 auto}
  .head{position:relative;border-bottom:2px solid ${accent};padding:10px}
  .head h1{margin:0;padding:0;text-align:center;font-size:22px;font-weight:700}
  .head .company{text-align:center;font-size:13px;font-weight:600;margin-bottom:3px}
  .head .logo{position:absolute;left:12px;top:50%;transform:translateY(-50%);max-height:48px;max-width:120px}
  .grid{display:grid;grid-template-columns:1fr 1fr}
  .box{padding:10px;border-bottom:1px solid ${accent};min-height:100px}
  .box:nth-child(odd){border-right:1px solid ${accent}}
  .box-title{font-weight:700;font-size:13px;margin-bottom:6px}
  .box p{margin:2px 0;font-size:12px}
  table{width:100%;border-collapse:collapse;margin-top:0}
  th,td{border:1px solid ${accent};padding:7px 8px;font-size:12px;text-align:left}
  th{background:${headBg};font-weight:700}
  .total-row td{font-weight:700}
  .amt-words{padding:8px;font-size:12px;border-top:1px solid ${accent}}
  .note{padding:8px;font-size:11px;border-top:1px solid ${accent}}
  .sign{text-align:right;padding:16px 10px;font-weight:700;font-size:13px}
  .sign img{display:block;width:${sigWidth}px;height:${sigHeight}px;object-fit:contain;margin-left:auto;margin-bottom:4px}
  @media print{.noprint{display:none}}
</style></head>
<body>
<div class="noprint" style="margin-bottom:10px">
  <button onclick="window.print()">🖨 Print</button>
  <button onclick="window.close()">Close</button>
</div>
<div class="challan">
  <div class="head">
    ${logo ? `<img class="logo" src="${logo}"/>` : ''}
    ${D.companyName ? `<div class="company">${esc(D.companyName)}</div>` : ''}
    <h1>${esc(label)}</h1>
  </div>
  <div class="grid">
    <div class="box">
      <div class="box-title">${esc(D.labels.billFrom)}</div>
      <p>Location: ${esc(fromName||'—')}</p>
      <p>Address: ${esc(fromLoc||'—')}</p>
    </div>
    <div class="box">
      <div class="box-title">${esc(D.labels.consignee)}</div>
      <p>Challan No: ${esc(challanNo)}</p>
      <p>Date of Challan: ${esc(date)}</p>
      <p>Transfer Type: ${esc(transferType)}</p>
      <p>Approval Date: ${esc(approvedDate||'—')}</p>
    </div>
    <div class="box">
      <div class="box-title">${esc(D.labels.billTo)}</div>
      <p>Location: ${esc(toName||'—')}</p>
      <p>Address: ${esc(toLoc||'—')}</p>
    </div>
    <div class="box">
      <div class="box-title">${esc(D.labels.shipTo)}</div>
      <p>Location: ${esc(toName||'—')}</p>
      <p>Address: ${esc(toLoc||'—')}</p>
    </div>
    ${transportRow}
  </div>
  <table>
    <thead>
      <tr>
        <th>${esc(D.columns.sno)}</th><th>${esc(D.columns.assetNo)}</th><th>${esc(D.columns.description)}</th>
        <th>${esc(D.columns.qty)}</th><th>${esc(D.columns.uom)}</th><th>${esc(D.columns.rate)}</th><th>${esc(D.columns.amount)}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tbody>
      <tr class="total-row">
        <td colspan="6" style="text-align:right">Total</td>
        <td>${fmt(totalVal)}</td>
      </tr>
    </tbody>
  </table>
  ${D.show.amountWords ? `<div class="amt-words">${esc(D.labels.amountWords)} <strong>${esc(amountInWords(totalVal))}</strong></div>` : ''}
  <div class="note">${esc(footerNote)}</div>
  <div class="sign">
    ${sig ? `<img src="${sig}"/>` : ''}
    <div>${esc(signatoryLabel)}</div>
  </div>
</div>
</body></html>`
}
