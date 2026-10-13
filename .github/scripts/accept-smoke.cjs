const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const path='source/dist/_build-evidence.json',e=JSON.parse(fs.readFileSync(path)),profiles=[];
for(const name of ['desktop','mobile','narrow']){
 const r=JSON.parse(fs.readFileSync('.qa/'+name+'/report.json'));assert.equal(r.passed,true);assert.equal(r.sourceSha,e.sourceSha);assert.equal(r.profiles.length,1);
 const p=r.profiles[0];assert.equal(p.name,name);assert.equal(p.formal.passed,true);assert.equal(p.formal.actions,63);assert.deepEqual(p.errors,[]);profiles.push(p);
}
for(const [name,expected]of Object.entries(e.files))assert.equal(crypto.createHash('sha256').update(fs.readFileSync('source/dist/'+name)).digest('hex'),expected);
e.browserSmokePassed=true;e.browserSmokeViewport=profiles.map(p=>p.viewport);fs.writeFileSync(path,JSON.stringify(e,null,2));console.log('Three independent full-route browser verifications match the sealed candidate SHA.');
