import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '/opt/verification/node_modules/playwright-core/index.mjs';
import {newProject,makeWidget} from './src/core.mjs';
import {ensurePages} from './src/pages.mjs';

// Synthetic fixtures only: this server cannot reach Home Assistant or devices.
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'dist');
const projectKey='cyd-atelier.project.v1',designKey='cyd-atelier.designs.v1';
const entities=[
 {entity_id:'sensor.fixture_temperature',state:'25',attributes:{friendly_name:'Testtemperatur',unit_of_measurement:'°C',device_class:'temperature'}},
 {entity_id:'sensor.fixture_duration',state:'125',attributes:{friendly_name:'Testdauer',unit_of_measurement:'s'}},
 {entity_id:'binary_sensor.fixture_ready',state:'on',attributes:{friendly_name:'Testbereit'}},
 {entity_id:'light.fixture_lamp',state:'off',attributes:{friendly_name:'Testlicht'}}
];
const project=newProject();project.title='Layout-Prüfung';project.entities=entities;project.grid=false;project.pages=[];
project.widgets=[
 makeWidget({label:'Layout A',entity:entities[0].entity_id,x:10,y:15,w:50,h:30,icon:'',padding:4,nameSize:10,valueSize:14}),
 makeWidget({label:'Layout B',entity:entities[0].entity_id,x:100,y:70,w:70,h:40,icon:'',padding:4,nameSize:10,valueSize:14}),
 makeWidget({label:'Layout C',entity:entities[0].entity_id,x:240,y:150,w:60,h:50,icon:'',padding:4,nameSize:10,valueSize:14}),
 makeWidget({kind:'text',label:'Fest',show:'name',x:230,y:5,w:60,h:30,icon:'',locked:true}),
 makeWidget({kind:'list',label:'Testliste',x:10,y:100,w:190,h:130,icon:'',padding:6,rowHeight:32,rowGap:4,nameSize:10,valueSize:12,items:entities.slice(0,3).map(e=>({entity:e.entity_id,label:e.attributes.friendly_name,precision:0,show:'both',icon:''}))})
];ensurePages(project);
const empty=structuredClone(project);empty.widgets=[];empty.pages=[];ensurePages(empty);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.txt':'text/plain'};
const requests=[],clients=new Set(),errors=[],externalRequests=[];
const server=http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;requests.push({method:req.method,path:pathname});
 if(pathname==='/api/ha/events'){
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
  res.write(`event: snapshot\ndata: ${JSON.stringify({connected:true,message:'Synthetische Verbindung',entities})}\n\n`);
  clients.add(res);req.on('close',()=>clients.delete(res));return;
 }
 if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
 const relative=pathname==='/'?'index.html':pathname.slice(1),file=path.resolve(root,relative);
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 try{res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(await fs.readFile(file));}
 catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking']});
