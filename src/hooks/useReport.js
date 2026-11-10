import { useState,useEffect,useRef } from 'react'
import { exportWorkbook } from '../utils/exportWorkbook'
export default function useReport(load,filters,kind,initialSize=50) {
  const key=JSON.stringify(filters)
  const [paging,setPaging]=useState({key,page:1,size:initialSize})
  const page=paging.key===key?paging.page:1
  const [payload,setPayload]=useState({data:[],total:0,summary:{}})
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [retry,setRetry]=useState(0)
  const [exporting,setExporting]=useState(false)
  const [exportError,setExportError]=useState('')
  const exportAbort=useRef()
  useEffect(()=>{
    const controller=new AbortController()
    setLoading(true);setError('')
    load({...JSON.parse(key),page,pageSize:paging.size},controller.signal).then(r=>{
      if(controller.signal.aborted)return
      setPayload(r.data)
      if(r.data.page!==page)setPaging(p=>({...p,key,page:r.data.page}))
    }).catch(e=>{if(!controller.signal.aborted){setError(e.response?.data?.error||'Could not load this report.');setPayload({data:[],total:0,summary:{}})}}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return()=>controller.abort()
  },[load,key,page,paging.size,retry])
  useEffect(()=>()=>exportAbort.current?.abort(),[])
  async function exportExcel() {
    const controller=new AbortController();exportAbort.current=controller
    setExporting(true);setExportError('')
    try {
      const r=await load({...JSON.parse(key),export:'1'},controller.signal)
      await exportWorkbook(kind,r.data.data,controller.signal)
    } catch(e) {if(!controller.signal.aborted)setExportError(e.response?.data?.error||e.message||'Export failed. Please retry.')}
    finally {if(!controller.signal.aborted)setExporting(false)}
  }
  return {...payload,loading,error,exporting,exportError,exportExcel,
    cancelExport:()=>{exportAbort.current?.abort();setExporting(false)},
    retry:()=>setRetry(n=>n+1),currentPage:page,pageSize:paging.size,
    setCurrentPage:page=>setPaging(p=>({...p,key,page})),setPageSize:size=>setPaging({key,page:1,size})}
}
