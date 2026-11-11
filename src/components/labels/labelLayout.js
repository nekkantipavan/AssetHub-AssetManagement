export const LABEL_TEMPLATES = {
  standard: { name: 'Everyday asset', description: 'QR + barcode with essential details', width: 50, height: 25, canvasWidth: 220, canvasHeight: 110, fields: ['showCompany', 'showQr', 'showBarcode', 'showSerial', 'showDeptPlant', 'showCategory', 'showAssigned'] },
  'compact-qr': { name: 'Compact QR', description: 'A square tag for smaller equipment', width: 35, height: 35, canvasWidth: 140, canvasHeight: 140, fields: ['showCompany', 'showQr'] },
  industrial: { name: 'Equipment plate', description: 'More room for location and asset details', width: 75, height: 50, canvasWidth: 280, canvasHeight: 185, fields: ['showCompany', 'showQr', 'showBarcode', 'showSerial', 'showDeptPlant', 'showCategory', 'showAssigned'] },
  'barcode-only': { name: 'Barcode strip', description: 'Code 128 for handheld scanners', width: 50, height: 25, canvasWidth: 200, canvasHeight: 100, fields: ['showCompany', 'showBarcode', 'showSerial'] },
}

export const LABEL_FIELDS = {
  showCompany: 'Organization name',
  showQr: 'QR code',
  showBarcode: 'Code 128 barcode',
  showSerial: 'Serial number',
  showDeptPlant: 'Plant / department',
  showCategory: 'Category',
  showAssigned: 'Assigned person',
}

export const DEFAULT_LABEL_OPTIONS = {
  showCompany: true, showQr: true, showBarcode: true, showSerial: true,
  showDeptPlant: true, showCategory: true, showAssigned: false,
}

export function sheetLayout(template, margin, gap) {
  const { width, height } = LABEL_TEMPLATES[template]
  const columns = Math.max(1, Math.floor((210 - margin * 2 + gap) / (width + gap)))
  const rows = Math.max(1, Math.floor((297 - margin * 2 + gap) / (height + gap)))
  return { columns, rows, capacity: columns * rows }
}

export function labelCode(asset) {
  return String(asset.asset_code || 'N/A') + (Number(asset.sub_sequence) > 0 ? '-' + asset.sub_sequence : '')
}

export function getLabelPage(queue, skip, page, capacity) {
  const start = page * capacity
  const end = start + capacity
  const slots = []
  let offset = skip
  for (let index = start; index < Math.min(skip, end); index++) slots.push(null)
  for (const asset of queue) {
    const from = Math.max(start, offset)
    const to = Math.min(end, offset + asset.printQty)
    for (let index = from; index < to; index++) slots.push(asset)
    offset += asset.printQty
    if (offset >= end) break
  }
  return slots
}
