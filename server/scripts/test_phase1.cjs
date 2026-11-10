// Database checks use session-local temporary fixtures only; HTTP checks are read-only.
const assert=require('node:assert/strict'),{Pool}=require('pg'),jwt=require('jsonwebtoken'),Module=require('module'),vm=require('vm'),path=require('path')
const {readAssets,assetFilters}=require('../assetRead'),{transferFilters}=require('../reportFilters')
const {buildSync}=require('../../node_modules/esbuild')
require('dotenv').config()
let checks=0
const check=(ok,label)=>{assert.ok(ok,label);checks++;console.log('PASS:',label)}
function compiled(relative) {
  const filename=path.resolve(__dirname,relative)
  const output=buildSync({entryPoints:[filename],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text
  const mod=new Module(filename,module);mod.filename=filename;mod.paths=module.paths;mod._compile(output,filename);return mod.exports
}
async function main(){
  const db=new Pool({host:process.env.DB_HOST,port:process.env.DB_PORT,database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD})
  const client=await db.connect()
  try {
    const admin=(await client.query("SELECT id,role,name FROM users WHERE role='Admin' AND status='Active' ORDER BY id LIMIT 1")).rows[0]
    await client.query(`CREATE TEMP TABLE assets (id int,asset_code text,sub_sequence int,name text,serial_number text,assigned_employee text,assigned_user_id int,plant_id int,dept_id int,category text,acquisition_value numeric,status text,created_at timestamp,date_of_purchase date,warranty_date date,cost_center text);
      CREATE TEMP TABLE plants(id int,name text,code text); CREATE TEMP TABLE departments(id int,name text);
      CREATE TEMP TABLE users(id int,name text); CREATE TEMP TABLE asset_masters(id int,type text,value text,description text);`)
    for(const name of ['assets','plants','departments','users','asset_masters'])assert.equal((await client.query('SELECT relpersistence FROM pg_class WHERE oid=$1::regclass',[name])).rows[0].relpersistence,'t')
    await client.query("INSERT INTO plants VALUES(1,'Plant One','001'),(2,'Plant Two','002'); INSERT INTO departments VALUES(1,'IT'); INSERT INTO users VALUES(1,'Custodian One')")
    for(let n=1;n<=20;n++)await client.query("INSERT INTO assets VALUES($1,$2,0,$3,$4,'Owner',1,$5,1,'Laptops',100,'Active','2026-11-06','2026-01-02',NULL,NULL)",[n,'CODE-'+String(n).padStart(3,'0'),n===20?'Literal 10%_test':'Laptop '+n,'SERIAL-'+n,n%2?1:2])
    let a=await readAssets(client,{page:'1',pageSize:'5',sort:'code'},true),b=await readAssets(client,{page:'2',pageSize:'5',sort:'code'},true)
    check(a.data.length===5&&a.total===20&&a.summary.active===20,'paginated report contains accurate full-filter totals')
    check(a.data.every(x=>!b.data.some(y=>y.id===x.id)),'stable ordering prevents overlap between pages with tied dates')
    check((await readAssets(client,{plant_id:'1',pageSize:'5'})).total===10,'plant filter is applied before counting and pagination')
    check((await readAssets(client,{search:'SERIAL-20'})).total===1,'global search can match serial numbers')
    check((await readAssets(client,{search:'Custodian One'})).total===20,'search can match the linked employee')
    check((await readAssets(client,{search:'%_'})).total===1,'wildcards in search are literal characters')
    check((await readAssets(client,{search:"' OR 1=1 --"})).total===0,'search text remains a bound SQL parameter')
    check((await readAssets(client,{page:'999',pageSize:'5'})).page===4,'out-of-range pages clamp to the last valid page')
    check((await readAssets(client,{status:'Inactive'})).total===0,'zero-result filters return an empty accurate report')
    check((await readAssets(client,{plant_id:'1',export:'1'},true)).data.length===10,'export includes every filtered record beyond the displayed page')
    check(a.data[0].date_of_purchase==='2026-01-02'&&a.data[0].record_version,'export dates and revision metadata survive server paging')
    assert.throws(()=>assetFilters({plant_id:'invalid'}));checks++
    const filters=transferFilters({search:'code',type:'Returnable',dateFrom:'2026-11-01'})
    check(filters.params.length===3&&filters.where.includes('$3::date'),'transfer filters are parameterized with date validation')
    assert.throws(()=>transferFilters({dateFrom:'2026-02-31'}));checks++

    const prefs=compiled('../../src/data/assetPreferences.js')
    const clean=prefs.normalizeAssetPreferences({columns:['name','unknown','name','status'],pageSize:999,sort:'DROP TABLE assets',search:'x',compact:true})
    check(clean.columns.join(',')==='name,status'&&clean.pageSize===25&&clean.sort==='newest','saved preferences reject invalid columns, duplicates, sizes and sort keys')
    check(prefs.normalizeAssetPreferences(null).columns.length===9,'corrupt or missing preferences use sensible defaults')
    const workbook=buildSync({entryPoints:[path.resolve(__dirname,'../../src/workers/excel.worker.js')],bundle:true,platform:'browser',format:'iife',write:false}).outputFiles[0].text
    let message
    const context={console,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,self:{postMessage:m=>message=m},Date}
    vm.createContext(context);vm.runInContext(workbook,context)
    context.self.onmessage({data:{kind:'assets',rows:[{id:1,asset_code:'0001',sub_sequence:0,name:'Laptop',plant_code:'001',dept_name:'IT',date_of_purchase:'2026-01-02',record_version:'42'}]}})
    const XLSX=require('../../node_modules/xlsx')
    let wb=XLSX.read(Buffer.from(message.buffer),{type:'buffer'}),data=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
    check(data[0]['Asset Code']==='0001'&&data[0]['Record Version']==='42'&&Object.keys(data[0]).includes('Fiscal Year'),'worker Excel export retains leading zeros and all round-trip import columns')
    context.self.onmessage({data:{kind:'transfers',rows:[{transfer_code:'TRF-1',items:[{asset_code:'A',sub_sequence:0}],returns:[{return_code:'RET-1'}]}]}})
    wb=XLSX.read(Buffer.from(message.buffer),{type:'buffer'})
    check(wb.SheetNames.join(',')==='Transfers,Transfer Assets,Returns','transfer worker retains the three-sheet export')

    const token=jwt.sign(admin,process.env.JWT_SECRET,{expiresIn:'5m'})
    const get=async(url,tokenValue=token)=>{const response=await fetch('http://127.0.0.1:3001'+url,{headers:tokenValue?{Authorization:'Bearer '+tokenValue}:{}});return {status:response.status,data:await response.json()}}
    a=await get('/api/reports/assets?pageSize=3');b=await get('/api/reports/assets?pageSize=3&page=2')
    check(a.status===200&&a.data.data.length<=3&&a.data.total>3,'live report endpoint honors requested page size')
    check(a.data.data.every(x=>!b.data.data.some(y=>y.id===x.id)),'live pages contain distinct asset IDs')
    const search=await get('/api/assets?search='+encodeURIComponent(a.data.data[0].asset_code)+'&pageSize=8')
    check(search.status===200&&search.data.data.some(x=>x.id===a.data.data[0].id),'live global search resolves an existing asset')
    check((await get('/api/reports/assets',null)).status===401,'anonymous report access is rejected')
    const userToken=jwt.sign({...admin,role:'User'},process.env.JWT_SECRET,{expiresIn:'5m'})
    check((await get('/api/reports/assets',userToken)).status===403,'report role restrictions remain enforced')
    const deniedToken=jwt.sign({...admin,role:'NoAccessTest'},process.env.JWT_SECRET,{expiresIn:'5m'})
    check((await get('/api/assets?search=AST',deniedToken)).status===403,'global-search endpoint enforces page permissions')
    const transfer=await get('/api/reports/transfers?pageSize=2')
    check(transfer.status===200&&transfer.data.data.length<=2&&transfer.data.total>=transfer.data.data.length,'live transfer report paginates with matching totals')
    const filtered=await get('/api/reports/transfers?status=Completed&pageSize=2')
    check(filtered.status===200&&filtered.data.data.every(t=>t.status==='Completed'),'live transfer report filters records on the server')
    console.log(`All ${checks} phase-one checks passed; application records unchanged.`)
  } finally {client.release();await db.end()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
