import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'

export default function BarcodeRenderer({
  value,
  width = 1.4,
  height = 36,
  displayValue = true,
  fontSize = 11,
  font = 'monospace',
  textMargin = 2,
  margin = 0,
  className = ''
}) {
  const svgRef = useRef(null)

  useEffect(() => {
    if (!svgRef.current || !value) return
    try {
      JsBarcode(svgRef.current, String(value), {
        format: 'CODE128',
        width,
        height,
        displayValue,
        fontSize,
        font,
        textMargin,
        margin,
        lineColor: '#000000',
        background: 'transparent',
      })
    } catch (e) {
      console.warn('Barcode render warning:', e)
    }
  }, [value, width, height, displayValue, fontSize, font, textMargin, margin])

  if (!value) return null

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <svg ref={svgRef} className="max-w-full" />
    </div>
  )
}
