import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '/opt/verification/node_modules/playwright-core/index.mjs';
import {newProject,makeWidget} from './src/core.mjs';
import {ensurePages,addPage,capturePage,changePage} from './src/pages.mjs';

// Isolated fixture server: no Home Assistant requests or device actions.
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'dist');
const projectKey='cyd-atelier.project.v1',designKey='cyd-atelier.designs.v1';
const fixture=newProject();
fixture.title='Seiten-Prüfung';fixture.entities=[];fixture.pages=[];fixture.widgets=[];
fixture.grid=false;fixture.guides=false;fixture.background='#101827';
fixture.widgets=[makeWidget({kind:'text',label:'Wohnzimmer',show:'name',x:16,y:16,w:150,h:54,icon:'',nameSize:20,padding:8})];
ensurePages(fixture);fixture.pages[0].name='Wohnzimmer';
addPage(fixture,'Küche');fixture.widgets=[makeWidget({kind:'text',label:'Küche',show:'name',x:16,y:16,w:150,h:54,icon:'',nameSize:20,padding:8})];
addPage(fixture,'Schlafzimmer');fixture.widgets=[makeWidget({kind:'text',label:'Schlafzimmer',show:'name',x:16,y:16,w:190,h:54,icon:'',nameSize:20,padding:8})];
capturePage(fixture);changePage(fixture,fixture.pages[0].id);
fixture.pageSeconds=0;fixture.pageSwitchMode='next';fixture.pageTouch=true;
fixture.pageIndicator={enabled:true,activeColor:'#ffffff',inactiveColor:'#69768b',background:'#101827'};
for(const page of fixture.pages)page.indicator='inherit';
const ids=fixture.pages.map(page=>page.id);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.txt':'text/plain'};
const requests=[],clients=new Set(),errors=[],externalRequests=[];
const server=http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;requests.push({method:req.method,path:pathname});
 if(pathname==='/api/ha/events'){
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
  res.write(`event: snapshot\ndata: ${JSON.stringify({connected:true,message:'Synthetische Verbindung',entities:[]})}\n\n`);
  clients.add(res);req.on('close',()=>clients.delete(res));return;
 }
 if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
 const file=path.resolve(root,pathname==='/'?'index.html':pathname.slice(1));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 try{res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(await fs.readFile(file));}
 catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking']});