async function freshPage(context,fixture=project){
 const page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{if(route.request().url().startsWith(origin+'/'))return route.continue();externalRequests.push(route.request().url());return route.abort();});
 await page.addInitScript(({fixture,projectKey,designKey})=>{localStorage.setItem(projectKey,JSON.stringify(fixture));localStorage.removeItem(designKey);Object.defineProperty(crypto,'randomUUID',{configurable:true,value:undefined});},{fixture,projectKey,designKey});
 await page.goto(origin);await page.waitForSelector('#addAdvancedWidget');await page.waitForFunction(()=>document.querySelector('#previewMode')?.textContent==='LIVE-WERTE');return page;
}
const stored=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),projectKey);
const byLabel=(p,label)=>p.widgets.find(widget=>widget.label===label);
async function select(page,label,modifiers=[]){const id=await page.locator('[data-layer]').evaluateAll((rows,label)=>rows.find(row=>row.querySelector('.layer-name')?.textContent===label)?.dataset.layer,label);assert.ok(id,`Widget ${label} exists`);await page.locator(`[data-layer="${id}"]`).click({modifiers});return id;}
async function field(page,key,value){const input=page.locator(`[data-w="${key}"]`);const tag=await input.evaluate(el=>el.tagName),type=await input.getAttribute('type');if(tag==='SELECT')await input.selectOption(String(value));else if(type==='checkbox')await input.setChecked(!!value);else await input.fill(String(value));await input.blur();}
async function layoutAction(page,action){await page.locator('#alignToolsBtn').click();await page.locator(`#modal [data-layout-action="${action}"]`).click();await page.locator('#modal [data-close]').first().click();}
async function chooseEntity(page,id){await page.locator('#chooseEntity').click();await page.locator(`[data-eid="${id}"]`).click();}
async function overflow(page){const result=await page.evaluate(()=>{const inspector=document.querySelector('#inspectorContent'),modal=document.querySelector('#modal');return{document:document.documentElement.scrollWidth>innerWidth+1,inspector:inspector.scrollWidth>inspector.clientWidth+1,modal:modal.open&&modal.scrollWidth>modal.clientWidth+1};});assert.deepEqual(result,{document:false,inspector:false,modal:false},'Document, settings and dialogs fit horizontally');}
async function addAdvanced(page,kind){await page.locator('#addAdvancedWidget').click();await page.locator(`[data-add-kind="${kind}"]`).click();assert.equal((await stored(page)).widgets.at(-1).kind,kind);}
function broadcastEntity(entity){for(const client of clients)client.write(`event: state\ndata: ${JSON.stringify({entity})}\n\n`);}

