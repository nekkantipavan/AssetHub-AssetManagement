import { useEffect,useRef,useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search,ArrowUpRight } from 'lucide-react'
import Modal from '../common/Modal'
import { getAssets } from '../../data/api'
import { useAuth } from '../../context/AuthContext'
import useDebounced from '../../hooks/useDebounced'
export default function GlobalSearch() {
  const {canAccess}=useAuth(),navigate=useNavigate()
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[results,setResults]=useState([]),[loading,setLoading]=useState(false),[error,setError]=useState('')
  const debounced=useDebounced(query,250), links=useRef([]),input=useRef()
  const allowed=canAccess('assets')!==false
  useEffect(()=>{
    const shortcut=e=>{if(allowed&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setOpen(o=>!o)}}
    document.addEventListener('keydown',shortcut);return()=>document.removeEventListener('keydown',shortcut)
  },[allowed])
  useEffect(()=>{
    if(!open||!debounced.trim()){setResults([]);setLoading(false);return}
    const controller=new AbortController();setLoading(true);setError('')
    getAssets({search:debounced.trim(),pageSize:8},controller.signal).then(r=>{if(!controller.signal.aborted)setResults(r.data.data)}).catch(e=>{if(!controller.signal.aborted){setResults([]);setError(e.response?.data?.error||'Search is unavailable. Please try again.')}}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return()=>controller.abort()
  },[open,debounced])
  const close=()=>{setOpen(false);setQuery('');setResults([]);setError('')}
  const choose=id=>{close();navigate('/assets/'+id)}
  if(!allowed)return null
  return <>
    <button type="button" aria-label="Search assets" aria-haspopup="dialog" onClick={()=>setOpen(true)} className="flex items-center gap-2 p-2 sm:px-3 bg-cream-100 dark:bg-gray-700 rounded-2xl text-ink-500 dark:text-gray-300"><Search size={16}/><span className="hidden lg:inline text-sm">Search assets…</span><kbd className="hidden xl:inline text-xs">Ctrl K</kbd></button>
    <Modal isOpen={open} onClose={close} title="Search assets">
      <label htmlFor="global-asset-query" className="text-sm text-ink-600 dark:text-gray-300">Asset code, serial number, description or custodian</label>
      <input id="global-asset-query" ref={input} autoFocus value={query} onChange={e=>{setQuery(e.target.value);setResults([])}} onKeyDown={e=>{if(e.key==='ArrowDown'&&results.length){e.preventDefault();links.current[0]?.focus()}}} placeholder="Start typing to search…" className="input-field mt-3"/>
      <div role="status" aria-live="polite" className="text-xs text-ink-500 dark:text-gray-400 my-3">{error || (loading||query!==debounced?'Searching…':query.trim()?`${results.length} matching assets${results.length===8?' · showing the first 8':''}`:'Search all assets you can access.')}</div>
      <div className="space-y-1">{query===debounced&&results.map((asset,i)=><button key={asset.id} ref={el=>links.current[i]=el} onClick={()=>choose(asset.id)} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();links.current[(i+1)%results.length]?.focus()}if(e.key==='ArrowUp'){e.preventDefault();if(i===0)input.current?.focus();else links.current[i-1]?.focus()}}} className="w-full flex items-center justify-between text-left gap-3 rounded-2xl p-3 hover:bg-brand-50 dark:hover:bg-gray-700"><span><span className="text-brand-600 font-semibold text-xs">{asset.asset_code} / {asset.sub_sequence}</span><span className="block text-sm">{asset.name}</span><span className="text-xs text-ink-500 dark:text-gray-400">{asset.plant_name} · {asset.assigned_employee||asset.employee_name||'Unassigned'}</span></span><ArrowUpRight size={16}/></button>)}</div>
      {!loading&&query===debounced&&query.trim()&&!results.length&&!error&&<p className="text-sm py-4">No matching assets. Try a shorter code, serial number or name.</p>}
    </Modal>
  </>
}
