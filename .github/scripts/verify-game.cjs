const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.cwd()+'/.qa/node_modules/playwright');

async function button(page,label,touch=false){
 const p=await page.evaluate(label=>{
  const game=window.jadeDebug.game;
  const find=n=>{if(n.label?.text===label)return n;for(let i=0;i<n.numChildren;i++){const b=find(n.getChildAt(i));if(b)return b}return null};
  const b=find(game.root);if(!b)throw Error('Button not found: '+label);
  const q=b.localToGlobal(new Laya.Point(b.width/2,b.height/2));
  const r=document.querySelector('canvas').getBoundingClientRect();
  return{x:r.left+q.x*r.width/720,y:r.top+q.y*r.height/Laya.stage.height};
 },label);
 if(touch)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);
}

async function run(browser,viewport,touch,allLevels){
 const context=await browser.newContext({viewport,hasTouch:touch,isMobile:touch});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.stack||e.message));
 page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text())});
 await page.goto('http://127.0.0.1:8080/?debug',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>!!window.jadeDebug?.game,{timeout:30000});
 await page.screenshot({path:'.qa/results/'+(touch?'mobile':'desktop')+'-home-v02.png'});
 await button(page,'入境解镯',touch);
 await page.waitForFunction(()=>window.jadeDebug.game.modalOpen);
 await button(page,'开始转动 B',touch);
 await page.waitForFunction(()=>!window.jadeDebug.game.modalOpen);
 await page.screenshot({path:'.qa/results/'+(touch?'mobile':'desktop')+'-level1-v02.png'});
 const points=await page.evaluate(()=>{
  const g=window.jadeDebug.game,C=window.jadeDebug.Core,r=C.ring(g.model.state,'B');
  const rect=document.querySelector('canvas').getBoundingClientRect(),out=[];
  for(let a=r.a;a<=r.a+125;a+=5){
   const p=g.board.toScreen(C.point(r,a));
   out.push({x:rect.left+p.x*rect.width/720,y:rect.top+p.y*rect.height/Laya.stage.height});
  }
  return out;
 });
 if(touch){
  const cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...points[0],id:1}]});
  for(const p of points.slice(1)){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...p,id:1}]});await page.waitForTimeout(20)}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }else{
  await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();
  for(const p of points.slice(1)){await page.mouse.move(p.x,p.y);await page.waitForTimeout(20)}
  await page.mouse.up();
 }
 await page.waitForFunction(()=>window.jadeDebug.game.settled,{timeout:12000});
 assert.equal(await page.evaluate(()=>window.jadeDebug.game.save.data.unlocked),1);
 console.log((touch?'Mobile touch':'Desktop pointer')+' cleared level 1 using real browser input.');
 if(allLevels){
  for(let i=1;i<10;i++){
   await button(page,'进入第 '+(i+1)+' 境',touch);
   await page.waitForFunction(i=>window.jadeDebug.game.model.state.index===i,i);
   if(i===4||i===9)await page.screenshot({path:'.qa/results/mobile-level'+(i+1)+'-v02.png'});
   await button(page,'演示',touch);
   await page.waitForFunction(()=>window.jadeDebug.game.settled,null,{timeout:60000});
   const s=await page.evaluate(()=>window.jadeDebug.getState());
   assert.ok(s.rings.every(r=>r.life==='removed'),'Level '+(i+1)+' must clear');
   console.log('Real UI progression and legal demo: level '+(i+1)+' cleared.');
  }
 }
 await button(page,'再解一次',touch);
 await page.waitForFunction(()=>window.jadeDebug.game.model.state.steps===0&&!window.jadeDebug.game.modalOpen);
 await page.screenshot({path:'.qa/results/'+(touch?'mobile':'desktop')+'.png'});
 await context.close();
 assert.deepEqual(errors,[],'Browser errors');
}
(async()=>{
 fs.mkdirSync('.qa/results',{recursive:true});
 const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 try{
  await run(browser,{width:720,height:1280},false,false);
  await run(browser,{width:390,height:844},true,true);
  console.log('Browser verification passed.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
