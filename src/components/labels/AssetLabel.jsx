import BarcodeRenderer from './BarcodeRenderer'
import QrCodeRenderer from './QrCodeRenderer'

export default function AssetLabel({
  asset,
  template = 'standard',
  options = {
    showCompany: true,
    companyName: 'ASSET MANAGEMENT',
    showBarcode: true,
    showQr: true,
    showSerial: true,
    showDeptPlant: true,
    showAssigned: false,
    showCategory: true,
  },
  qrValueType = 'code', // 'code' | 'url' | 'json'
}) {
  if (!asset) return null

  const assetCode = asset.asset_code || 'N/A'
  const subCode = asset.sub_sequence && Number(asset.sub_sequence) > 0 ? `-${asset.sub_sequence}` : ''
  const fullCode = `${assetCode}${subCode}`
  const assetName = asset.name || asset.description || 'Asset Item'
  const serialNo = asset.serial_number || '—'
  const plantName = asset.plant_name || asset.plant_code || ''
  const deptName = asset.dept_name || ''
  const category = asset.category || ''
  const assigned = asset.assigned_employee || asset.employee_name || ''

  // Determine QR Code value
  let qrCodeValue = fullCode
  if (qrValueType === 'url') {
    qrCodeValue = typeof window !== 'undefined' ? `${window.location.origin}/assets/${asset.id}` : fullCode
  } else if (qrValueType === 'json') {
    qrCodeValue = JSON.stringify({ id: asset.id, code: fullCode, serial: serialNo })
  }

  // Barcode value (Code 128)
  const barcodeValue = fullCode

  // 1. COMPACT QR STICKER (e.g. 35mm x 35mm / 1.4" x 1.4")
  if (template === 'compact-qr') {
    return (
      <div className="asset-label-box bg-white text-black border border-black p-2 rounded-sm flex flex-col items-center justify-between text-center select-none"
           style={{ width: '140px', height: '140px', boxSizing: 'border-box' }}>
        {options.showCompany && (
          <div className="text-[9px] font-extrabold tracking-wider uppercase border-b border-black w-full pb-0.5 truncate">
            {options.companyName || 'ASSET TAG'}
          </div>
        )}
        <div className="my-auto py-1">
          <QrCodeRenderer value={qrCodeValue} size={64} level="M" />
        </div>
        <div className="w-full">
          <div className="font-mono font-black text-xs tracking-tight truncate leading-tight">
            {fullCode}
          </div>
          <div className="text-[9px] font-semibold text-gray-800 truncate leading-tight">
            {assetName}
          </div>
        </div>
      </div>
    )
  }

  // 2. INDUSTRIAL EQUIPMENT TAG (e.g. 75mm x 50mm / 3" x 2")
  if (template === 'industrial') {
    return (
      <div className="asset-label-box bg-white text-black border-2 border-black p-2.5 rounded-sm flex flex-col justify-between select-none"
           style={{ width: '280px', height: '185px', boxSizing: 'border-box' }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-black pb-1 mb-1">
          <div className="text-[11px] font-black tracking-wider uppercase">
            {options.companyName || 'PROPERTY OF ASSET MANAGEMENT'}
          </div>
          <span className="text-[9px] font-bold bg-black text-white px-1 py-0.2 rounded-xs">
            FIXED ASSET
          </span>
        </div>

        {/* Content Row: QR Code + Details */}
        <div className="flex items-start gap-2.5 my-1">
          {options.showQr && (
            <div className="flex-shrink-0 p-1 border border-black/30 rounded-xs bg-white">
              <QrCodeRenderer value={qrCodeValue} size={68} level="M" />
            </div>
          )}
          <div className="flex-1 min-w-0 flex flex-col justify-between text-[10px] space-y-0.5">
            <div>
              <span className="text-[8px] font-bold text-gray-600 block uppercase">Asset Tag ID:</span>
              <span className="font-mono font-black text-sm tracking-tight block leading-tight text-black">
                {fullCode}
              </span>
            </div>
            <div className="truncate">
              <span className="text-[8px] font-bold text-gray-600 uppercase">Item: </span>
              <span className="font-bold text-black">{assetName}</span>
            </div>
            {options.showSerial && serialNo && serialNo !== '—' && (
              <div className="truncate font-mono text-[9px]">
                <span className="text-[8px] font-bold text-gray-600 uppercase font-sans">S/N: </span>
                <span>{serialNo}</span>
              </div>
            )}
            {options.showCategory && category && (
              <div className="truncate text-[9px]">
                <span className="text-[8px] font-bold text-gray-600 uppercase">Cat: </span>
                <span>{category}</span>
              </div>
            )}
            {options.showDeptPlant && (plantName || deptName) && (
              <div className="truncate text-[9px]">
                <span className="text-[8px] font-bold text-gray-600 uppercase">Loc: </span>
                <span>{[plantName, deptName].filter(Boolean).join(' / ')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Barcode */}
        {options.showBarcode && (
          <div className="border-t border-black/40 pt-1 flex flex-col items-center">
            <BarcodeRenderer value={barcodeValue} height={22} width={1.2} fontSize={9} displayValue={false} />
            <span className="font-mono text-[8px] font-bold tracking-widest text-gray-700 -mt-0.5">{fullCode}</span>
          </div>
        )}
      </div>
    )
  }

  // 3. BARCODE DOMINANT (50mm x 25mm / 2" x 1")
  if (template === 'barcode-only') {
    return (
      <div className="asset-label-box bg-white text-black border border-black p-2 rounded-sm flex flex-col justify-between text-center select-none"
           style={{ width: '200px', height: '100px', boxSizing: 'border-box' }}>
        {options.showCompany && (
          <div className="text-[9px] font-extrabold tracking-wider uppercase border-b border-black/30 pb-0.5 truncate">
            {options.companyName || 'ASSET MANAGEMENT'}
          </div>
        )}
        <div className="my-auto">
          <BarcodeRenderer value={barcodeValue} height={28} width={1.3} fontSize={10} displayValue={true} />
        </div>
        <div className="text-[9px] font-semibold text-gray-900 truncate">
          {assetName} {serialNo && serialNo !== '—' ? `· SN: ${serialNo}` : ''}
        </div>
      </div>
    )
  }

  // 4. STANDARD ASSET TAG (DEFAULT: 50mm x 25mm / 2" x 1" or 58mm x 32mm)
  return (
    <div className="asset-label-box bg-white text-black border border-black p-2 rounded-sm flex flex-col justify-between select-none"
         style={{ width: '220px', height: '110px', boxSizing: 'border-box' }}>
      {/* Top Header */}
      {options.showCompany && (
        <div className="flex items-center justify-between border-b border-black/60 pb-0.5 text-[8.5px] font-black uppercase tracking-wider">
          <span className="truncate">{options.companyName || 'ASSET MANAGEMENT'}</span>
          <span className="font-mono font-bold text-[8px]">PROPERTY TAG</span>
        </div>
      )}

      {/* Main Body */}
      <div className="flex items-center gap-2 my-auto">
        {options.showQr && (
          <div className="flex-shrink-0 p-0.5 bg-white">
            <QrCodeRenderer value={qrCodeValue} size={50} level="M" />
          </div>
        )}

        <div className="flex-1 min-w-0 flex flex-col justify-center text-left">
          <div className="font-mono font-black text-xs leading-none tracking-tight text-black truncate mb-0.5">
            {fullCode}
          </div>
          <div className="text-[9px] font-bold text-gray-900 leading-tight line-clamp-2" title={assetName}>
            {assetName}
          </div>
          {options.showSerial && serialNo && serialNo !== '—' && (
            <div className="text-[8px] font-mono text-gray-700 truncate leading-none mt-0.5">
              SN: {serialNo}
            </div>
          )}
          {options.showDeptPlant && (plantName || deptName) && (
            <div className="text-[7.5px] text-gray-600 truncate leading-none mt-0.5">
              {[plantName, deptName].filter(Boolean).join(' • ')}
            </div>
          )}
          {options.showAssigned && assigned && (
            <div className="text-[7.5px] text-gray-600 truncate leading-none mt-0.5">
              User: {assigned}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Barcode / Code Footer */}
      {options.showBarcode ? (
        <div className="border-t border-black/30 pt-0.5 flex flex-col items-center">
          <BarcodeRenderer value={barcodeValue} height={16} width={1.1} fontSize={8} displayValue={false} />
        </div>
      ) : (
        <div className="border-t border-black/20 pt-0.5 text-[7px] text-center text-gray-500 font-mono">
          DO NOT REMOVE
        </div>
      )}
    </div>
  )
}
