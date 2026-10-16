const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const path='source/dist/_build-evidence.json',e=JSON.parse(fs.readFileSync(path)),profiles=[];
const mode=process.env.JADE_VERIFY_MODE||'full';
assert.ok(['fast','full'].includes(mode),'Unknown verification mode: '+mode);
const names=mode==='full'?['desktop','desktop-wide','mobile','narrow']:['desktop','mobile'];
for(const name of names){
 const r=JSON.parse(fs.readFileSync('.qa/'+name+'/report.json'));
 assert.equal(r.passed,true);assert.equal(r.sourceSha,e.sourceSha);assert.equal(r.verificationMode,mode);assert.equal(r.profiles.length,1);
 const p=r.profiles[0];assert.equal(p.name,name);assert.equal(p.formal.passed,true);
 assert.equal(p.formal.actions,mode==='full'?54:4);
 assert.equal(p.formal.fullRoute===true,mode==='full');
 assert.deepEqual(p.errors,[]);profiles.push(p);
}
for(const [name,expected]of Object.entries(e.files))assert.equal(crypto.createHash('sha256').update(fs.readFileSync('source/dist/'+name)).digest('hex'),expected);
e.browserSmokePassed=true;e.browserSmokeMode=mode;e.browserSmokeViewport=profiles.map(p=>p.viewport);
fs.writeFileSync(path,JSON.stringify(e,null,2));
console.log(mode+' gate: '+names.length+' independent browser verifications match sealed candidate SHA '+e.sourceSha);
