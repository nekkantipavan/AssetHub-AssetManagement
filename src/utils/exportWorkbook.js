// Excel serialization runs off the UI thread; the heavy library loads only on export.
export function exportWorkbook(kind, rows, signal) {
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('../workers/excel.worker.js',import.meta.url),{type:'module'})
    const finish=()=>{worker.terminate();signal?.removeEventListener('abort',abort)}
    const abort=()=>{finish();reject(new DOMException('Export cancelled','AbortError'))}
    if(signal?.aborted){abort();return}
    signal?.addEventListener('abort',abort,{once:true})
    worker.onerror=()=>{finish();reject(Error('Could not prepare the workbook. Please retry.'))}
    worker.onmessage=({data})=>{
      finish()
      if(data.error){reject(Error(data.error));return}
      const url=URL.createObjectURL(new Blob([data.buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}))
      const link=document.createElement('a');link.href=url;link.download=`${kind==='transfers'?'transfer':'asset'}-report-${new Date().toLocaleDateString('en-CA')}.xlsx`
      document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)
      resolve()
    }
    worker.postMessage({kind,rows})
  })
}
