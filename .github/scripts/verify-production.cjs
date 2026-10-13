const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {chromium}=require(process.cwd()+'/.qa/node_modules/playwright');
const {PNG}=require(process.cwd()+'/.qa/node_modules/pngjs');
const base=process.env.JADE_URL||'http://127.0.0.1:8080/';
const results='.qa/results';
async function hasText(page,text){return page.evaluate(text=>{
 function find(n){if(!n.visible)return false;if(n.text===text)return true;for(let i=0;i<n.numChildren;i++)if(find(n.getChildAt(i)))return true;return false}
 return !!window.Laya?.stage&&find(Laya.stage);
},text)}
async function waitText(page,text,timeout=60000){await page.waitForFunction(text=>{
 function find(n){if(!n.visible)return false;if(n.text===text)return true;for(let i=0;i<n.numChildren;i++)if(find(n.getChildAt(i)))return true;return false}
 return !!window.Laya?.stage&&find(Laya.stage);
},text,{timeout})}
async function button(page,label,touch){
 const point=await page.evaluate(label=>{
  function find(n){if(!n.visible)return null;if(n.label?.text===label)return n;for(let i=0;i<n.numChildren;i++){const b=find(n.getChildAt(i));if(b)return b}return null}
  const b=find(Laya.stage);if(!b)throw Error('Missing visible button '+label);
  const p=b.localToGlobal(new Laya.Point(b.width/2,b.height/2)),r=document.querySelector('canvas').getBoundingClientRect();
  return{x:r.left+p.x*r.width/Laya.stage.width,y:r.top+p.y*r.height/Laya.stage.height};
 },label);
 if(touch)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);
}
async function shot(page,name){const path=results+'/'+name+'.png';await page.screenshot({path});return{name,path,sha256:crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')}}

async function checkJadePixels(page,viewport){
 const points=await page.evaluate(()=>{
  function find(n){if(!n.visible)return null;if(n.text==='A')return n;for(let i=0;i<n.numChildren;i++){const t=find(n.getChildAt(i));if(t)return t}return null}
  const ring=find(Laya.stage).parent,rect=document.querySelector('canvas').getBoundingClientRect(),out=[];
  for(let a=0;a<360;a+=12)for(const radius of [37,40,43]){
   const p=ring.localToGlobal(new Laya.Point(radius*Math.cos(a*Math.PI/180),radius*Math.sin(a*Math.PI/180)));
   out.push({x:rect.left+p.x*rect.width/Laya.stage.width,y:rect.top+p.y*rect.height/Laya.stage.height});
  }return out;
 });
 const png=PNG.sync.read(await page.screenshot());let gold=0;
 for(const p of points){const x=Math.round(p.x*png.width/viewport.width),y=Math.round(p.y*png.height/viewport.height),i=(y*png.width+x)*4;
  if(x<0||y<0||x>=png.width||y>=png.height)continue;
  const r=png.data[i],g=png.data[i+1],b=png.data[i+2];
  if(r>140&&g>100&&r-b>65&&g-b>25)gold++;
 }
 assert.ok(gold>=12,'Jade surface must actually contain generated golden texture; found '+gold+' of '+points.length+' samples');
 return {goldenSamples:gold,totalSamples:points.length};
}

async function run(browser,name,viewport,touch,allLevels){
 const context=await browser.newContext({viewport,hasTouch:touch,isMobile:touch,deviceScaleFactor:touch?2:1});
 await context.addInitScript(()=>{
  const stats=window.__audioQa={started:0,loops:0,hits:0,decoded:0,peak:0};
  const nativeConnect=AudioNode.prototype.connect;
  AudioNode.prototype.connect=function(target,...args){
   const ctx=this.context;
   if(target===ctx.destination){
    if(!ctx.__qaMeter){
     const meter=ctx.createAnalyser();meter.fftSize=256;ctx.__qaMeter=meter;
     nativeConnect.call(meter,ctx.destination);
     const samples=new Float32Array(256);
     setInterval(()=>{meter.getFloatTimeDomainData(samples);for(const s of samples)stats.peak=Math.max(stats.peak,Math.abs(s))},10);
    }
    return nativeConnect.call(this,ctx.__qaMeter,...args);
   }
   return nativeConnect.call(this,target,...args);
  };
  const start=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(...args){stats.started++;if(this.loop)stats.loops++;else stats.hits++;return start.apply(this,args)};
  const decode=BaseAudioContext.prototype.decodeAudioData;
  BaseAudioContext.prototype.decodeAudioData=function(...args){return decode.apply(this,args).then(b=>{stats.decoded++;return b})};
 });
 const page=await context.newPage(),errors=[],screenshots=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 page.on('requestfailed',r=>errors.push('Request failed: '+r.url()+' '+r.failure()?.errorText));
 page.on('response',r=>{if(r.status()>=400)errors.push('HTTP '+r.status()+' '+r.url())});
 const release=await page.request.get(new URL('release.json',base).href);assert.equal(release.status(),200);
 const provenance=await release.json();assert.equal(provenance.version,'0.3.1');assert.equal(provenance.sourceSha,'615d26d16e34383fc99172aa1d5ffc680c517ce5');
 await page.goto(base+'?debug&v=0.3.1',{waitUntil:'networkidle'});
 await waitText(page,'入境解镯',30000);
 assert.equal(await page.evaluate(()=>window.jadeDebug),undefined,'No mutable diagnostic bridge in release');
 screenshots.push(await shot(page,name+'-home-v03'));
 await button(page,'入境解镯',touch);await waitText(page,'开始转动 B');
 await button(page,'开始转动 B',touch);assert.equal(await hasText(page,'开始转动 B'),false);
 screenshots.push(await shot(page,name+'-level1-v03'));
 await page.waitForFunction(()=>window.__audioQa.decoded===2);
 const pickA=await page.evaluate(()=>{
  function find(n){if(!n.visible)return null;if(n.text==='A')return n;for(let i=0;i<n.numChildren;i++){const t=find(n.getChildAt(i));if(t)return t}return null}
  const ring=find(Laya.stage).parent,p=ring.localToGlobal(new Laya.Point(0,0)),r=document.querySelector('canvas').getBoundingClientRect();
  return{x:r.left+p.x*r.width/Laya.stage.width,y:r.top+p.y*r.height/Laya.stage.height};
 });
 if(touch)await page.touchscreen.tap(pickA.x,pickA.y);else await page.mouse.click(pickA.x,pickA.y);
 const startHits=await page.evaluate(()=>window.__audioQa.hits);
 await button(page,'30° ↷',touch);
 await page.waitForFunction(n=>window.__audioQa.hits>n,startHits);
 screenshots.push(await shot(page,name+'-collision-v03'));
 await button(page,'音效 开',touch);await page.waitForTimeout(120);
 const mutedStarts=await page.evaluate(()=>window.__audioQa.started);
 await button(page,'30° ↷',touch);await page.waitForTimeout(150);
 assert.equal(await page.evaluate(()=>window.__audioQa.started),mutedStarts,'Muted collision starts no voice');
 await button(page,'音效 关',touch);
 const material=await checkJadePixels(page,viewport);
 console.log(name+' visible jade texture: '+JSON.stringify(material));
 const points=await page.evaluate(()=>{
  function find(n){if(!n.visible)return null;if(n.text==='B')return n;for(let i=0;i<n.numChildren;i++){const t=find(n.getChildAt(i));if(t)return t}return null}
  const ring=find(Laya.stage).parent,a=ring.getChildAt(2).rotation,out=[],rect=document.querySelector('canvas').getBoundingClientRect();
  for(let angle=a;angle<=a+125;angle+=5){const radians=angle*Math.PI/180,p=ring.localToGlobal(new Laya.Point(40*Math.cos(radians),40*Math.sin(radians)));
   out.push({x:rect.left+p.x*rect.width/Laya.stage.width,y:rect.top+p.y*rect.height/Laya.stage.height});}
  return out;
 });
 if(touch){const session=await context.newCDPSession(page);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...points[0],id:1}]});
  for(const p of points.slice(1)){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...p,id:1}]});await page.waitForTimeout(20)}
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }else{await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();for(const p of points.slice(1)){await page.mouse.move(p.x,p.y);await page.waitForTimeout(20)}await page.mouse.up()}
 await waitText(page,'这一境，解开了',15000);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('jade-bracelet-laya-v1')).unlocked),1);
 screenshots.push(await shot(page,name+'-win-v03'));
 console.log(name+': real '+(touch?'touch':'mouse')+' drag cleared level 1.');
 if(allLevels)for(let i=1;i<10;i++){
  await button(page,'进入第 '+(i+1)+' 境',touch);await waitText(page,'演示');
  if(i===3||i===4||i===9)screenshots.push(await shot(page,name+'-level'+(i+1)+'-v03'));
  await button(page,'演示',touch);await waitText(page,i===9?'十境皆通':'这一境，解开了');
  const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('jade-bracelet-laya-v1')));
  assert.ok(save.records[i]);assert.equal(save.unlocked,Math.min(9,i+1));
  console.log(name+': UI progression + legal demo cleared level '+(i+1)+'.');
 }
 await button(page,'再解一次',touch);await waitText(page,'演示');
 assert.equal(await hasText(page,'这一境，解开了'),false);assert.equal(await hasText(page,'十境皆通'),false);
 screenshots.push(await shot(page,name+'-restart-v03'));
 await button(page,'重开',touch);await waitText(page,'演示');
 const frames=await page.evaluate(()=>new Promise(resolve=>{const a=[];let last=performance.now();function step(now){a.push(now-last);last=now;if(a.length<120)requestAnimationFrame(step);else{a.sort((x,y)=>x-y);resolve({p95:a[Math.floor(a.length*.95)],max:a[a.length-1]})}}requestAnimationFrame(step)}));
 fs.writeFileSync(results+'/'+name+'-frames.json',JSON.stringify(frames)); console.log(name+' frame times: '+JSON.stringify(frames));
 assert.ok(frames.p95<100,'CI rendering p95 under 100 ms');
 const audio=await page.evaluate(()=>window.__audioQa);
 assert.ok(audio.loops>=1,'Actual rotation starts sampled friction');
 assert.ok(audio.hits>=2,'Collision and clear emit sampled material sounds');
 assert.ok(audio.peak>.001,'Audio graph delivers nonzero sound signal');
 await page.waitForLoadState('networkidle');assert.deepEqual(errors,[]);
 await context.close();return{name,viewport,touch,allLevels,screenshots,frames,material,audio,errors,passed:true};
}
function verifyFiles(evidence){for(const [name,expected]of Object.entries(evidence.files)){assert.equal(crypto.createHash('sha256').update(fs.readFileSync('source/dist/'+name)).digest('hex'),expected,'Changed build file '+name)}}
(async()=>{
 fs.mkdirSync(results,{recursive:true});
 const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 const profiles=[];
 try{profiles.push(await run(browser,'desktop',{width:720,height:1280},false,false));profiles.push(await run(browser,'mobile',{width:390,height:844},true,true));profiles.push(await run(browser,'narrow',{width:375,height:667},true,false));}
 finally{await browser.close()}
 fs.writeFileSync(results+'/report.json',JSON.stringify({url:base,sourceSha:'615d26d16e34383fc99172aa1d5ffc680c517ce5',profiles,passed:true},null,2));
 if(!process.env.JADE_URL){const path='source/dist/_build-evidence.json',e=JSON.parse(fs.readFileSync(path));verifyFiles(e);e.browserSmokePassed=true;e.browserSmokeViewport=profiles.map(p=>p.viewport);fs.writeFileSync(path,JSON.stringify(e,null,2));verifyFiles(e)}
 console.log('Final V0.2 Web package passed desktop, two mobile viewports, real input, 10 levels and restart.');
})().catch(e=>{console.error(e);process.exit(1)});
