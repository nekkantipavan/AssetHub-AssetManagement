import { useEffect, useMemo, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import AssetLabel from './AssetLabel'
import { LABEL_TEMPLATES, sheetLayout } from './labelLayout'

export default function LabelPrintView({ job }) {
  const iframe = useRef(null)
  const root = useRef(null)
  const { queue, template, mode, options, qrValueType, margin, gap, skip } = job
  const size = LABEL_TEMPLATES[template]
  const layout = sheetLayout(template, margin, gap)
  const labels = useMemo(() => queue.flatMap(asset => Array.from({ length: asset.printQty }, () => asset)), [queue])
  const slots = [...Array(mode === 'sheet' ? skip : 0).fill(null), ...labels]
  const capacity = mode === 'sheet' ? layout.capacity : 1
  const pages = Array.from({ length: Math.ceil(slots.length / capacity) }, (_, index) =>
    slots.slice(index * capacity, (index + 1) * capacity))
  const styles = useMemo(() => Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map(node => node.outerHTML).join(''), [])
  const paper = mode === 'sheet' ? '210mm 297mm' : size.width + 'mm ' + size.height + 'mm'
  const pageStyle = mode === 'sheet'
    ? 'width:210mm;height:297mm;padding:' + margin + 'mm;grid-template-columns:repeat(' + layout.columns + ',' + size.width + 'mm);grid-template-rows:repeat(' + layout.rows + ',' + size.height + 'mm);gap:' + gap + 'mm;'
    : 'width:' + size.width + 'mm;height:' + size.height + 'mm;padding:0;'
  const html = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AssetHub · ' + labels.length + ' asset labels</title>' +
    styles + '<style>body{margin:0;background:#eeeae4;color:#111;font-family:Arial,sans-serif}.print-toolbar{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;background:white;padding:16px 24px;border-bottom:1px solid #ddd}.print-toolbar button{background:#e8790c;color:white;padding:10px 20px;border:0;border-radius:10px;font-weight:bold;cursor:pointer}.label-print-page{box-sizing:border-box;display:grid;align-content:start;background:white;margin:20px auto;overflow:hidden;' +
    pageStyle + '}@page{size:' + paper + ';margin:0}@media print{html,body{margin:0;padding:0;background:white}body *{visibility:visible!important}.print-toolbar{display:none!important}.label-print-page{margin:0;break-after:page;box-shadow:none}.label-print-page:last-child{break-after:auto}.asset-label-physical{break-inside:avoid;print-color-adjust:exact}}</style></head><body><div id="label-print-root"></div></body></html>'

  useEffect(() => () => {
    const previous = root.current
    queueMicrotask(() => previous?.unmount())
  }, [])

  function renderPages() {
    const frameWindow = iframe.current.contentWindow
    const target = frameWindow.document.getElementById('label-print-root')
    if (!target) return
    root.current?.unmount()
    root.current = createRoot(target)
    root.current.render(<>
      <div className="print-toolbar">
        <div><strong>{labels.length} asset labels · {pages.length} {mode === 'sheet' ? 'sheets' : 'roll labels'}</strong>
          <p style={{ fontSize: 12, marginTop: 4 }}>Use actual size / 100% scale. Turn off browser headers and footers. Match the printer paper to {mode === 'sheet' ? 'A4' : size.width + ' × ' + size.height + ' mm'}.</p>
        </div>
        <button type="button" onClick={() => frameWindow.print()}>Print labels</button>
      </div>
      {pages.map((page, pageIndex) => <section key={pageIndex} className="label-print-page" aria-label={'Print page ' + (pageIndex + 1)}>
        {page.map((asset, index) => asset
          ? <AssetLabel key={index} asset={asset} template={template} options={options} qrValueType={qrValueType}/>
          : <div key={index} aria-hidden="true"/>)}
      </section>)}
    </>)
  }

  return <iframe ref={iframe} title="Label print view" sandbox="allow-same-origin allow-modals"
    srcDoc={html} onLoad={renderPages} className="block h-full min-h-[320px] w-full border-0 bg-white"/>
}
