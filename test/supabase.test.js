const test = require('node:test');
const assert = require('node:assert/strict');
const { createSupabaseStorage } = require('../supabaseStorage');

const response = value => ({ok:true,status:200,json:async()=>value});

test('permanent records use authenticated server requests and return confirmed IDs', async () => {
  const requests=[];
  const db=createSupabaseStorage({url:'https://project.supabase.co',key:'test-only',fetchImpl:async(url,options)=>{requests.push({url:String(url),options});return response([{id:12}]);}});
  const info=await db.prepare('INSERT INTO registrations (full_name,email,amount) VALUES (?,?,?)').run('Test','test@example.test',4130);
  assert.equal(info.lastInsertRowid,12);
  assert.equal(requests[0].options.headers.Authorization,'Bearer test-only');
  assert.deepEqual(JSON.parse(requests[0].options.body),{full_name:'Test',email:'test@example.test',amount:4130});
  assert.equal(requests[0].url,'https://project.supabase.co/rest/v1/registrations');
});

test('payment proofs are private and admin listing signs temporary links', async () => {
  const calls=[];
  const db=createSupabaseStorage({url:'https://project.supabase.co',key:'test-only',fetchImpl:async(url,options)=>{
    calls.push({url:String(url),options});
    if(String(url).includes('/rest/'))return response([{id:1,payment_proof:'supabase://payment-proofs/test.pdf'}]);
    if(String(url).includes('/sign/'))return response({signedURL:'/object/sign/payment-proofs/test.pdf?token=test-only'});
    return response({Key:'uploaded'});
  }});
  const proof=await db.storeProof(Buffer.from('%PDF-test'),'pdf','REF','receipt.pdf');
  assert.match(proof.stored_path,/^supabase:\/\/payment-proofs\/[\w-]+\.pdf$/);
  assert.equal(calls[0].options.headers['Content-Type'],'application/pdf');
  const rows=await db.prepare('SELECT * FROM registrations ORDER BY created_at DESC').all();
  assert.equal(rows[0].payment_proof,'https://project.supabase.co/storage/v1/object/sign/payment-proofs/test.pdf?token=test-only');
  assert.deepEqual(JSON.parse(calls[2].options.body),{expiresIn:300});
});

test('provider failure rejects insertion instead of reporting a saved registration', async () => {
  const db=createSupabaseStorage({url:'https://project.supabase.co',key:'test-only',fetchImpl:async()=>({ok:false,status:503})});
  await assert.rejects(db.prepare('INSERT INTO contacts (name) VALUES (?)').run('Test'),/Permanent storage request failed \(503\)/);
});

test('invalid storage transport and unsupported queries are rejected', () => {
  assert.throws(()=>createSupabaseStorage({url:'http://project.supabase.co',key:'test-only'}),/HTTPS/);
  const db=createSupabaseStorage({url:'https://project.supabase.co',key:'test-only'});
  assert.throws(()=>db.prepare('SELECT * FROM secrets'),/Unsupported/);
});

