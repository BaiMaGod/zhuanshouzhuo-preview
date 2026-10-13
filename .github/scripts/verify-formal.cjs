const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const route=JSON.parse(fs.readFileSync('source/src/solutions.js','utf8').replace(/^export default /,'').replace(/;\s*$/,''))[10];
async function nodePoint(page,label,ringAngle=null){return page.evaluate(({label,ringAngle})=>{
 function find(n){if(!n.visible)return null;if((n.label?.text||n.text)===label)return n;for(let i=0;i<n.numChildren;i++){const b=find(n.getChildAt(i));if(b)return b}return null}
 const n=find(Laya.stage);if(!n)throw Error('Missing '+label);const target=ringAngle===null?n:n.parent;
 const local=ringAngle===null?new Laya.Point(target.width/2,target.height/2):new Laya.Point(40*Math.cos(ringAngle*Math.PI/180),40*Math.sin(ringAngle*Math.PI/180));
 const p=target.localToGlobal(local),r=document.querySelector('canvas').getBoundingClientRect();return{x:r.left+p.x*r.width/Laya.stage.width,y:r.top+p.y*r.height/Laya.stage.height};
 },{label,ringAngle})}
async function button(page,label,touch){const p=await nodePoint(page,label);if(touch)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y)}
async function waitText(page,label){await page.waitForFunction(label=>{function find(n){if(!n.visible)return false;if((n.label?.text||n.text)===label)return true;for(let i=0;i<n.numChildren;i++)if(find(n.getChildAt(i)))return true;return false}return find(Laya.stage)},label,{timeout:15000})}
async function snapshot(page){return page.evaluate(()=>{
 const rings={};function scan(n){if(n.text&&/^[1-9][GABCDE]$/.test(n.text))rings[n.text]={visible:n.parent.visible,angle:n.parent.getChildAt(2).rotation};for(let i=0;i<n.numChildren;i++)scan(n.getChildAt(i))}scan(Laya.stage);return rings;
 })}
