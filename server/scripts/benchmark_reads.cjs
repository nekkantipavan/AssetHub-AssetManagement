// Read-only local HTTP baseline. Never prints credentials or bearer tokens.
const fs = require('fs')
const { Pool } = require('pg')
const jwt = require('jsonwebtoken')
require('dotenv').config()
async function main() {
  const db = new Pool({host:process.env.DB_HOST,port:process.env.DB_PORT,database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD})
  try {
    const {rows:[user]} = await db.query("SELECT id, role, name FROM users WHERE role='Admin' AND status='Active' ORDER BY id LIMIT 1")
    const token = jwt.sign(user, process.env.JWT_SECRET, {expiresIn:'5m'})
    const results = []
    for (const route of ['/api/assets?pageSize=25', '/api/reports/assets?pageSize=50', '/api/reports/transfers?pageSize=25']) {
      const timings = []; let bytes=0, records=0, total=0
      for (let n=0;n<6;n++) {
        const start=performance.now()
        const response=await fetch('http://127.0.0.1:3001'+route,{headers:{Authorization:'Bearer '+token}})
        const body=await response.text()
        if(!response.ok)throw Error('HTTP '+response.status+' '+route)
        if(n)timings.push(performance.now()-start)
        const data=JSON.parse(body);bytes=Buffer.byteLength(body);records=(Array.isArray(data)?data:data.data).length;total=data.total??records
      }
      timings.sort((a,b)=>a-b)
      results.push({route,records,total,bytes,medianMs:Math.round(timings[2]),maxMs:Math.round(timings[4])})
    }
    const result={date:new Date().toISOString(),note:'Local warm HTTP reads, 1 warmup + 5 samples; not a load test.',results}
    if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n')
    console.log(JSON.stringify(result,null,2))
  } finally {await db.end()}
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
