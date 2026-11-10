const { dateValue }=require('./bulkAssets')
function transferFilters(q) {
  const params=[], terms=[]
  const add=(sql,v)=>{params.push(v);terms.push(sql.replaceAll('?', '$'+params.length))}
  if(q.search?.trim())add('(t.transfer_code ILIKE ? OR t.challan_no ILIKE ? OR fp.name ILIKE ? OR tp.name ILIKE ? OR u.name ILIKE ?)','%'+q.search.trim().replace(/[\\%_]/g,'\\$&')+'%')
  if(q.type)add('t.transfer_type=?',q.type)
  if(q.status)add('t.status=?',q.status)
  if(q.dateFrom)add('t.created_at >= ?::date',dateValue(q.dateFrom))
  return {where:terms.length?'WHERE '+terms.join(' AND '):'',params}
}
module.exports={transferFilters}