try{
 const desktop=await browser.newContext({viewport:{width:1440,height:1000}});
 let page=await freshPage(desktop);
 // Group commands act on selected geometry and keep locked widgets still.
 await select(page,'Layout A');await select(page,'Layout B',['Shift']);await select(page,'Layout C',['Shift']);await select(page,'Fest',['Shift']);
 await layoutAction(page,'left');let p=await stored(page);
 assert.deepEqual(['Layout A','Layout B','Layout C'].map(label=>byLabel(p,label).x),[10,10,10]);assert.equal(byLabel(p,'Fest').x,230);
 await page.locator('#undoBtn').click();p=await stored(page);assert.equal(byLabel(p,'Layout B').x,100,'group alignment is undoable');
 await layoutAction(page,'center');p=await stored(page);const centers=['Layout A','Layout B','Layout C'].map(label=>{const w=byLabel(p,label);return w.x+w.w/2;});assert.ok(centers.every(x=>x===centers[0]));
 await page.locator('#undoBtn').click();await layoutAction(page,'width');p=await stored(page);assert.deepEqual(['Layout A','Layout B','Layout C'].map(label=>byLabel(p,label).w),[50,50,50]);assert.equal(byLabel(p,'Fest').w,60);
 await page.locator('#undoBtn').click();await layoutAction(page,'horizontal');p=await stored(page);const [a,b,c]=['Layout A','Layout B','Layout C'].map(label=>byLabel(p,label));assert.equal(b.x-a.x-a.w,c.x-b.x-b.w);assert.equal(a.x,10);assert.equal(c.x+c.w,300);
 await page.close();

 page=await freshPage(desktop);await select(page,'Layout A');await field(page,'locked',true);p=await stored(page);const locked=byLabel(p,'Layout A');
 const target=page.locator(`[data-widget="${locked.id}"]`);await target.focus();await page.keyboard.press('ArrowRight');assert.equal(byLabel(await stored(page),'Layout A').x,locked.x);
 const box=await target.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+30,box.y+box.height/2+20,{steps:5});await page.mouse.up();
 assert.deepEqual([byLabel(await stored(page),'Layout A').x,byLabel(await stored(page),'Layout A').y],[locked.x,locked.y],'locked widgets resist pointer movement');
 assert.equal(await page.locator(`[data-widget="${locked.id}"] .resize-handle`).count(),0);await field(page,'locked',false);
 await field(page,'color','#27aa66');await field(page,'nameAlign','right');await field(page,'valueAlign','center');await field(page,'valign','bottom');await field(page,'borderWidth',2);await page.locator('#copyStyle').click();
 const beforePaste=byLabel(await stored(page),'Layout B');await select(page,'Layout B');await field(page,'locked',true);await page.locator('#pasteStyle').click();const pasted=byLabel(await stored(page),'Layout B');assert.equal(pasted.locked,true,'style paste keeps a position lock active');
 assert.deepEqual([pasted.nameAlign,pasted.valueAlign,pasted.valign,pasted.color,pasted.borderWidth],['right','center','bottom','#27aa66',2]);
 assert.deepEqual([pasted.label,pasted.entity,pasted.x,pasted.y,pasted.w,pasted.h],[beforePaste.label,beforePaste.entity,beforePaste.x,beforePaste.y,beforePaste.w,beforePaste.h],'style paste keeps data and geometry');
 await field(page,'locked',false);
 await select(page,'Layout A');await field(page,'w',150);await field(page,'h',100);await field(page,'valign','top');let positions=await page.locator(`[data-widget="${locked.id}"] .widget-text`).evaluateAll(elements=>elements.map(el=>({left:parseFloat(el.style.left),top:parseFloat(el.style.top)})));
 assert.ok(positions[0].left>positions[1].left,'name and value use separate horizontal alignments');const top=positions[0].top;await field(page,'valign','bottom');positions=await page.locator(`[data-widget="${locked.id}"] .widget-text`).evaluateAll(elements=>elements.map(el=>({top:parseFloat(el.style.top)})));assert.ok(positions[0].top>top,'bottom alignment moves the content down');
 await select(page,'Testliste');await field(page,'listStyle','lines');assert.equal(byLabel(await stored(page),'Testliste').listStyle,'lines');assert.ok(await page.locator('.list-preview-row').first().evaluate(el=>parseFloat(getComputedStyle(el).borderBottomWidth)>0),'list lines appear in preview');
 await field(page,'listStyle','zebra');await field(page,'rowAlternateBg','#354b63');p=await stored(page);assert.equal(byLabel(p,'Testliste').rowAlternateBg,'#354b63');assert.equal(await page.locator('.list-preview-row').nth(1).evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(53, 75, 99)','zebra rows have individual backgrounds');
 await field(page,'nameAlign','center');await field(page,'valueAlign','left');await field(page,'rowValign','bottom');p=await stored(page);assert.deepEqual([byLabel(p,'Testliste').nameAlign,byLabel(p,'Testliste').valueAlign,byLabel(p,'Testliste').rowValign],['center','left','bottom']);await overflow(page);await page.close();

 page=await freshPage(desktop,empty);
 for(const kind of ['status','bar','ring','clock','timer','button']){
  await addAdvanced(page,kind);
  if(!['clock','button'].includes(kind))await chooseEntity(page,kind==='status'?entities[2].entity_id:kind==='timer'?entities[1].entity_id:entities[0].entity_id);
  await field(page,'label',`Prüfung ${kind}`);
 }
 p=await stored(page);assert.deepEqual(p.widgets.map(w=>w.kind),['status','bar','ring','clock','timer','button']);
 await select(page,'Prüfung status');await page.locator('#stateRulesBtn').click();await page.locator('#addStateRule').click();await page.locator('[data-rule-field="color"]').fill('#19c778');await page.locator('[data-rule-field="bg"]').fill('#173f30');await page.locator('[data-rule-field="icon"]').fill('mdi:coffee');await page.locator('#applyStateRules').click();
 const status=byLabel(await stored(page),'Prüfung status');assert.equal(status.rules[0].value,'on');assert.equal(await page.locator(`[data-widget="${status.id}"] .advanced-value`).evaluate(el=>getComputedStyle(el).color),'rgb(25, 199, 120)');assert.equal(await page.locator(`[data-widget="${status.id}"] > .widget-background`).evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(23, 63, 48)');
 const originalBg=await page.evaluate(color=>{const probe=document.createElement('div');probe.style.backgroundColor=color;return probe.style.backgroundColor;},status.bg);
 broadcastEntity({...entities[2],state:'off'});await page.waitForFunction(id=>document.querySelector(`[data-widget="${id}"] .advanced-value`)?.textContent==='Aus',status.id);assert.equal(await page.locator(`[data-widget="${status.id}"] > .widget-background`).evaluate(el=>getComputedStyle(el).backgroundColor),originalBg,'live rule mismatch restores the original frame background');
 broadcastEntity(entities[2]);await page.waitForFunction(id=>document.querySelector(`[data-widget="${id}"] .advanced-value`)?.textContent==='An',status.id);assert.equal(await page.locator(`[data-widget="${status.id}"] > .widget-background`).evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(23, 63, 48)','live rule match refreshes the frame background');
 await select(page,'Prüfung bar');await field(page,'minValue',0);await field(page,'maxValue',100);const bar=byLabel(await stored(page),'Prüfung bar');assert.equal(await page.locator(`[data-widget="${bar.id}"] .advanced-bar:not(.widget-content) > div`).evaluate(el=>el.style.width),'25%');
 await select(page,'Prüfung ring');await field(page,'minValue',0);await field(page,'maxValue',50);const ring=byLabel(await stored(page),'Prüfung ring');const ringRatio=await page.locator(`[data-widget="${ring.id}"] .advanced-ring circle`).last().evaluate(el=>Number(el.getAttribute('stroke-dashoffset'))/Number(el.getAttribute('stroke-dasharray')));assert.ok(Math.abs(ringRatio-.5)<.001);
 const timer=byLabel(await stored(page),'Prüfung timer');assert.equal(await page.locator(`[data-widget="${timer.id}"] .advanced-value`).textContent(),'02:05');
 await select(page,'Prüfung button');await field(page,'actionService','light.toggle');await field(page,'actionEntity',entities[3].entity_id);const button=byLabel(await stored(page),'Prüfung button');await page.locator(`[data-widget="${button.id}"]`).click({position:{x:20,y:35}});assert.equal(requests.filter(req=>req.method==='POST').length,0,'preview touch buttons never perform service calls');
 // Arrange a compact fixture view for desktop and mobile visual inspection.
 const rectangles={status:[8,8,144,66],bar:[168,8,144,66],clock:[8,84,144,62],ring:[180,84,112,112],timer:[8,160,144,62],button:[168,204,144,28]};
 for(const kind of ['status','bar','ring','clock','timer','button']){await select(page,`Prüfung ${kind}`);const rect=Object.fromEntries(['x','y','w','h'].map((key,index)=>[key,rectangles[kind][index]]));for(const key of ['w','h','x','y'])await field(page,key,rect[key]);await field(page,'nameSize',10);await field(page,'valueSize',18);await field(page,'iconSize',14);await field(page,'padding',6);}
 await select(page,'Prüfung status');await overflow(page);await page.locator('#stage').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/cyd-atelier-features-desktop.png',fullPage:false});
 const advancedFixture=await stored(page);
 await page.locator('#pageSettingsBtn').click();await page.locator('#addPage').click();await page.locator('#pageSeconds').fill('12');await page.locator('#pageTouch').check();await page.locator('#clockTimezone').fill('UTC');await page.locator('#applyPages').click();
 p=await stored(page);assert.equal(p.pages.length,2);assert.equal(p.widgets.length,0);assert.deepEqual([p.pageSeconds,p.pageTouch,p.timezone],[12,true,'UTC']);const firstPage=p.pages[0].id,secondPage=p.pages[1].id;
 await addAdvanced(page,'clock');await field(page,'label','Zweite Seite');await field(page,'x',50);await field(page,'y',40);const landscape=byLabel(await stored(page),'Zweite Seite');
 await page.locator('[data-orientation="portrait"]').click();await field(page,'x',37);await field(page,'y',71);const portrait=byLabel(await stored(page),'Zweite Seite');await page.locator('[data-orientation="landscape"]').click();let current=byLabel(await stored(page),'Zweite Seite');assert.deepEqual([current.x,current.y,current.w,current.h],[landscape.x,landscape.y,landscape.w,landscape.h],'landscape geometry restores independently');
 await page.locator('[data-orientation="portrait"]').click();current=byLabel(await stored(page),'Zweite Seite');assert.deepEqual([current.x,current.y,current.w,current.h],[portrait.x,portrait.y,portrait.w,portrait.h],'portrait geometry restores independently');
 await page.locator(`[data-page="${firstPage}"]`).click();p=await stored(page);assert.equal(p.widgets.length,6,'switching pages restores its widgets');await page.locator(`[data-page="${secondPage}"]`).click();assert.equal((await stored(page)).widgets[0].label,'Zweite Seite');
 await page.locator('#projectFileBtn').click();await page.locator('#designName').fill('Alle Seiten');await page.locator('#saveNamedDesign').click();assert.equal(await page.locator('#modalError').textContent(),'');const designs=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),designKey);assert.equal(designs.designs.length,1);const saved=designs.designs[0].project;assert.equal(saved.pages.length,2);assert.equal(saved.pages[0].widgets.length,6);assert.equal(saved.pages[1].widgets.length,1);assert.ok(saved.pages[1].layouts.landscape&&saved.pages[1].layouts.portrait);await page.locator('#modal [data-close]').first().click();
 await field(page,'label','Geändert');await page.locator('#projectFileBtn').click();await page.locator('[data-load-design]').click();p=await stored(page);assert.equal(p.widgets[0].label,'Zweite Seite');assert.equal(p.pages.length,2);assert.deepEqual([p.pageSeconds,p.pageTouch,p.timezone],[12,true,'UTC']);await page.close();await desktop.close();

 const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 page=await freshPage(mobile,advancedFixture);await select(page,'Prüfung status');await overflow(page);await page.locator('#addAdvancedWidget').click();await overflow(page);await page.locator('#modal [data-close]').first().click();await page.locator('#pageSettingsBtn').click();await overflow(page);await page.locator('#modal [data-close]').first().click();await page.locator('#stage').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/cyd-atelier-features-mobile.png',fullPage:false});
 await page.locator('#multiSelectBtn').click();const widgetIds=await page.locator('[data-layer]').evaluateAll(rows=>rows.map(row=>row.dataset.layer));await page.locator(`[data-widget="${widgetIds[0]}"]`).tap({position:{x:12,y:20}});assert.equal(await page.locator('[data-widget].selected').count(),0,'touch can toggle an existing selection off');await page.locator(`[data-widget="${widgetIds[0]}"]`).tap({position:{x:12,y:20}});await page.locator(`[data-widget="${widgetIds[1]}"]`).tap({position:{x:12,y:20}});assert.equal(await page.locator('[data-widget].selected').count(),2,'touch supports multiple selection');await overflow(page);await page.close();await mobile.close();
 assert.deepEqual(errors,[],'No browser JavaScript errors');assert.deepEqual(externalRequests,[],'No requests leave the fixture server');assert.equal(requests.filter(req=>req.method!=='GET').length,0,'editor interactions are read only toward the server');
 console.log('PASS advanced widgets, state rules, bars/rings/timers, inert preview buttons, group alignment/size/spacing, locks, independent text alignment, list styles, style transfer, pages, per-orientation geometry, full design roundtrip, desktop/mobile overflow and touch multiselection.');
 console.log('Screenshots: /tmp/cyd-atelier-features-desktop.png /tmp/cyd-atelier-features-mobile.png');
}finally{await browser.close();for(const client of clients)client.end();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
