import fields from '../../shared/assetFields.json'

export const reportColumns = ['Sub Asset Code', 'Plant', 'Cost Center Desc.', 'Created Date', 'Last Updated', 'Asset Record ID', 'Record Version']
export const exportHeaders = [...fields.map(f => f.col), ...reportColumns]

function isoDate(value) {
  if (!value) return ''
  if (value instanceof Date) return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-')
  return String(value).slice(0, 10)
}

export function buildAssetExport(asset) {
  const row = {}
  for (const f of fields) {
    let value = asset[f.db] ?? ''
    if (f.type === 'date') value = isoDate(value)
    if (f.db === 'plant_id') value = asset.plant_code ?? ''
    if (f.db === 'dept_id') value = asset.dept_name ?? ''
    // Text cells keep codes and leading zeros intact in Excel.
    row[f.col] = value === '' ? '' : String(value)
  }
  return {
    ...row,
    'Sub Asset Code': `${asset.asset_code} ${asset.sub_sequence ?? 0}`,
    Plant: asset.plant_name ?? '',
    'Cost Center Desc.': asset.cost_center_description ?? '',
    'Created Date': isoDate(asset.created_at),
    'Last Updated': asset.updated_at ?? '',
    'Asset Record ID': String(asset.id),
    'Record Version': asset.record_version ?? '',
  }
}

export { fields }
