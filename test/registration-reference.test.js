const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const reference=require('../public/registration-reference');
const {createAbstractEligibility}=require('../abstractEligibility');
const {InMemoryDb}=require('../dbFallback');
const {createSupabaseStorage}=require('../supabaseStorage');
const canonical='NMP27-DEL-CB9F0EF9CC024FA686A5524B8DA1D290';
const short='NMP27-524B8DA1D290';

test('compact check-in ID is stable while old IDs and non-registration references are preserved',()=>{
 assert.equal(reference.display(canonical),short);assert.equal(reference.display(canonical.toLowerCase()),short);
 for(const id of ['NMP27-DEL-12345','NMP27-ABS-12345',short])assert.equal(reference.display(id),id);
 assert.equal(reference.isValid(short),true);assert.equal(reference.isValid(canonical),true);
 assert.equal(reference.isValid('NMP27-*'),false);assert.equal(reference.isValid('NMP27-ABCDEFGHIJKL'),false);
});

test('short-ID verification preserves canonical foreign key, checks email and refuses suffix collisions',async()=>{
 const db=new InMemoryDb();db.tables.registrations.push({ref_id:canonical,email:'delegate@example.test'});
 const verify=createAbstractEligibility(db);
 assert.deepEqual(await verify({registration_id:short,email:'delegate@example.test'}),{registration_ref:canonical,email:'delegate@example.test'});
 await assert.rejects(verify({registration_id:short,email:'wrong@example.test'}),e=>e.status===403);
 assert.equal((await verify({registration_id:canonical,email:'delegate@example.test'})).registration_ref,canonical);
 db.tables.registrations.push({ref_id:'NMP27-DEL-AAAAAAAAAAAAAAAAAAAA524B8DA1D290',email:'delegate@example.test'});
 await assert.rejects(verify({registration_id:short,email:'delegate@example.test'}),/ambiguous/);
 assert.equal((await verify({registration_id:canonical,email:'delegate@example.test'})).registration_ref,canonical);
});

test('Supabase compact lookup is bounded and sends no proof or delegate name',async()=>{
 let query;const db=createSupabaseStorage({url:'https://project.supabase.co',key:'test',fetchImpl:async url=>{query=new URL(url);return {ok:true,json:async()=>[{ref_id:canonical,email:'delegate@example.test'}]};}});
 assert.equal((await db.registrationByReference(short))[0].ref_id,canonical);
 assert.equal(query.searchParams.get('ref_id'),'like.NMP27-DEL-*524B8DA1D290');assert.equal(query.searchParams.get('limit'),'2');assert.equal(query.searchParams.get('select'),'ref_id,email');
});

test('SQLite short lookup returns canonical registration and detects multiple matches',async()=>{
 const Database=require('better-sqlite3'),db=new Database(':memory:');
 try{db.exec('create table registrations(ref_id text,email text)');db.prepare('insert into registrations values(?,?)').run(canonical,'delegate@example.test');
 const verify=createAbstractEligibility(db);assert.equal((await verify({registration_id:short,email:'delegate@example.test'})).registration_ref,canonical);
 db.prepare('insert into registrations values(?,?)').run('NMP27-DEL-AAAAAAAAAAAAAAAAAAAA524B8DA1D290','delegate@example.test');await assert.rejects(verify({registration_id:short,email:'delegate@example.test'}),/ambiguous/);
 }finally{db.close();}
});

test('confirmation email embeds both real logos and uses short IDs while logging the original',async t=>{
 delete process.env.NODE_ENV;process.env.SMTP_HOST='logos.example.test';process.env.SMTP_USER='sender@example.test';process.env.SMTP_PASS='test-only';process.env.ORGANIZER_EMAIL='organizer@example.test';
 const messages=[],logs=[];t.mock.method(require('nodemailer'),'createTransport',()=>({sendMail:async message=>{messages.push(message);return {messageId:'mock-only'};}}));
 const db={prepare:()=>({run:async(...args)=>logs.push(args)})};
 const {handleRegistrationEmails}=require('../mailer');await handleRegistrationEmails(db,{full_name:'Delegate',email:'delegate@example.test',ref_id:canonical,category:'student',amount:3500,currency:'INR'});
 const mail=messages.find(m=>m.to==='delegate@example.test'),organizer=messages.find(m=>m.to==='organizer@example.test');
 assert.match(mail.subject,/NMP27-524B8DA1D290/);assert.ok(!mail.html.includes(canonical));assert.ok(organizer.html.includes(short));assert.ok(organizer.subject.includes(short));assert.ok(mail.text.includes(short));
 assert.match(mail.html,/src="cid:nmp-niper-logo"/);assert.match(mail.html,/src="cid:nmp-ips-logo"/);
 assert.ok(!mail.html.includes('NIPER-Raebareli Lucknow Campus · In Collaboration'));
 assert.equal(mail.attachments.length,2);for(const image of mail.attachments){assert.ok(fs.statSync(image.path).size>1000);assert.equal(image.contentDisposition,'inline');assert.ok(mail.html.includes('cid:'+image.cid));}
 assert.ok(logs.every(args=>args[3]===canonical));
});
