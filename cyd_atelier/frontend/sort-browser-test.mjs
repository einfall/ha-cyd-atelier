import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '/opt/verification/node_modules/playwright-core/index.mjs';
import {newProject,makeWidget} from './src/core.mjs';

// All browser data is synthetic. The server has no connection to Home Assistant.
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'dist');
const projectKey='cyd-atelier.project.v1',designsKey='cyd-atelier.designs.v1';
const labels=Array.from({length:12},(_,i)=>`Zeile ${String(i+1).padStart(2,'0')}`);
const entities=labels.map((label,i)=>({entity_id:`sensor.test_${i+1}`,state:String(i+1),attributes:{friendly_name:label,unit_of_measurement:'°C'}}));
const project=newProject();project.title='Sortiertest';project.entities=entities;
project.widgets=[makeWidget({kind:'list',label:'Entitäten sortieren',x:8,y:8,w:304,h:224,padding:8,rowHeight:30,rowGap:4,items:entities.map(e=>({entity:e.entity_id,label:e.attributes.friendly_name,icon:'mdi:thermometer',unit:'°C',show:'both',precision:0}))})];
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.txt':'text/plain'};
const requests=[],sseClients=new Set();
const server=http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;requests.push(pathname);
 if(pathname==='/api/ha/events'){
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
  res.write(`event: snapshot\ndata: ${JSON.stringify({connected:true,message:'Synthetische Testverbindung',entities})}\n\n`);
  sseClients.add(res);req.on('close',()=>sseClients.delete(res));return;
 }
 if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
 const relative=pathname==='/'?'index.html':pathname.slice(1),file=path.resolve(root,relative);
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 try{const body=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(body);}
 catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking']});
