const joins = `FROM assets a
  LEFT JOIN plants p ON p.id=a.plant_id
  LEFT JOIN departments d ON d.id=a.dept_id
  LEFT JOIN users u ON u.id=a.assigned_user_id`
const sorts = { newest:'a.created_at DESC, a.id DESC', oldest:'a.created_at ASC, a.id ASC', code:'a.asset_code ASC, a.sub_sequence ASC, a.id ASC', name:'a.name ASC, a.id ASC' }
const searchFields = ['name', 'asset_code', 'serial_number', 'assigned_employee', 'category']
// Keep this expression aligned with the trigram index in migration 013.
const searchDocument = searchFields.map(field => `coalesce(a.${field}, '')`).join(' || chr(31) || ')
function assetFilters(q) {
  const conditions=[], params=[]
  const add=(sql,value)=>{params.push(value);conditions.push(sql.replaceAll('?', '$'+params.length))}
  if(q.search?.trim()) {
    const matchesField = searchFields.map(field => `a.${field} ILIKE ?`).join(' OR ')
    add(`(((${searchDocument}) ILIKE ? AND (${matchesField})) OR a.assigned_user_id = ANY(ARRAY(SELECT id FROM users WHERE name ILIKE ?)))`, '%'+q.search.trim().replace(/[\\%_]/g,'\\$&')+'%')
  }
  for(const [key,column] of [['status','a.status'],['category','a.category'],['plant','p.name'],['department','d.name']])if(q[key])add(column+'=?',q[key])
  for(const [key,column] of [['plant_id','a.plant_id'],['dept_id','a.dept_id']])if(q[key]) {
    if(!/^\d+$/.test(q[key]))throw Error('Invalid '+key)
    add(column+'=?',Number(q[key]))
  }
  return {where:conditions.length?'WHERE '+conditions.join(' AND '):'',params}
}
async function readAssets(db,q,report=false) {
  const {where,params}=assetFilters(q)
  const filterJoins = `${q.plant ? 'LEFT JOIN plants p ON p.id=a.plant_id' : ''} ${q.department ? 'LEFT JOIN departments d ON d.id=a.dept_id' : ''}`
  const count=(await db.query(`SELECT COUNT(*)::int total,
    COUNT(*) FILTER(WHERE a.status='Active')::int active,
    COUNT(*) FILTER(WHERE a.status IN ('In Transfer','Pending Transfer','In Transit'))::int in_transfer,
    COUNT(*) FILTER(WHERE a.status='Inactive')::int inactive FROM assets a ${filterJoins} ${where}`,params)).rows[0]
  const pageSize=Math.min(500,Math.max(1,parseInt(q.pageSize)|| (report?50:25)))
  const page=Math.min(Math.max(1,parseInt(q.page)||1),Math.max(1,Math.ceil(count.total/pageSize)))
  const exporting=q.export==='1'
  if(exporting&&count.total>25000) { const error=Error('Excel exports support up to 25,000 assets. Narrow the filters before exporting.');error.status=413;throw error }
  const dataParams=exporting?params:[...params,pageSize,(page-1)*pageSize]
  const limit=exporting?'':`LIMIT $${params.length+1} OFFSET $${params.length+2}`
  const sort = Object.hasOwn(sorts, q.sort) ? sorts[q.sort] : sorts.newest
  // Limit the asset IDs before loading related display fields, even on deep pages.
  const data=(await db.query(`WITH page_ids AS MATERIALIZED (
    SELECT a.id FROM assets a ${filterJoins} ${where} ORDER BY ${sort} ${limit}
  ) SELECT a.*, a.xmin::text record_version,
    a.asset_code || ' ' || a.sub_sequence AS sub_asset_code,
    to_char(a.date_of_purchase,'YYYY-MM-DD') date_of_purchase,
    to_char(a.warranty_date,'YYYY-MM-DD') warranty_date,
    p.name plant_name,p.code plant_code,d.name dept_name,u.name employee_name
    ${report?", (SELECT m.description FROM asset_masters m WHERE m.type='cost_center' AND m.value=a.cost_center ORDER BY m.id LIMIT 1) cost_center_description":''}
    ${joins} JOIN page_ids page ON page.id=a.id ORDER BY ${sort}`,dataParams)).rows
  return {data,total:count.total,page,pageSize,summary:count}
}
function assetReadHandler(pool,report=false) {
  return async(req,res)=>{
    let db
    try {
      db=await pool.connect()
      await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
      const result=await readAssets(db,req.query,report)
      await db.query('COMMIT')
      res.json(result)
    } catch(e) { if(db)await db.query('ROLLBACK').catch(()=>{});console.error('Read assets:',e.message);res.status(e.status||400).json({error:e.status?e.message:'Could not load assets. Check filters and retry.'}) }
    finally {db?.release()}
  }
}
module.exports={assetFilters,readAssets,assetReadHandler}