async function view(page,id){return page.evaluate(id=>{
 function find(n){if(n.text===id)return n;for(let i=0;i<n.numChildren;i++){const b=find(n.getChildAt(i));if(b)return b}return null}
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
 if(fits(state))return state;
 await button(page,'移动棋盘',touch);
 for(let i=0;i<24&&!fits(state);i++){
  const mid={x:r.x+r.w/2,y:r.y+r.h/2},dx=Math.max(-r.w*.3,Math.min(r.w*.3,mid.x-state.p.x)),dy=Math.max(-r.h*.3,Math.min(r.h*.3,mid.y-state.p.y));
  const points=Array.from({length:9},(_,k)=>({x:mid.x+dx*k/8,y:mid.y+dy*k/8}));await drag(page,session,points,touch);state=await view(page,id);
 }
 await button(page,'旋转手镯',touch);assert.ok(fits(state),'Camera can expose whole ring '+id+' '+JSON.stringify(state));return state;
}
async function turn(page,session,a,touch){
 const state=await focus(page,session,a.id,touch),start=state.angle+50,points=[];const n=Math.max(1,Math.ceil(Math.abs(a.delta)/4));
 for(let k=0;k<=n;k++)points.push(await nodePoint(page,a.id,start+a.delta*k/n));
 await drag(page,session,points,touch);await page.waitForTimeout(400);
}
async function shot(page,results,name){const path=results+'/'+name+'.png';await page.screenshot({path});return{name,path,sha256:crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')}}
module.exports=async function(page,context,name,touch,results){
 const screenshots=[],session=touch?await context.newCDPSession(page):null;
 await button(page,'挑战九宫锁玉阵',touch);await waitText(page,'超级困难 · 九宫锁玉阵');
 assert.equal(await page.evaluate(()=>window.jadeDebug),undefined);
 let before=await snapshot(page);assert.equal(Object.keys(before).length,54);assert.equal(Object.values(before).filter(r=>r.visible).length,54);
 const texts=await page.evaluate(()=>{const out=[];function walk(n){if(!n.visible)return;if(n.text)out.push(n.text);for(let i=0;i<n.numChildren;i++)walk(n.getChildAt(i))}walk(Laya.stage);return out});
 for(const label of ['演示','提示','↶ 微调','微调 ↷','↶ 30°','30° ↷'])assert.equal(texts.includes(label),false,'No teaching control in formal level '+label);
 screenshots.push(await shot(page,results,name+'-formal-overview'));
 let camera=await view(page,'1G'),r=camera.rect,mid={x:r.x+r.w/2,y:r.y+r.h/2};
 if(touch){
  const initial=[{x:mid.x-35,y:mid.y,id:11},{x:mid.x+35,y:mid.y,id:12}];await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:initial});
  for(let i=1;i<=12;i++){const d=35+i*4;await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:mid.x-d,y:mid.y,id:11},{x:mid.x+d,y:mid.y,id:12}]});await page.waitForTimeout(10)}
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{x:mid.x-83,y:mid.y,id:11}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:mid.x-63,y:mid.y+20,id:11}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }else{await page.mouse.move(mid.x,mid.y);await page.mouse.wheel(0,-600);await page.waitForTimeout(150)}
 assert.ok((await view(page,'1G')).zoom>camera.zoom*1.8);assert.deepEqual(await snapshot(page),before,'Zoom/remaining finger must not rotate or remove rings');
 await button(page,'全盘',touch);assert.ok(Math.abs((await view(page,'1G')).zoom-camera.zoom)<1e-7);
 await button(page,'移动棋盘',touch);for(let i=0;i<5;i++)await button(page,'+',touch);
 await drag(page,session,[mid,{x:mid.x+40,y:mid.y+25}],touch);assert.deepEqual(await snapshot(page),before,'Pan cannot mutate rule state');
 if(touch){await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...mid,id:13}]});await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]})}
 await button(page,'旋转手镯',touch);
 screenshots.push(await shot(page,results,name+'-formal-zoom'));
 // Real attempted early bridge rotation must hit the still-present next chamber.
 await turn(page,session,{id:'1C',delta:-10},touch);let blocked=await snapshot(page);assert.ok(blocked['1C'].visible);assert.ok(Math.abs(blocked['1C'].angle-before['1C'].angle)<1);
 await button(page,'重开',touch);assert.deepEqual(await snapshot(page),before);for(let i=0;i<5;i++)await button(page,'+',touch);
 const frames=await page.evaluate(()=>new Promise(resolve=>{const a=[];let last=performance.now();function step(now){a.push(now-last);last=now;if(a.length<120)requestAnimationFrame(step);else{a.sort((x,y)=>x-y);resolve({p95:a[Math.floor(a.length*.95)],max:a.at(-1)})}}requestAnimationFrame(step)}));assert.ok(frames.p95<100,'54-ring rendering p95 under 100ms');
 await turn(page,session,route[0],touch);assert.equal(Object.values(await snapshot(page)).filter(r=>r.visible).length,53);
 await button(page,'撤销',touch);assert.equal(Object.values(await snapshot(page)).filter(r=>r.visible).length,54);await turn(page,session,route[0],touch);
 if(process.env.JADE_PUBLIC_SMOKE==='true'){await button(page,'重开',touch);assert.equal(Object.values(await snapshot(page)).filter(r=>r.visible).length,54);screenshots.push(await shot(page,results,name+'-formal-restart'));await button(page,'回到首页',touch);await page.reload({waitUntil:'networkidle'});await waitText(page,'挑战九宫锁玉阵');return {rings:54,rods:62,actions:1,fullRoute:false,frames,screenshots,pinch:touch,wheel:!touch,passed:true};}
 for(let i=1;i<route.length;i++){await turn(page,session,route[i],touch);if(i===6||i===34)screenshots.push(await shot(page,results,name+'-formal-progress-'+i));if(i%7===6)console.log(name+' formal: completed chamber '+route[i].id[0])}
 await waitText(page,'九宫锁玉阵 · 全部解开');const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('jade-bracelet-laya-v1')));
 assert.ok(save.records[10]);assert.equal(save.records[10].steps,63);screenshots.push(await shot(page,results,name+'-formal-win'));
 await button(page,'再挑战一次',touch);await waitText(page,'超级困难 · 九宫锁玉阵');assert.equal(Object.values(await snapshot(page)).filter(r=>r.visible).length,54);screenshots.push(await shot(page,results,name+'-formal-restart'));
 await button(page,'回到首页',touch);await page.reload({waitUntil:'networkidle'});await waitText(page,'挑战九宫锁玉阵');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('jade-bracelet-laya-v1')).records[10].steps),63);
 return {rings:54,rods:62,actions:63,frames,screenshots,pinch:touch,wheel:!touch,passed:true};
};
