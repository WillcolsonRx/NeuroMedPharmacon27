const test=require('node:test');const assert=require('node:assert/strict');
test('Vercel accepts through R2 before any Supabase call and protects processing callbacks',async t=>{
 const previous={};for(const name of ['VERCEL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','R2_INTAKE_URL','R2_INTAKE_TOKEN','R2_CALLBACK_TOKEN','NODE_ENV'])previous[name]=process.env[name];
 Object.assign(process.env,{VERCEL:'1',R2_INTAKE_URL:'https://intake.example',R2_INTAKE_TOKEN:'test-ingest-'.repeat(4),R2_CALLBACK_TOKEN:'test-callback-'.repeat(4),NODE_ENV:'test'});
 delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SERVICE_ROLE_KEY;
 const old=global.fetch,calls=[];global.fetch=async(url,options)=>{calls.push(String(url));assert.equal(String(url),'https://intake.example/intake');const r=JSON.parse(options.body);return {ok:true,json:async()=>({accepted:true,ref_id:r.ref_id,tier:r.tier,amount:r.amount})};};
 const {app}=require('../server');const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(async()=>{await new Promise(r=>server.close(r));global.fetch=old;for(const [k,v]of Object.entries(previous))if(v===undefined)delete process.env[k];else process.env[k]=v;});const base='http://127.0.0.1:'+server.address().port;
 const body={submission_id:'c623fa84-a8cf-4708-92f9-10de23ce0863',full_name:'Test Delegate',email:'test@example.test',affiliation:'Example University',category:'student',workshop:0,payment_ref:'DU12345',payment_proof:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY44YAAAAASUVORK5CYII=',proof_filename:'proof.png'};
 const r=await old(base+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,202);const data=await r.json();assert.equal(data.intake_status,'received');assert.equal(data.email_status.organizer,'queued');assert.equal(calls.length,1);
 const unauthorized=await old(base+'/api/internal/r2-registration',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(unauthorized.status,401);assert.equal(calls.length,1);
});
