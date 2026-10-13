const fs=require('node:fs'),crypto=require('node:crypto'),cp=require('node:child_process');
const root='source/dist',entry=root+'/js/main.js';
let source=fs.readFileSync(entry,'utf8');
const debug=/\n    if \(new URLSearchParams\(location.search\)\.has\('debug'\)\) \{\n        window\.jadeDebug = [^\n]+\n    \}/;
if(!debug.test(source))throw Error('Unexpected diagnostic entry; release adapter must be reviewed');
source=source.replace(debug,'');
if(source.includes('jadeDebug'))throw Error('Diagnostic game object leaked');
fs.writeFileSync(entry,source);
let html=fs.readFileSync(root+'/index.html','utf8');
html=html.replace('<head>','<head><link rel="icon" href="data:,">');
fs.writeFileSync(root+'/index.html',html);
const sourceSha=cp.execFileSync('git',['-C','source','rev-parse','HEAD'],{encoding:'utf8'}).trim();
const version=JSON.parse(fs.readFileSync(root+'/version.json'));
if(version.version!=='0.5.6'||sourceSha!=='c3f0354878fe18b5cae22e849fa5ad989b78bc4d')throw Error('Wrong game revision');
fs.writeFileSync(root+'/release.json',JSON.stringify({...version,sourceSha,previewSha:process.env.GITHUB_SHA,build:'Official LayaAir CLI 3.4.0 Web export, standalone game startup adapter'},null,2));
fs.writeFileSync(root+'/.nojekyll','');
const files={};
function walk(dir){for(const f of fs.readdirSync(dir,{withFileTypes:true})){const path=dir+'/'+f.name;if(f.isDirectory())walk(path);else{
 if(/\.(ts|md|map|laya)$/.test(f.name))throw Error('Source/document in Web payload: '+path);
 files[path.slice(root.length+1)]=crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
}}}
walk(root);
fs.writeFileSync(root+'/_build-evidence.json',JSON.stringify({sourceSha,engine:'LayaAir 3.4.0',officialBuild:true,browserSmokePassed:false,files},null,2));
console.log('Sealed official Web build: '+Object.keys(files).length+' SHA256 entries.');

