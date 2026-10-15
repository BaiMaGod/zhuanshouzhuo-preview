const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {PNG}=require(process.cwd()+'/.qa/node_modules/pngjs');
const route=JSON.parse(fs.readFileSync('source/src/legacy-formal-solution.js','utf8').replace(/^export default /,'').replace(/;\s*$/,''));
async function nodePoint(page,label,ringAngle=null){return page.evaluate(({label,ringAngle})=>{
 function find(n){if(!n.visible)return null;if((n.label?.text||n.text)===label||n.name==='ring-id:'+label||n.name==='button:'+({'重开':'restart','回到首页':'home','音效':'sound','玩法':'help'}[label]||'NONE'))return n;for(let i=0;i<n.numChildren;i++){const b=find(n.getChildAt(i));if(b)return b}return null}
 const n=find(Laya.stage);if(!n)throw Error('Missing '+label);const target=ringAngle===null?n:n.parent;
 const local=ringAngle===null?new Laya.Point(target.width/2,target.height/2):new Laya.Point(40*Math.cos(ringAngle*Math.PI/180),40*Math.sin(ringAngle*Math.PI/180));
 const p=target.localToGlobal(local),r=document.querySelector('canvas').getBoundingClientRect();return{x:r.left+p.x*r.width/Laya.stage.width,y:r.top+p.y*r.height/Laya.stage.height};
 },{label,ringAngle})}
async function button(page,label,touch){const p=await nodePoint(page,label);if(touch)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));if(label==='重开'||label==='回到首页'){const confirm=label==='重开'?'确认重开':'确认返回';await waitText(page,confirm);await button(page,confirm,touch)}}
async function waitText(page,label){await page.waitForFunction(label=>{function find(n){if(!n.visible)return false;if((n.label?.text||n.text)===label||n.name==='ring-id:'+label||n.name==='button:'+({'重开':'restart','回到首页':'home','音效':'sound','玩法':'help'}[label]||'NONE'))return true;for(let i=0;i<n.numChildren;i++)if(find(n.getChildAt(i)))return true;return false}return find(Laya.stage)},label,{timeout:15000})}
async function snapshot(page){return page.evaluate(()=>{
 const rings={};function scan(n){if(n.name&&/^ring-id:[1-9][GABCDE]$/.test(n.name))rings[n.name.slice(8)]={angle:n.parent.getChildAt(2).rotation};for(let i=0;i<n.numChildren;i++)scan(n.getChildAt(i))}scan(Laya.stage);return rings;
 })}
async function activeCount(page){return page.evaluate(()=>{let count=null;function scan(n){if(n.text&&/^\d+ (?:手)?镯待解/.test(n.text))count=Number(n.text.match(/^\d+/)[0]);for(let i=0;i<n.numChildren;i++)scan(n.getChildAt(i))}scan(Laya.stage);if(count===null)throw Error('Missing actual HUD count');return count;});}
async function backdropRegistration(page){return page.evaluate(()=>{
 function find(n,predicate){if(predicate(n))return n;for(let i=0;i<n.numChildren;i++){const b=find(n.getChildAt(i),predicate);if(b)return b}return null}
 const ring=find(Laya.stage,n=>n.name==='ring-id:1G').parent,root=ring.parent.parent,bg=find(Laya.stage,n=>n.name==='board-backdrop');if(!bg)throw Error('Missing board artwork camera');
 const scene=bg.parent,wallpaper=find(Laya.stage,n=>n.name==='formal-wallpaper');
 if(!wallpaper||wallpaper.parent!==scene.parent||wallpaper.parent===scene||wallpaper.zOrder>=scene.zOrder)throw Error('Decorative wallpaper must sit below the *entire* gameplay scene, not inside its cache');
 const basis=n=>[[0,0],[1,0],[0,1]].map(([x,y])=>{const p=n.localToGlobal(new Laya.Point(x,y));return {x:p.x,y:p.y}});
 const ringPoint=ring.localToGlobal(new Laya.Point(0,0)),artPoint=bg.localToGlobal(new Laya.Point(ring.x+ring.parent.x,ring.y+ring.parent.y));
 const images=['board-garden','board-tray'].map(name=>{const n=find(bg,n=>n.name===name);if(!n||n.parent!==bg||!n.visible||n.alpha===0)throw Error('Missing visible '+name);return {name,x:n.x,y:n.y,scale:n.scaleX,rotation:n.rotation}});
 return {ringBasis:basis(root),artBasis:basis(bg),ringPoint:{x:ringPoint.x,y:ringPoint.y},artPoint:{x:artPoint.x,y:artPoint.y},images};
 })}
