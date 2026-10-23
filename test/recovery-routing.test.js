const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');

test('build preserves the nested emailed recovery path under Vercel clean URLs',t=>{
 const root=path.join(__dirname,'..');
 const stage=fs.mkdtempSync(path.join(os.tmpdir(),'nmp-recovery-build-'));t.after(()=>fs.rmSync(stage,{recursive:true,force:true}));
 fs.mkdirSync(path.join(stage,'scripts'));
 fs.copyFileSync(path.join(root,'scripts/build.js'),path.join(stage,'scripts/build.js'));
 fs.mkdirSync(path.join(stage,'public'));
 fs.copyFileSync(path.join(root,'public/secretariat-reset.html'),path.join(stage,'public/secretariat-reset.html'));
 fs.symlinkSync(path.join(root,'node_modules'),path.join(stage,'node_modules'),'dir');
 execFileSync(process.execPath,[path.join(stage,'scripts/build.js')],{stdio:'pipe'});
 assert.equal(fs.readFileSync(path.join(stage,'dist/secretariat/reset.html'),'utf8'),fs.readFileSync(path.join(root,'public/secretariat-reset.html'),'utf8'));
 const config=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
 assert.equal(config.cleanUrls,true);
 assert.equal(config.rewrites.find(rule=>rule.source==='/secretariat/reset').destination,'/secretariat-reset');
 assert.ok(fs.existsSync(path.join(stage,'dist/secretariat-reset.html')));
});