async function freshPage(context,project=fixture){
 const page=await context.newPage();page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{if(route.request().url().startsWith(origin+'/'))return route.continue();externalRequests.push(route.request().url());return route.abort();});
 await page.addInitScript(({project,projectKey,designKey})=>{localStorage.setItem(projectKey,JSON.stringify(project));localStorage.removeItem(designKey);Object.defineProperty(crypto,'randomUUID',{configurable:true,value:undefined});},{project,projectKey,designKey});
 await page.goto(origin);await page.waitForSelector('#pageSettingsBtn');await page.waitForFunction(()=>document.querySelector('#previewMode')?.textContent==='LIVE-WERTE');
 return page;
}
const stored=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),projectKey);
const tab=(page,id)=>page.locator(`[data-page="${id}"]`);
const dot=(page,id)=>page.locator(`.page-preview-footer [data-preview-page="${id}"]`);
const modal=async page=>{await page.locator('#pageSettingsBtn').click();await page.locator('#pageSwitchMode').waitFor();};
const apply=async page=>{await page.locator('#applyPages').click();assert.equal(await page.locator('#modal').evaluate(el=>el.open),false,'valid page settings apply');};
async function overflow(page){
 const result=await page.evaluate(()=>{const inspector=document.querySelector('#inspectorContent'),dialog=document.querySelector('#modal');return{document:document.documentElement.scrollWidth>innerWidth+1,inspector:inspector.scrollWidth>inspector.clientWidth+1,modal:dialog.open&&dialog.scrollWidth>dialog.clientWidth+1};});
 assert.deepEqual(result,{document:false,inspector:false,modal:false},'page settings and preview fit the viewport');
}
function pagingData(project){return{pageSeconds:project.pageSeconds,pageSwitchMode:project.pageSwitchMode,pageTouch:project.pageTouch,pageIndicator:project.pageIndicator,pages:project.pages.map(({id,name,indicator})=>({id,name,indicator}))};}
async function checkDots(page,active,colors={active:'rgb(244, 169, 27)',inactive:'rgb(107, 123, 150)',background:'rgb(16, 24, 39)'}){
 assert.equal(await page.locator('.page-preview-footer [data-preview-page]').count(),3,'one dot per page');
 assert.equal(await page.locator('.page-preview-footer [aria-current="page"]').count(),1,'only the active page is marked');
 assert.equal(await dot(page,active).getAttribute('aria-current'),'page');
 assert.ok((await dot(page,active).getAttribute('aria-label'))?.length,'the active dot has an accessible page label');
 const styles=await page.locator('.page-preview-footer [data-preview-page]').evaluateAll(buttons=>buttons.map(button=>{const marker=button.querySelector('.page-preview-dot')||button.firstElementChild||button,style=getComputedStyle(marker),rect=marker.getBoundingClientRect();return{active:button.getAttribute('aria-current')==='page',width:rect.width,height:rect.height,color:style.backgroundColor};}));
 const bold=styles.find(style=>style.active),others=styles.filter(style=>!style.active);
 assert.ok(others.every(style=>bold.width>style.width&&bold.height>style.height),'the current page has a bolder, larger dot');
 assert.equal(bold.color,colors.active);assert.ok(others.every(style=>style.color===colors.inactive));
 assert.equal(await page.locator('.page-preview-footer').evaluate(el=>getComputedStyle(el).backgroundColor),colors.background);
}
async function swipe(context,page,start,end,y){
 const session=await context.newCDPSession(page);
 try{
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start,y,id:1}]});
  for(let i=1;i<=6;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start+(end-start)*i/6,y,id:1}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }finally{await session.detach();}
}