const errors=[],externalRequests=[];
async function freshPage(context){
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{if(route.request().url().startsWith(origin+'/'))return route.continue();externalRequests.push(route.request().url());return route.abort();});
 await page.addInitScript(({project,projectKey})=>{
  localStorage.setItem(projectKey,JSON.stringify(project));
  Object.defineProperty(crypto,'randomUUID',{configurable:true,value:undefined});
  document.addEventListener('pointerdown',e=>{window.__testPointerId=e.pointerId;},true);
 },{project,projectKey});
 await page.goto(origin);await page.waitForSelector('[data-list-drag="0"]');
 await page.waitForFunction(()=>document.querySelector('#previewMode')?.textContent==='LIVE-WERTE');
 assert.equal(await page.evaluate(()=>typeof crypto.randomUUID),'undefined');
 assert.equal(await page.locator('[data-list-drag]').count(),labels.length);
 return page;
}
const stored=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),projectKey);
const order=async page=>(await stored(page)).widgets[0].items.map(item=>item.label);
const domOrder=page=>page.locator('.list-item-controls > .list-item-control').evaluateAll(rows=>rows.map(row=>row.querySelector('.list-row-edit b').textContent));
async function assertClean(page){assert.equal(await page.locator('.list-drag-ghost,.list-sort-source').count(),0);assert.equal(await page.locator('#modal').evaluate(el=>el.open),false);}
async function typography(page){
 const sizes=await page.locator('#inspectorContent').evaluate(el=>({label:parseFloat(getComputedStyle(el.querySelector('.form-field > span')).fontSize),input:parseFloat(getComputedStyle(el.querySelector('[data-w="label"]')).fontSize),row:parseFloat(getComputedStyle(el.querySelector('.list-row-edit')).fontSize)}));
 assert.ok(sizes.label>=14,`Settings label must be >=14px, got ${sizes.label}`);
 assert.ok(sizes.input>=16,`Settings input must be >=16px, got ${sizes.input}`);
 assert.ok(sizes.row>=14,`List label must be >=14px, got ${sizes.row}`);
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
 assert.equal(overflow,false,'Settings must fit the viewport horizontally');
}
async function mouseLift(page,from=0,to=2){
 const handle=page.locator(`[data-list-drag="${from}"]`);await handle.scrollIntoViewIfNeeded();
 const a=await handle.boundingBox(),b=await page.locator(`[data-list-index="${to}"]`).boundingBox();
 assert.ok(a&&b);const x=a.x+a.width/2,y=a.y+a.height/2,targetY=b.y+b.height*.8;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+9,y+9,{steps:3});
 await page.waitForSelector('.list-drag-ghost');await page.mouse.move(x,targetY,{steps:12});
 await page.waitForFunction(expected=>[...document.querySelectorAll('.list-item-controls > .list-item-control')].map(row=>row.querySelector('.list-row-edit b').textContent).join('|')===expected,['Zeile 02','Zeile 03','Zeile 01',...labels.slice(3)].join('|'));
 assert.deepEqual(await order(page),labels,'Dragging must not save before dropping');
 return {x,y};
}
async function touchLift(page,session,from=0,to=2){
 const handle=page.locator(`[data-list-drag="${from}"]`);await handle.scrollIntoViewIfNeeded();
 const a=await handle.boundingBox(),b=await page.locator(`[data-list-index="${to}"]`).boundingBox();
 assert.ok(a&&b);const x=a.x+a.width/2,y=a.y+a.height/2,targetY=b.y+b.height*.8;
 await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+9,y:y+9}]});
 await page.waitForSelector('.list-drag-ghost');
 for(let i=1;i<=12;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+(targetY-y)*i/12}]});
 await page.waitForFunction(expected=>[...document.querySelectorAll('.list-item-controls > .list-item-control')].map(row=>row.querySelector('.list-row-edit b').textContent).join('|')===expected,['Zeile 02','Zeile 03','Zeile 01',...labels.slice(3)].join('|'));
 assert.deepEqual(await order(page),labels,'Touch dragging must not save before dropping');
 return {x,y};
}
try{
 const desktop=await browser.newContext({viewport:{width:1440,height:1000}});
 let page=await freshPage(desktop);await typography(page);
 // A click without a move must not create undo history or open a row dialog.
 await page.locator('[data-list-drag="0"]').click();await assertClean(page);assert.equal(await page.locator('#undoBtn').isDisabled(),true);assert.deepEqual(await order(page),labels);
 await mouseLift(page);await page.mouse.up();await assertClean(page);
 assert.deepEqual(await order(page),['Zeile 02','Zeile 03','Zeile 01',...labels.slice(3)]);
 await page.screenshot({path:'/tmp/cyd-atelier-desktop.png',fullPage:false});
 await page.locator('#undoBtn').click();assert.deepEqual(await order(page),labels);assert.equal(await page.locator('#undoBtn').isDisabled(),true,'A completed drag is exactly one undo step');
 await page.locator('#redoBtn').click();assert.deepEqual(await order(page),['Zeile 02','Zeile 03','Zeile 01',...labels.slice(3)]);await page.close();

 page=await freshPage(desktop);await mouseLift(page);await page.keyboard.press('Escape');await page.mouse.up();await assertClean(page);assert.deepEqual(await domOrder(page),labels);assert.deepEqual(await order(page),labels);assert.equal(await page.locator('#undoBtn').isDisabled(),true);
 await mouseLift(page);await page.evaluate(()=>document.querySelector('#inspectorContent').dispatchEvent(new PointerEvent('pointercancel',{pointerId:window.__testPointerId,bubbles:true})));await page.mouse.up();await assertClean(page);assert.deepEqual(await domOrder(page),labels);assert.deepEqual(await order(page),labels);assert.equal(await page.locator('#undoBtn').isDisabled(),true);
 await page.locator('[data-list-drag="0"]').focus();await page.keyboard.press('ArrowDown');assert.deepEqual(await order(page),['Zeile 02','Zeile 01',...labels.slice(2)]);
 await page.keyboard.press('ArrowUp');assert.deepEqual(await order(page),labels);await page.close();

 page=await freshPage(desktop);
 const h=page.locator('[data-list-drag="0"]');await h.scrollIntoViewIfNeeded();const hb=await h.boundingBox(),ib=await page.locator('.inspector').boundingBox();
 const beforeScroll=await page.locator('.inspector').evaluate(el=>el.scrollTop);
 await page.mouse.move(hb.x+hb.width/2,hb.y+hb.height/2);await page.mouse.down();await page.mouse.move(hb.x+hb.width/2+9,hb.y+hb.height/2+9);await page.waitForSelector('.list-drag-ghost');
 await page.mouse.move(hb.x+hb.width/2,Math.min(995,ib.y+ib.height-8),{steps:10});
 await page.waitForFunction(before=>document.querySelector('.inspector').scrollTop>before+30,beforeScroll,{timeout:4000});
 await page.keyboard.press('Escape');await page.mouse.up();await assertClean(page);assert.deepEqual(await order(page),labels);assert.equal(await page.locator('#undoBtn').isDisabled(),true);await page.close();

 // The browser really has no randomUUID method; this exercises both save and duplication paths.
 page=await freshPage(desktop);await page.locator('#projectFileBtn').click();await page.locator('#designName').fill('HTTP-kompatibles Design');await page.locator('#saveNamedDesign').click();
 const designs=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),designsKey);assert.equal(designs.designs.length,1);assert.equal(designs.designs[0].name,'HTTP-kompatibles Design');assert.ok(designs.designs[0].id);
 assert.equal(await page.locator('#modalError').textContent(),'');await page.locator('[data-close]').first().click();await page.locator('#duplicateBtn').click();
 const duplicate=await stored(page);assert.equal(duplicate.widgets.length,2);assert.notEqual(duplicate.widgets[0].id,duplicate.widgets[1].id);assert.deepEqual(duplicate.widgets[0].items,duplicate.widgets[1].items);await page.close();await desktop.close();

 const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 page=await freshPage(mobile);await typography(page);let session=await mobile.newCDPSession(page);
 await touchLift(page,session);await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await assertClean(page);
 assert.deepEqual(await order(page),['Zeile 02','Zeile 03','Zeile 01',...labels.slice(3)]);await page.locator('[data-list-drag="0"]').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/cyd-atelier-mobile.png',fullPage:false});
 await page.locator('#undoBtn').click();assert.deepEqual(await order(page),labels);assert.equal(await page.locator('#undoBtn').isDisabled(),true);await page.close();

 page=await freshPage(mobile);session=await mobile.newCDPSession(page);await touchLift(page,session);await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await assertClean(page);assert.deepEqual(await domOrder(page),labels);assert.deepEqual(await order(page),labels);assert.equal(await page.locator('#undoBtn').isDisabled(),true);
 const th=page.locator('[data-list-drag="0"]');await th.scrollIntoViewIfNeeded();const tb=await th.boundingBox(),scrollY=await page.evaluate(()=>window.scrollY);
 const tx=tb.x+tb.width/2,ty=tb.y+tb.height/2;await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tx,y:ty}]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tx+9,y:ty+9}]});await page.waitForSelector('.list-drag-ghost');
 await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tx,y:836}]});await page.waitForFunction(before=>window.scrollY>before+30,scrollY,{timeout:4000});await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await assertClean(page);assert.deepEqual(await order(page),labels);assert.equal(await page.locator('#undoBtn').isDisabled(),true);await page.close();await mobile.close();
 assert.deepEqual(errors,[],'No JavaScript errors');assert.deepEqual(externalRequests,[],'No external requests');assert.ok(requests.filter(p=>p==='/api/ha/events').length>=6);
 console.log('PASS Chromium desktop mouse and mobile touch: drag/drop persistence, single-step undo/redo, no-op, Escape/pointer cancellation, keyboard order, sidebar/page autoscroll, readable settings, randomUUID-free design save and duplication; synthetic local data only.');
 console.log('Screenshots: /tmp/cyd-atelier-desktop.png /tmp/cyd-atelier-mobile.png');
}finally{
 await browser.close();for(const client of sseClients)client.end();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
