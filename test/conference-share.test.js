const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Share=require('../public/conference-share');

test('conference invitation includes actual theme, dates, venue and a fresh public link in a readable message',()=>{
 const text=Share.message(new Date('2026-11-18T10:00:00+05:30'));
 for(const detail of ['*NeuroMet Pharmacon-2027*','Integrating AI, Drug Discovery, Therapeutics and Pharmacology for Neurometabolic Disorders','19–20 February 2027','21 February 2027','NIPER-Raebareli, Lucknow Campus','Indian Pharmacological Society','31 January 2027','15 January 2027',Share.url])assert.ok(text.includes(detail),detail);
 assert.ok(text.includes('\n\n'));assert.ok(!text.includes('Annual Conference'));
 const whatsapp=new URL(Share.whatsappUrl(new Date('2026-11-18T10:00:00+05:30')));assert.equal(whatsapp.origin,'https://wa.me');assert.equal(whatsapp.searchParams.get('text'),text);
 assert.equal(new URL(Share.url).origin,'https://neuro-med-pharmacon-27.vercel.app');
});

test('sharing after deadlines does not advertise closed abstract or early-bird windows',()=>{
 assert.ok(Share.message(new Date('2027-01-16T00:00:00+05:30')).includes('Abstract deadline: 31 January 2027'));
 assert.ok(Share.message(new Date('2027-01-31T23:59:59+05:30')).includes('Abstract deadline: 31 January 2027'));
 assert.ok(!Share.message(new Date('2027-02-01T00:00:00+05:30')).includes('Abstract deadline:'));
 assert.ok(Share.message(new Date('2027-01-15T23:59:59+05:30')).includes('Early-bird'));
 assert.ok(!Share.message(new Date('2027-01-16T00:00:00+05:30')).includes('Early-bird'));
});

test('image-sharing file is the real public poster rather than an HTML response or URL-only payload',async()=>{
 const bytes=fs.readFileSync('public'+Share.poster);let count=0;
 const file=await Share.posterFile(async url=>{assert.equal(url,Share.poster);count++;return {ok:true,blob:async()=>new Blob([bytes],{type:'image/png'})};},File);
 assert.equal(file.name,'NeuroMet_Pharmacon_2027_Conference_Poster.png');assert.equal(file.type,'image/png');assert.deepEqual(Buffer.from(await file.arrayBuffer()),bytes);
 await Share.posterFile(()=>assert.fail('Cached image should not refetch'),File);assert.equal(count,1);
});

test('server-rendered social metadata points to a real correctly-sized absolute image, and the modal offers an image download',()=>{
 const html=fs.readFileSync('index.html','utf8');assert.equal(html,fs.readFileSync('public/index.html','utf8'));
 const image=html.match(/property="og:image" content="([^"]+)"/)[1];assert.equal(image,Share.canonical.slice(0,-1)+Share.poster);
 assert.ok(html.includes('property="og:url" content="'+Share.canonical+'"'));
 assert.ok(html.includes('name="twitter:image" content="'+image+'"'));
 const bytes=fs.readFileSync('public'+Share.poster);assert.equal(bytes.readUInt32BE(16),1200);assert.equal(bytes.readUInt32BE(20),630);
 assert.ok(html.includes('property="og:image:width" content="1200"'));assert.ok(html.includes('property="og:image:height" content="630"'));
 assert.ok(html.includes('id="downloadConferencePoster"'));assert.ok(html.includes('onclick="shareConferencePoster()"'));assert.ok(html.includes('role="status" aria-live="polite"'));
});