try{
 const desktop=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 let page=await freshPage(desktop);
 await modal(page);await page.locator('#pageSeconds').fill('7');await page.locator('#pageSwitchMode').selectOption('random');await page.locator('#pageTouch').check();await page.locator('#pageIndicatorEnabled').check();
 await page.locator('#pageIndicatorActiveColor').fill('#f4a91b');await page.locator('#pageIndicatorInactiveColor').fill('#6b7b96');await page.locator('#pageIndicatorBackground').fill('#101827');
 await page.locator(`[data-page-indicator="${ids[0]}"]`).selectOption('inherit');await page.locator(`[data-page-indicator="${ids[1]}"]`).selectOption('hide');await page.locator(`[data-page-indicator="${ids[2]}"]`).selectOption('show');
 await overflow(page);await page.screenshot({path:'/tmp/cyd-atelier-paging-settings.png',fullPage:false});await apply(page);
 let project=await stored(page);assert.deepEqual([project.pageSeconds,project.pageSwitchMode,project.pageTouch],[7,'random',true]);
 assert.deepEqual(project.pageIndicator,{enabled:true,activeColor:'#f4a91b',inactiveColor:'#6b7b96',background:'#101827'});
 assert.deepEqual(project.pages.map(page=>page.indicator),['inherit','hide','show']);await checkDots(page,ids[0]);
 await dot(page,ids[1]).click();assert.equal((await stored(page)).activePage,ids[1]);assert.equal(await page.locator('.page-preview-footer').count(),0,'a page can hide the global indicator');
 await tab(page,ids[2]).click();await checkDots(page,ids[2]);await dot(page,ids[0]).click();assert.equal((await stored(page)).activePage,ids[0]);await checkDots(page,ids[0]);
 // Automatic cycling applies to firmware only. Waiting beyond the configured interval must leave the editor stable.
 await page.waitForTimeout(7200);assert.equal((await stored(page)).activePage,ids[0],'device auto-rotation does not switch an actively edited page');
 await modal(page);assert.equal(await page.locator('#pageSwitchMode').inputValue(),'random');await page.locator('#pageSwitchMode').selectOption('next');await page.locator('#pageSeconds').fill('13');await page.locator('#pageIndicatorEnabled').uncheck();await apply(page);
 project=await stored(page);assert.deepEqual([project.pageSeconds,project.pageSwitchMode],[13,'next']);assert.equal(await page.locator('.page-preview-footer').count(),0,'global off hides inherited page indicators');
 await tab(page,ids[2]).click();await checkDots(page,ids[2]);await overflow(page);await page.locator('#stage').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/cyd-atelier-paging-desktop.png',fullPage:false});
 const beforeSave=pagingData(await stored(page));
 await page.locator('#projectFileBtn').click();await page.locator('#designName').fill('Drei Seiten mit Punkten');await page.locator('#saveNamedDesign').click();assert.equal(await page.locator('#modalError').textContent(),'');
 const designs=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),designKey);assert.equal(designs.designs.length,1);assert.deepEqual(pagingData(designs.designs[0].project),beforeSave,'saved designs retain all paging settings and per-page overrides');
 await page.locator('#modal [data-close]').first().click();await modal(page);await page.locator('#pageIndicatorEnabled').check();await page.locator('#pageSwitchMode').selectOption('random');await page.locator('#pageSeconds').fill('22');await apply(page);
 await page.locator('#projectFileBtn').click();await page.locator('[data-load-design]').click();assert.deepEqual(pagingData(await stored(page)),beforeSave,'loading a design restores paging settings');
 await page.locator('#projectFileBtn').click();await page.locator('.design-file-options summary').click();
 const downloaded=page.waitForEvent('download');await page.locator('#saveProjectFile').click();const download=await downloaded;const downloadedProject=JSON.parse(await fs.readFile(await download.path(),'utf8'));assert.deepEqual(pagingData(downloadedProject),beforeSave,'project-file export retains paging settings');
 await page.locator('#modal [data-close]').first().click();await modal(page);await page.locator('#pageSeconds').fill('31');await apply(page);
 await page.locator('#projectFileBtn').click();await page.locator('.design-file-options summary').click();const chooser=page.waitForEvent('filechooser');await page.locator('#openProjectFile').click();await(await chooser).setFiles({name:'fixture.cyd.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(downloadedProject))});
 await page.waitForFunction(()=>!document.querySelector('#modal')?.open);assert.deepEqual(pagingData(await stored(page)),beforeSave,'project-file import restores global and per-page paging settings');
 await page.close();await desktop.close();

 const mobileFixture=structuredClone(downloadedProject);mobileFixture.pageTouch=true;mobileFixture.pageSeconds=5;mobileFixture.pageSwitchMode='random';mobileFixture.pageIndicator.enabled=true;for(const entry of mobileFixture.pages)entry.indicator='inherit';changePage(mobileFixture,ids[0]);
 const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 page=await freshPage(mobile,mobileFixture);await page.locator('#stage').scrollIntoViewIfNeeded();await checkDots(page,ids[0]);await overflow(page);await page.screenshot({path:'/tmp/cyd-atelier-paging-mobile.png',fullPage:false});
 await dot(page,ids[2]).tap();assert.equal((await stored(page)).activePage,ids[2],'mobile dot taps choose the requested page');await dot(page,ids[0]).tap();
 let screen=await page.locator('#screen').boundingBox();const y=screen.y+screen.height*.68,left=screen.x+screen.width*.2,right=screen.x+screen.width*.8;
 await swipe(mobile,page,right,left,y);assert.equal((await stored(page)).activePage,ids[1],'left swipe advances to the next page');
 await swipe(mobile,page,left,right,y);assert.equal((await stored(page)).activePage,ids[0],'right swipe returns to the previous page');
 await swipe(mobile,page,left,right,y);assert.equal((await stored(page)).activePage,ids[2],'right swipe wraps from first to last page');
 const footer=await page.locator('.page-preview-footer').boundingBox();await swipe(mobile,page,right,left,footer.y+footer.height/2);assert.equal((await stored(page)).activePage,ids[0],'swiping over the dots advances without also firing a dot tap');
 const beforeDrag=await stored(page),widget=beforeDrag.widgets[0],widgetBox=await page.locator(`[data-widget="${widget.id}"]`).boundingBox();
 // Keep the start below the selected widget's edit/duplicate controls.
 await swipe(mobile,page,widgetBox.x+widgetBox.width*.75,widgetBox.x+widgetBox.width*.25,widgetBox.y+widgetBox.height*.8);
 const afterDrag=await stored(page);assert.equal(afterDrag.activePage,ids[0],'widget dragging continues to edit and cannot switch the page');assert.notEqual(afterDrag.widgets[0].x,widget.x,'the mobile widget drag actually edits geometry');
 await modal(page);await page.locator('#pageIndicatorEnabled').uncheck();await apply(page);assert.equal(await page.locator('.page-preview-footer').count(),0);
 screen=await page.locator('#screen').boundingBox();await swipe(mobile,page,screen.x+screen.width*.8,screen.x+screen.width*.2,screen.y+screen.height*.68);assert.equal((await stored(page)).activePage,ids[1],'swiping still works when the indicator is hidden');
 await swipe(mobile,page,screen.x+screen.width*.2,screen.x+screen.width*.8,screen.y+screen.height*.68);assert.equal((await stored(page)).activePage,ids[0]);
 await modal(page);await page.locator('#pageIndicatorEnabled').check();await page.locator('#pageTouch').uncheck();await overflow(page);await apply(page);screen=await page.locator('#screen').boundingBox();await swipe(mobile,page,screen.x+screen.width*.8,screen.x+screen.width*.2,screen.y+screen.height*.68);assert.equal((await stored(page)).activePage,ids[0],'swipes are optional independently from indicator visibility');await checkDots(page,ids[0]);
 // Firmware paints the indicator after widgets; the editor must keep it above a selected overlapping widget too.
 await modal(page);await page.locator('#pageTouch').check();await apply(page);
 const overlapId=(await stored(page)).widgets[0].id;await page.locator(`[data-layer="${overlapId}"]`).click();
 for(const [key,value] of [['x',0],['y',0],['w',320],['h',240]]){const input=page.locator(`[data-w="${key}"]`);await input.fill(String(value));await input.blur();}
 await page.locator('#stage').scrollIntoViewIfNeeded();assert.equal(await page.locator('[data-widget].selected').count(),1);
 const hit=await dot(page,ids[2]).evaluate(el=>{const rect=el.getBoundingClientRect();return document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)?.closest('[data-preview-page]')?.dataset.previewPage;});
 assert.equal(hit,ids[2],'dots remain on top and hit-testable over a full-screen selected widget');
 await dot(page,ids[2]).tap();assert.equal((await stored(page)).activePage,ids[2],'the overlapping-widget footer remains tappable');
 await page.close();await mobile.close();
 assert.deepEqual(errors,[],'no browser JavaScript errors');assert.deepEqual(externalRequests,[],'no network requests leave the synthetic server');assert.equal(requests.filter(req=>req.method!=='GET').length,0,'editor paging never sends device actions or server mutations');
 console.log('PASS sequential/random device-only settings, independent swipe toggle, global/per-page iOS dots, active size/colors/accessibility, dot taps, left/right/wrap touch swipes, hidden-indicator swipes, footer swipe tap suppression, widget drag isolation, footer hit testing over selected overlapping widgets, design and project-file roundtrips, desktop/mobile layout.');
 console.log('Screenshots: /tmp/cyd-atelier-paging-desktop.png /tmp/cyd-atelier-paging-mobile.png /tmp/cyd-atelier-paging-settings.png');
}finally{await browser.close();for(const client of clients)client.end();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