function assertRegistered(r,initial){
 for(let i=0;i<3;i++)for(const k of ['x','y'])assert.ok(Math.abs(r.ringBasis[i][k]-r.artBasis[i][k])<1e-4,'Artwork shares the actual ring camera matrix');
 for(const k of ['x','y'])assert.ok(Math.abs(r.ringPoint[k]-r.artPoint[k])<1e-4,'Ring stays at its registered background position');
 if(initial)assert.deepEqual(r.images,initial.images,'Zoom, pan and undo cannot move artwork inside the world');
}
async function view(page,id){return page.evaluate(id=>{
 function find(n){if(n.text===id||n.name==='ring-id:'+id)return n;for(let i=0;i<n.numChildren;i++){const b=find(n.getChildAt(i));if(b)return b}return null}
 const label=find(Laya.stage),ring=label.parent,root=ring.parent.parent,viewport=root.parent,r=document.querySelector('canvas').getBoundingClientRect();
 const css=p=>({x:r.left+p.x*r.width/Laya.stage.width,y:r.top+p.y*r.height/Laya.stage.height});
 const p=css(ring.localToGlobal(new Laya.Point(0,0))),q=css(ring.localToGlobal(new Laya.Point(40,0))),tl=css(viewport.localToGlobal(new Laya.Point(0,0))),br=css(viewport.localToGlobal(new Laya.Point(viewport.width,viewport.height)));
 return {p,radius:Math.hypot(q.x-p.x,q.y-p.y),rect:{x:tl.x,y:tl.y,w:br.x-tl.x,h:br.y-tl.y},zoom:root.scaleX,angle:ring.getChildAt(2).rotation,visible:ring.visible};
 },id)}
