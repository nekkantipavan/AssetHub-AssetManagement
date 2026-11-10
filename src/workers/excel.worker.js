import * as XLSX from 'xlsx'
import { buildAssetExport, exportHeaders } from '../data/assetWorkbook'
const fmtDate = v => v ? new Date(v).toLocaleDateString('en-IN') : ''
  function transferWorkbook(filtered) {
    // Sheet 1: Transfers
    const transferRows = filtered.map(t => ({
      'Transfer Code':       t.transfer_code,
      'Type':                t.transfer_type,
      'From Plant':          t.from_plant_name || '',
      'To Plant':            t.to_plant_name || '',
      'Asset Count':         t.asset_count,
      'Status':              t.status,
      'Initiated By':        t.initiated_by_name || '',
      'Created Date':        fmtDate(t.created_at),
      'Expected Return':     fmtDate(t.expected_return_date),
      'Approved By':         t.approved_by_name || '',
      'Approved At':         fmtDate(t.approved_at),
      'Return Count':        t.return_count,
      'Notes':               t.notes || '',
    }))

    // Sheet 2: Transfer Assets (flat)
    const assetRows = []
    filtered.forEach(t => {
      t.items.forEach(item => {
        assetRows.push({
          'Transfer Code': t.transfer_code,
          'Transfer Type': t.transfer_type,
          'Transfer Status': t.status,
          'From Plant':    t.from_plant_name || '',
          'To Plant':      t.to_plant_name || '',
          'Asset Code':    item.asset_code || '',
          'Sub Asset Code':`${item.asset_code || ''} ${item.sub_sequence ?? 0}`,
          'Asset Name':    item.name,
          'Category':      item.category || '',
          'Asset Class':   item.asset_class || '',
          'Serial No.':    item.serial_number || '',
          'Value (₹)':     item.acquisition_value != null ? Number(item.acquisition_value) : '',
          'Department':    item.dept_name || '',
          'Assigned To':   item.assigned_employee || '',
          'Transfer Date': fmtDate(t.created_at),
        })
      })
    })

    // Sheet 3: Returns (flat)
    const returnRows = []
    filtered.forEach(t => {
      t.returns.forEach(r => {
        returnRows.push({
          'Transfer Code':   t.transfer_code,
          'Transfer Type':   t.transfer_type,
          'From Plant':      t.from_plant_name || '',
          'To Plant':        t.to_plant_name || '',
          'Return Code':     r.return_code,
          'Return Date':     fmtDate(r.return_date),
          'Returned By':     r.returned_by || '',
          'Assets Returned': r.returned_asset_count,
          'Approval Status': r.approval_status || r.status || '',
          'Approved By':     r.approved_by_name || '',
          'Approved At':     fmtDate(r.approved_at),
          'Notes':           r.notes || '',
        })
      })
    })

    const wb = XLSX.utils.book_new()

    const ws1 = XLSX.utils.json_to_sheet(transferRows)
    ws1['!cols'] = [{ wch:16 },{ wch:16 },{ wch:18 },{ wch:18 },{ wch:10 },{ wch:18 },{ wch:18 },{ wch:14 },{ wch:16 },{ wch:18 },{ wch:14 },{ wch:12 },{ wch:24 }]
    XLSX.utils.book_append_sheet(wb, ws1, 'Transfers')

    if (assetRows.length > 0) {
      const ws2 = XLSX.utils.json_to_sheet(assetRows)
      ws2['!cols'] = [{ wch:16 },{ wch:16 },{ wch:18 },{ wch:18 },{ wch:18 },{ wch:14 },{ wch:16 },{ wch:28 },{ wch:14 },{ wch:14 },{ wch:18 },{ wch:12 },{ wch:18 },{ wch:22 },{ wch:14 }]
      XLSX.utils.book_append_sheet(wb, ws2, 'Transfer Assets')
    }

    if (returnRows.length > 0) {
      const ws3 = XLSX.utils.json_to_sheet(returnRows)
      ws3['!cols'] = [{ wch:16 },{ wch:16 },{ wch:18 },{ wch:18 },{ wch:16 },{ wch:14 },{ wch:18 },{ wch:14 },{ wch:16 },{ wch:18 },{ wch:14 },{ wch:24 }]
      XLSX.utils.book_append_sheet(wb, ws3, 'Returns')
    }

    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  }


self.onmessage = event => {
  try {
    const { kind, rows } = event.data
    let buffer
    if (kind === 'transfers') buffer = transferWorkbook(rows)
    else {
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.json_to_sheet(rows.map(buildAssetExport), { header: exportHeaders })
      ws['!cols'] = exportHeaders.map(h => ({ wch: Math.max(18,h.length+2) }))
      XLSX.utils.book_append_sheet(wb,ws,'Asset Report')
      buffer = XLSX.write(wb,{type:'array',bookType:'xlsx'})
    }
    self.postMessage({ buffer }, [buffer])
  } catch (e) { self.postMessage({ error: e.message }) }
}