test('Vercel registration persists records and proofs through Supabase and protects admin reads', async t => {
  const previousFetch=global.fetch;
  const previousEnv={};
  for (const name of ['VERCEL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','NODE_ENV','ADMIN_TOKEN']) previousEnv[name]=process.env[name];
  Object.assign(process.env,{VERCEL:'1',SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-only',NODE_ENV:'test',ADMIN_TOKEN:'test-private'});
  const tables={},uploads=[];
  global.fetch=async(url,options={})=>{
    const parsed=new URL(url);
    if(parsed.hostname!=='project.supabase.co')return previousFetch(url,options);
    if(parsed.pathname.startsWith('/storage/v1/object/sign/'))return response({signedURL:'/object/sign/payment-proofs/proof.png?token=test-only'});
    if(parsed.pathname.startsWith('/storage/v1/object/')){uploads.push(parsed.pathname);return response({Key:'ok'});}
    const table=parsed.pathname.split('/').pop();
    tables[table] ||= [];
    if(options.method==='POST'){
      const row={...JSON.parse(options.body),id:tables[table].length+1};
      tables[table].push(row);return response([row]);
    }
    return response(tables[table].map(row=>({...row})));
  };
  const {app}=require('../server');
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{
    await new Promise(resolve=>server.close(resolve));
    global.fetch=previousFetch;
    for(const [name,value] of Object.entries(previousEnv))if(value===undefined)delete process.env[name];else process.env[name]=value;
  });
  const base=`http://127.0.0.1:${server.address().port}`;
  const registration=await previousFetch(base+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({full_name:'Test Delegate',email:'delegate@example.test',category:'student',payment_ref:'TEST-12345',payment_proof:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY44YAAAAASUVORK5CYII=',proof_filename:'test.png'})});
  assert.equal(registration.status,200);
  const data=await registration.json();
  assert.deepEqual(data.email_status,{delegate:'simulated',organizer:'simulated'});
  assert.equal(tables.registrations.length,1);
  assert.equal(tables.mail_logs.length,2);
  assert.equal(uploads.length,1);
  assert.match(tables.registrations[0].payment_proof,/^supabase:\/\//);
  assert.equal((await previousFetch(base+'/api/admin/registrations')).status,403);
  const admin=await previousFetch(base+'/api/admin/registrations?token=test-private');
  const rows=await admin.json();
  assert.match(rows[0].payment_proof,/^https:\/\/project.supabase.co\/storage\/v1\/object\/sign\//);
  const word = Buffer.from(require('fflate').zipSync({'[Content_Types].xml':Buffer.from('<Types/>'),'word/document.xml':Buffer.from('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>')}));
  const post = (route,body)=>previousFetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const abstract=await post('/api/abstract',{full_name:'Author',email:'author@example.test',title:'Study',preference:'Poster',document_filename:'study.docx',document_data:'data:application/octet-stream;base64,'+word.toString('base64')});
  assert.equal(abstract.status,200);
  assert.deepEqual((await abstract.json()).email_status,{delegate:'simulated',organizer:'simulated'});
  assert.match(tables.abstracts[0].document_path,/^supabase:\/\/abstract-documents\//);
  assert.ok(uploads.some(path=>path.includes('/abstract-documents/')));
  const abstractAdmin = await previousFetch(base+'/api/admin/abstracts?token=test-private');
  assert.match((await abstractAdmin.json())[0].document_path,/^https:/);
  const invalidAbstract=await post('/api/abstract',{full_name:'Author',email:'author@example.test',title:'Study',document_filename:'study.docx',document_data:'data:text/plain;base64,aGVsbG8='});
  assert.equal(invalidAbstract.status,400);
  assert.equal(tables.abstracts.length,1);
  const inquiry=await post('/api/sponsorship',{company_name:'Company',contact_person:'Contact',email:'sponsor@example.test',tier:'Gold',amount:1});
  assert.equal(inquiry.status,200);
  const inquiryData=await inquiry.json();
  assert.equal(inquiryData.amount,88500);
  assert.deepEqual(inquiryData.email_status,{delegate:'simulated',organizer:'simulated'});
  const badPayment=await post('/api/sponsorship',{company_name:'Company',contact_person:'Contact',email:'sponsor@example.test',tier:'Gold',payment_ref:'TEST-REF'});
  assert.equal(badPayment.status,400);
  const paid=await post('/api/sponsorship',{company_name:'Company',contact_person:'Contact',email:'sponsor@example.test',tier:'Silver',payment_ref:'TEST-REF',proof_filename:'proof.png',payment_proof:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY44YAAAAASUVORK5CYII='});
  assert.equal(paid.status,200);
  assert.equal((await paid.json()).amount,59000);
  assert.match(tables.sponsorships[1].payment_proof,/^supabase:\/\/payment-proofs\//);
  assert.equal(tables.mail_logs.length,8);

});
