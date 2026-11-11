import { QRCodeSVG } from 'qrcode.react'

export default function QrCodeRenderer({
  value,
  size = 72,
  level = 'M',
  includeMargin = true,
  className = ''
}) {
  if (!value) return null

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <QRCodeSVG
        value={String(value)}
        size={size}
        level={level}
        includeMargin={includeMargin}
      />
    </div>
  )
}
