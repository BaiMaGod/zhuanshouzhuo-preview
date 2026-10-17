const fs=require('node:fs'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root='source/dist',entry=root+'/js/bundle.js';
let source=fs.readFileSync(entry,'utf8');
// Strip the optional mutable Web QA bridge before hashing and production tests.
const startup=/\n      if \(debugEnabled\(\)\) \{\n        exposeDebug\([^\n]+\);\n      \}/;
assert.ok(startup.test(source),'Official bundle startup must match the reviewed diagnostic adapter');
source=source.replace(startup,'');
for(const name of ['debugEnabled','exposeDebug']){
 const fn=new RegExp('\\n  function '+name+'\\([^\\n]*\\) \\{[\\s\\S]*?\\n  \\}');
 assert.ok(fn.test(source),'Missing expected optional QA function '+name);source=source.replace(fn,'');
}
for(const name of ['jadeDebug','debugEnabled','exposeDebug'])assert.ok(!source.includes(name),'Mutable diagnostic bridge remains: '+name);
fs.writeFileSync(entry,source);
const sourceSha=cp.execFileSync('git',['-C','source','rev-parse','HEAD'],{encoding:'utf8'}).trim();
const version=JSON.parse(fs.readFileSync('source/package.json'));
assert.equal(sourceSha,'4c1534bfa27e6539705b7063fcc30ee5b84cef79');assert.equal(version.version,'0.14.9');
const info={version:version.version,engine:'LayaAir 3.4.0',teachingLevels:10,formalLevels:100,sourceSha};
fs.writeFileSync(root+'/version.json',JSON.stringify(info));
fs.writeFileSync(root+'/release.json',JSON.stringify({...info,previewSha:process.env.GITHUB_SHA,build:'Official checked-in LayaAir 3.4.0 project and startup scene'},null,2));
fs.writeFileSync(root+'/.nojekyll','');
fs.rmSync(root+'/_build-evidence.json',{force:true});
const files={};
function walk(dir){for(const f of fs.readdirSync(dir,{withFileTypes:true})){const path=dir+'/'+f.name;if(f.isDirectory())walk(path);else{
 if(/\.(ts|md|map|laya)$/.test(f.name))throw Error('Source/document in Web payload: '+path);
 files[path.slice(root.length+1)]=crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
}}}
walk(root);
fs.writeFileSync(root+'/_build-evidence.json',JSON.stringify({sourceSha,engine:'LayaAir 3.4.0',officialBuild:true,browserSmokePassed:false,files},null,2));
console.log('Sealed official Web build: '+Object.keys(files).length+' SHA256 entries.');
