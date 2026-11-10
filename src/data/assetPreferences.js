export const optionalAssetColumns = [
  ['name','Asset Description'],['category','Category'],['serial_number','Serial Number'],['acquisition_value','Acq. Value'],
  ['plant_name','Plant'],['dept_name','Department'],['assigned_employee','Assigned To'],['created_at','Created'],['status','Status'],
]
export const defaultAssetPreferences={search:'',status:'All',department:'All',category:'All',plant:'All',sort:'newest',pageSize:25,columns:optionalAssetColumns.map(c=>c[0]),compact:false}
export function normalizeAssetPreferences(raw) {
  const p=raw&&typeof raw==='object'?raw:{}
  const result={...defaultAssetPreferences}
  for(const key of ['search','status','department','category','plant'])if(typeof p[key]==='string')result[key]=p[key].slice(0,250)
  if(['newest','oldest','code','name'].includes(p.sort))result.sort=p.sort
  if([25,50,100,150,200,250,500].includes(p.pageSize))result.pageSize=p.pageSize
  if(Array.isArray(p.columns))result.columns=[...new Set(p.columns.filter(k=>optionalAssetColumns.some(c=>c[0]===k)))]
  result.compact=p.compact===true
  return result
}
export function readAssetPreferences(key) {
  try {
    const raw=JSON.parse(localStorage.getItem(key)||'{}')
    return {last:normalizeAssetPreferences(raw.last),views:Array.isArray(raw.views)?raw.views.filter(v=>v&&typeof v.name==='string').slice(0,10).map(v=>({name:v.name.slice(0,50),settings:normalizeAssetPreferences(v.settings)})):[]}
  } catch {return {last:normalizeAssetPreferences(null),views:[]}}
}
