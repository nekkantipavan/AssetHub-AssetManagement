import { Edit2,Trash2,Printer,CheckSquare,Square } from 'lucide-react'
import { Badge } from './Badge'
import { optionalAssetColumns } from '../../data/assetPreferences'
export default function AssetRegisterTable({assets,columns,compact,loading,selected,onSelect,onSelectAll,onOpen,onEdit,onDelete,onPrint,editable}) {
  const cell=compact?'px-4 py-2':'px-4 py-3'
  function value(a,key) {
    const v=a[key]
    if(key==='status')return <Badge label={v||'Active'}/>
    if(key==='acquisition_value')return v==null?'—':Number(v).toLocaleString('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0})
    if(key==='assigned_employee')return v||a.employee_name||'—'
    if(key==='created_at')return v?new Date(v).toLocaleDateString('en-IN'):'—'
    return v||'—'
  }
  return <table className="w-full text-xs" aria-label="Asset register" aria-busy={loading}>
    <thead><tr className="bg-cream-50 dark:bg-gray-800 text-ink-500 dark:text-gray-400">
      <th className="sticky left-0 bg-cream-50 dark:bg-gray-800 z-10 px-3 py-3 w-10"><button aria-label="Select all assets on this page" aria-pressed={assets.length>0&&assets.every(a=>selected.has(a.id))} onClick={onSelectAll}>{assets.length>0&&assets.every(a=>selected.has(a.id))?<CheckSquare size={16}/>:<Square size={16}/>}</button></th>
      <th className="sticky left-10 bg-cream-50 dark:bg-gray-800 z-10 px-4 py-3 text-left whitespace-nowrap">Asset Code / Sub Asset</th>
      {columns.map(key=><th key={key} className="px-4 py-3 text-left whitespace-nowrap">{optionalAssetColumns.find(c=>c[0]===key)?.[1]}</th>)}
      <th className="sticky right-0 bg-cream-50 dark:bg-gray-800 px-4 py-3 text-left">Actions</th>
    </tr></thead>
    <tbody>{loading&&!assets.length?<tr><td colSpan={columns.length+3} className="p-12 text-center">Loading assets…</td></tr>:assets.map(a=><tr key={a.id} className="cursor-pointer border-t border-cream-200 dark:border-gray-700 group hover:bg-cream-50 dark:hover:bg-gray-750" onClick={event => {
      if (!event.target.closest('button, a, input')) onOpen(a.id)
    }}>
      <td className="sticky left-0 bg-white dark:bg-gray-800 px-3"><button aria-label={`Select ${a.asset_code} / ${a.sub_sequence}`} aria-pressed={selected.has(a.id)} onClick={e=>onSelect(a.id,e)}>{selected.has(a.id)?<CheckSquare size={16} className="text-brand-600"/>:<Square size={16}/>}</button></td>
      <td className={`sticky left-10 bg-white dark:bg-gray-800 z-10 ${cell} whitespace-nowrap`}><button className="text-brand-600 font-semibold text-left hover:underline" onClick={()=>onOpen(a.id)}>{a.asset_code}<span className="text-ink-500 dark:text-gray-400"> / {a.sub_sequence??0}</span></button></td>
      {columns.map(key=><td key={key} className={`${cell} ${key==='name'?'min-w-[200px] max-w-[300px]':'whitespace-nowrap'} text-ink-700 dark:text-gray-300`}>{value(a,key)}</td>)}
      <td className={`sticky right-0 bg-white dark:bg-gray-800 ${cell}`}><div className="flex gap-1">
        <button onClick={e=>onPrint(a,e)} aria-label={`Print label for ${a.asset_code}`} className="p-2 rounded-xl hover:bg-brand-50 dark:hover:bg-gray-700"><Printer size={15}/></button>
        {editable&&<><button onClick={()=>onEdit(a)} aria-label={`Edit ${a.asset_code}`} className="p-2 rounded-xl hover:bg-brand-50 dark:hover:bg-gray-700"><Edit2 size={15}/></button><button onClick={()=>onDelete(a)} aria-label={`Delete ${a.asset_code}`} className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-gray-700 text-red-500"><Trash2 size={15}/></button></>}
      </div></td>
    </tr>)}</tbody>
  </table>
}