async function drag(page,session,points,touch){
 if(touch){await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...points[0],id:1}]});for(const p of points.slice(1)){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...p,id:1}]});await page.waitForTimeout(8)}await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}
 else{await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();for(const p of points.slice(1)){await page.mouse.move(p.x,p.y);await page.waitForTimeout(8)}await page.mouse.up()}
}
async function focus(page,session,id,touch){
 let state=await view(page,id),r=state.rect;
 const fits=s=>s.p.x-s.radius>r.x+3&&s.p.x+s.radius<r.x+r.w-3&&s.p.y-s.radius>r.y+3&&s.p.y+s.radius<r.y+r.h-3;
 for(let i=0;i<24&&!fits(state);i++){
  const mid={x:r.x+r.w/2,y:r.y+r.h/2},dx=Math.max(-r.w*.3,Math.min(r.w*.3,mid.x-state.p.x)),dy=Math.max(-r.h*.3,Math.min(r.h*.3,mid.y-state.p.y));
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:mid.x-12,y:mid.y,id:11},{x:mid.x+12,y:mid.y,id:12}]});
  for(let k=1;k<=8;k++){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:mid.x-12+dx*k/8,y:mid.y+dy*k/8,id:11},{x:mid.x+12+dx*k/8,y:mid.y+dy*k/8,id:12}]});await page.waitForTimeout(8)}
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(34);state=await view(page,id);
 }
 assert.ok(fits(state),'Two-finger pan can expose the whole ring '+id+' '+JSON.stringify(state));return state;
}
async function turn(page,session,a,touch){
 const initial=await focus(page,session,a.id,touch);let remaining=a.delta;
 for(let fragment=0;fragment<16;fragment++){
  const state=await focus(page,session,a.id,touch),start=state.angle+[50,65,35,80,20][fragment%5],points=[],n=Math.max(1,Math.ceil(Math.abs(remaining)/4));
  for(let k=0;k<=n;k++)points.push(await nodePoint(page,a.id,start+remaining*k/n));
  await drag(page,session,points,touch);await page.waitForTimeout(400);
  const after=await view(page,a.id);if(!after.visible||a.expectBlocked)return;
  const norm=x=>(x%360+360)%360,progress=a.delta>0?norm(after.angle-initial.angle):-norm(initial.angle-after.angle);remaining=a.delta-progress;
  if(Math.abs(remaining)<1.5)return;
  if(fragment===0)console.log('Resume real gesture after intermediate clear: '+a.id+' remaining '+remaining);
 }
 throw Error('Gesture did not reach its legal destination '+JSON.stringify({a,remaining,view:await view(page,a.id)}));
}
async function shot(page,results,name){const path=results+'/'+name+'.png';await page.screenshot({path});return{name,path,sha256:crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')}}
module.exports=async function(page,context,name,touch,results){
 const screenshots=[],session=await context.newCDPSession(page);
 // Check the new atlas with the untouched player save first.
 await page.waitForTimeout(160);
 const isAtlas=()=>page.evaluate(()=>{
  function exists(n){if(n.name==='atlas-viewport')return true;for(let i=0;i<n.numChildren;i++)if(exists(n.getChildAt(i)))return true;return false}
  return !!window.Laya?.stage&&exists(Laya.stage);
 });
 const openAtlas=async()=>{
  for(let tries=0;tries<4;tries++){
   if(await isAtlas())return;
   await button(page,'关卡图谱',touch);await page.waitForTimeout(220);
   if(await isAtlas())return;
  }
  throw Error('Atlas did not open after actual UI button presses');
 };
 const inspect=()=>page.evaluate(()=>{
  const cards=[];let viewport;
  function scan(n){if(n.name==='atlas-viewport')viewport=n;if(n.name?.startsWith('formal-level:'))cards.push({name:n.name,enabled:n.enabled,w:n.width,h:n.height,text:Array.from({length:n.numChildren},(_,i)=>n.getChildAt(i).text).filter(Boolean)});for(let i=0;i<n.numChildren;i++)scan(n.getChildAt(i))}scan(Laya.stage);
  return {cards,height:viewport.height,offset:Math.abs(viewport.getChildAt(0).y)};
 });
 await openAtlas();
 let atlas=await inspect();assert.equal(atlas.offset,0);assert.equal(atlas.cards.length,40);
 assert.ok(atlas.cards.every(c=>c.w===148&&c.h<=132&&c.text.length===1));
 assert.equal(atlas.cards.find(c=>c.name==='formal-level:2').enabled,false);
 await button(page,'第2关',touch);assert.equal((await inspect()).offset,0);
 // Drag within the actual atlas viewport. This tests the player gesture rather
 // than relying on browser-wheel delta units, which differ across Laya builds.
 const scrollTo=async(target)=>{
  for(let attempt=0;attempt<18;attempt++){
   const before=(await inspect()).offset,remaining=target-before;
   if(Math.abs(remaining)<12)return;
   const motion=Math.sign(remaining)*Math.min(Math.abs(remaining)+(Math.abs(remaining)<10?3:0),atlas.height*.45);
   const v=await page.evaluate(down=>{
    function find(n){if(n.name==='atlas-viewport')return n;for(let i=0;i<n.numChildren;i++){const c=find(n.getChildAt(i));if(c)return c}return null}
    const box=find(Laya.stage);if(!box)throw Error('Missing atlas viewport');
    const r=document.querySelector('canvas').getBoundingClientRect();
    const p=box.localToGlobal(new Laya.Point(box.width/2,box.height*(down?.75:.25)));
    return {x:r.left+p.x*r.width/Laya.stage.width,y:r.top+p.y*r.height/Laya.stage.height,scale:r.height/Laya.stage.height};
   },motion>0);
   await page.mouse.move(v.x,v.y);await page.mouse.down();
   for(let k=1;k<=12;k++){await page.mouse.move(v.x,v.y-motion*v.scale*k/12);await page.waitForTimeout(8)}
   await page.mouse.up();await page.waitForTimeout(130);
  }
  throw Error('Real atlas drag cannot reach requested page: '+JSON.stringify({target,actual:(await inspect()).offset}));
 };
 await scrollTo(atlas.height*2);
 atlas=await inspect();assert.ok(Math.abs(atlas.offset-atlas.height*2)<12,'Real drag reaches atlas page 3');assert.ok(atlas.cards.length<=60);
 screenshots.push(await shot(page,results,name+'-atlas-scroll'));
 // A historical non-contiguous record is an explicit compatibility fixture.
 // It unlocks only the already completed legacy level; the full route below
 // is still played using real input, with no game/debug state mutation.
 await page.evaluate(()=>{const key='jade-bracelet-laya-v1',save=JSON.parse(localStorage.getItem(key));save.records[54]={steps:54,stars:3};localStorage.setItem(key,JSON.stringify(save));});
 await page.reload({waitUntil:'networkidle'});await openAtlas();
 atlas=await inspect();assert.equal(atlas.offset,0,'Re-entry locates the first unfinished level');
 await scrollTo(atlas.height*2);
 assert.equal((await inspect()).cards.find(c=>c.name==='formal-level:45').enabled,true);
 await button(page,'第45关',touch);await waitText(page,'第45关');
 assert.equal(await page.evaluate(()=>window.jadeDebug),undefined);
 let before=await snapshot(page);assert.equal(Object.keys(before).length,54);assert.equal(await activeCount(page),54);
 const lattice=await page.evaluate(()=>{const points=[];function scan(n){if(n.name&&/^ring-id:[1-9][GABCDE]$/.test(n.name))points.push({x:n.parent.x,y:n.parent.y});for(let i=0;i<n.numChildren;i++)scan(n.getChildAt(i))}scan(Laya.stage);return points});
 const rows=new Map;for(const p of lattice){const y=Math.round(p.y*1000);if(!rows.has(y))rows.set(y,[]);rows.get(y).push(p.x)}const bands=[...rows].sort((a,b)=>a[0]-b[0]);assert.ok(bands.length>=9);assert.ok(Math.max(...bands.slice(3,-3).map(([,xs])=>xs.length))>Math.max(bands[0][1].length,bands.at(-1)[1].length),'Rendered oval narrows at both ends');for(const [,xs]of bands){xs.sort((a,b)=>a-b);for(let i=1;i<xs.length;i++)assert.ok(Math.abs(xs[i]-xs[i-1]-92.0001)<1e-4,'Rendered oval has no empty interior cells');}
 assert.equal(await page.evaluate(()=>{const out=[];function scan(n){if(n.name?.startsWith('ring-id:'))out.push(n.text);for(let i=0;i<n.numChildren;i++)scan(n.getChildAt(i))}scan(Laya.stage);return out.some(Boolean)}),false,'Formal ring labels are blank');
 const artwork=await backdropRegistration(page);assertRegistered(artwork);
 // Screenshot difference verifies that the actual PNG is painted, not merely
 // registered in the display list beneath an opaque new wallpaper.
 const visiblePlate=PNG.sync.read(await page.screenshot());
 await page.evaluate(()=>{function walk(n){if(n.name==='board-tray')return n;for(let i=0;i<n.numChildren;i++){const r=walk(n.getChildAt(i));if(r)return r}return null}const tray=walk(Laya.stage);if(!tray)throw Error('Missing tray image');tray.visible=false;});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const withoutPlate=PNG.sync.read(await page.screenshot());
 await page.evaluate(()=>{function walk(n){if(n.name==='board-tray')return n;for(let i=0;i<n.numChildren;i++){const r=walk(n.getChildAt(i));if(r)return r}return null}walk(Laya.stage).visible=true;});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(visiblePlate.width,withoutPlate.width);
 let painted=0;
 for(let i=0;i<visiblePlate.data.length;i+=4){
  if(Math.abs(visiblePlate.data[i]-withoutPlate.data[i])+Math.abs(visiblePlate.data[i+1]-withoutPlate.data[i+1])+Math.abs(visiblePlate.data[i+2]-withoutPlate.data[i+2])>=9)painted++;
 }
 assert.ok(painted>400,'Original jade tray must visibly contribute to rendered screen; changed pixels: '+painted);
 const texts=await page.evaluate(()=>{const out=[];function walk(n){if(!n.visible)return;if(n.text)out.push(n.text);for(let i=0;i<n.numChildren;i++)walk(n.getChildAt(i))}walk(Laya.stage);return out});
 for(const label of ['双指缩放 / 移动画面','演示','图谱','↶ 微调','微调 ↷','↶ 30°','30° ↷','旋转手镯','移动棋盘','撤销'])assert.equal(texts.includes(label),false,'No teaching control in formal level '+label);
 screenshots.push(await shot(page,results,name+'-formal-overview'));
 const hintVisible=()=>page.evaluate(()=>{function walk(n){if(n.zOrder===25&&n.scrollRect&&n.numChildren===1&&n.getChildAt(0).visible)return true;for(let i=0;i<n.numChildren;i++)if(walk(n.getChildAt(i)))return true;return false}return walk(Laya.stage)});
 await button(page,'提示 ×1',touch);await page.waitForFunction(()=>{function walk(n){if(n.zOrder===25&&n.scrollRect&&n.numChildren===1&&n.getChildAt(0).visible)return true;for(let i=0;i<n.numChildren;i++)if(walk(n.getChildAt(i)))return true;return false}return walk(Laya.stage)});
 assert.deepEqual(await snapshot(page),before,'Hint cannot rotate bracelets');assert.equal(await activeCount(page),54);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('jade-bracelet-laya-v1-run-54')).hint),0);await button(page,'提示 ×0',touch);await waitText(page,'本关提示已用完');
 screenshots.push(await shot(page,results,name+'-formal-hint'));
 await button(page,'重开',touch);assert.equal(await hintVisible(),false,'Restart removes the finger hint');

 let camera=await view(page,'1G'),r=camera.rect,mid={x:r.x+r.w/2,y:r.y+r.h/2};
 if(touch){
  const initial=[{x:mid.x-35,y:mid.y,id:11},{x:mid.x+35,y:mid.y,id:12}];await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:initial});
  for(let i=1;i<=12;i++){const d=35+i*4;await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:mid.x-d,y:mid.y,id:11},{x:mid.x+d,y:mid.y,id:12}]});await page.waitForTimeout(10)}
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{x:mid.x-83,y:mid.y,id:11}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:mid.x-63,y:mid.y+20,id:11}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }else{await page.mouse.move(mid.x,mid.y);await page.mouse.wheel(0,-600);await page.waitForTimeout(150)}
 assert.ok((await view(page,'1G')).zoom>camera.zoom*1.8);assert.deepEqual(await snapshot(page),before,'Zoom/remaining finger must not rotate rings');assert.equal(await activeCount(page),54,'Zoom cannot remove rings');
 assertRegistered(await backdropRegistration(page),artwork);
 await button(page,'全盘',touch);assert.ok(Math.abs((await view(page,'1G')).zoom-camera.zoom)<1e-7);
 for(let i=0;i<5;i++)await button(page,'+',touch);
 await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:mid.x-12,y:mid.y,id:11},{x:mid.x+12,y:mid.y,id:12}]});
 await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:mid.x+28,y:mid.y+25,id:11},{x:mid.x+52,y:mid.y+25,id:12}]});
 await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.deepEqual(await snapshot(page),before,'Pan cannot mutate rule state');
 assertRegistered(await backdropRegistration(page),artwork);
 if(touch){await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...mid,id:13}]});await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]})}
 screenshots.push(await shot(page,results,name+'-formal-zoom'));
 // Real attempted early bridge rotation must hit the still-present next chamber.
 // The existing radial tolerance permits slightly more angular play on a short
 // compact bridge. Check the physical stop from this revision, not the old long rod.
 const core=(await import(require('node:url').pathToFileURL(require('node:path').resolve('source/src/core.js')).href)).default;
 const stop=core.request(core.make(54),'1A',10);assert.equal(stop.blocked.kind,'captive');
 await turn(page,session,{id:'1A',delta:10,expectBlocked:true},touch);let blocked=await snapshot(page);assert.equal(await activeCount(page),54);
 assert.ok(Math.abs(core.diff(blocked['1A'].angle,before['1A'].angle)-stop.done)<.251,'Real drag stops at the authoritative captive collision');
 await button(page,'重开',touch);assert.deepEqual(await snapshot(page),before);for(let i=0;i<5;i++)await button(page,'+',touch);
 const cacheInfo=await page.evaluate(()=>{function find(n){if(n.name==='ring-id:1G')return n;for(let i=0;i<n.numChildren;i++){const b=find(n.getChildAt(i));if(b)return b}return null}const ring=find(Laya.stage).parent,viewport=ring.parent.parent.parent,scene=viewport.parent;const rect=n=>{const r=n.getSelfBounds(new Laya.Rectangle(0,0,0,0));return {x:r.x,y:r.y,width:r.width,height:r.height}};return {sceneCache:scene.cacheAs,viewportCache:viewport.cacheAs,sceneBounds:rect(scene),viewportBounds:rect(viewport),dpr:devicePixelRatio,glVersion:document.querySelector('canvas').getContext('webgl')?.getParameter(document.querySelector('canvas').getContext('webgl').VERSION)};});console.log(name+' cache diagnostics: '+JSON.stringify(cacheInfo));
 const frames=await page.evaluate(()=>new Promise(resolve=>{const a=[],firstEngineFrame=Laya.timer.currFrame;let last=performance.now();function step(now){a.push(now-last);last=now;if(a.length<120)requestAnimationFrame(step);else{a.sort((x,y)=>x-y);resolve({p95:a[Math.floor(a.length*.95)],max:a.at(-1),engineFrames:Laya.timer.currFrame-firstEngineFrame})}}requestAnimationFrame(step)}));fs.writeFileSync(results+'/'+name+'-formal-frames.json',JSON.stringify(frames));console.log(name+' 54-ring frame times: '+JSON.stringify(frames));assert.ok(frames.engineFrames>30,'Actual Laya frame loop must keep advancing: '+JSON.stringify(frames));// Browser rAF samples are quantized to 0.1ms; baseline p95=99.9ms and 100.0ms are equivalent.
 assert.ok(frames.p95<=100.5,'54-ring rendering p95 within 100ms plus 0.5ms timer tolerance: '+JSON.stringify(frames));
 const expected=core.make(54),smokeActions=process.env.JADE_PUBLIC_SMOKE==='true'?4:route.length;
 for(let i=0;i<smokeActions;i++){
  if(i===1){const beforeHint=await snapshot(page);await button(page,'提示 ×1',touch);await page.waitForFunction(()=>{function walk(n){if(n.zOrder===25&&n.scrollRect&&n.numChildren===1&&n.getChildAt(0).visible)return true;for(let i=0;i<n.numChildren;i++)if(walk(n.getChildAt(i)))return true;return false}return walk(Laya.stage)},null,{timeout:20000});assert.deepEqual(await snapshot(page),beforeHint,'Progress hint stays read-only');}
  core.request(expected,route[i].id,route[i].delta);await turn(page,session,route[i],touch);
  assert.equal(await activeCount(page),expected.rings.filter(r=>r.life==='active').length,'Actual HUD matches legal drag '+i);
  const halos=await page.evaluate(()=>{const lengths=[];function walk(n){if(n.name&&/^ring-id:[1-9][GABCDE]$/.test(n.name))lengths.push(n.parent.getChildAt(1).graphics.cmds?.length||0);for(let i=0;i<n.numChildren;i++)walk(n.getChildAt(i))}walk(Laya.stage);return lengths;});assert.ok(halos.every(n=>n===0),'No circle overlay even during selection');
  if(i===0)assertRegistered(await backdropRegistration(page),artwork);
  if(i%6===5)console.log(name+' formal real gestures: '+(i+1)+' / '+route.length);
 }
 if(process.env.JADE_PUBLIC_SMOKE==='true'){await button(page,'重开',touch);assert.equal(await activeCount(page),54);screenshots.push(await shot(page,results,name+'-formal-restart'));await button(page,'回到首页',touch);await page.reload({waitUntil:'networkidle'});await waitText(page,'第1关');return {rings:54,rods:62,actions:4,fullRoute:false,frames,screenshots,pinch:touch,wheel:!touch,passed:true};}
 await waitText(page,'第45关 · 全部解开');const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('jade-bracelet-laya-v1')));
 assert.ok(save.records[54]);assert.equal(save.records[54].steps,route.length);screenshots.push(await shot(page,results,name+'-formal-win'));
 await button(page,'再挑战一次',touch);await waitText(page,'第45关');assert.equal(await activeCount(page),54);screenshots.push(await shot(page,results,name+'-formal-restart'));
 await button(page,'回到首页',touch);await page.reload({waitUntil:'networkidle'});await waitText(page,'第1关');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('jade-bracelet-laya-v1')).records[54].steps),route.length);
 return {rings:54,rods:62,actions:route.length,frames,screenshots,pinch:touch,wheel:!touch,passed:true};
};

module.exports.turn=turn;


module.exports.view=view;
module.exports.activeCount=activeCount;
