import assert from 'node:assert/strict';
import fs from 'node:fs';
import {newProject,makeWidget,validateProject,changeOrientation,changeHardware,dim,generate,readConfig,decodeProject,encodeProject} from './src/core.mjs';
import {ensurePages,capturePage,changePage,addPage,deletePage,allProjectWidgets} from './src/pages.mjs';
import {boundEntityIds,storedProject,LiveEntities} from './src/ha-live.mjs';
import {snapshotDesign} from './src/designs.mjs';
const icons=new Map(JSON.parse(fs.readFileSync('dist/assets/icons.json')).map(i=>[i.name,i]));
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS',name);};
const geometry=w=>({x:w.x,y:w.y,w:w.w,h:w.h,parts:structuredClone(w.parts)});
const screenBase=p=>{p.base='esphome:\n  name: atelier-test\nesp32:\n  variant: esp32\n  framework:\n    type: esp-idf\napi:\n  encryption:\n    key: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="\nlogger:\n';return p;};

test('Old projects migrate to one page and keep direct p.widgets edits authoritative',()=>{
 const p=newProject();delete p.pages;delete p.activePage;p.widgets=[makeWidget({kind:'text',label:'Alt'})];ensurePages(p);assert.equal(p.pages.length,1);
 const active=p.activePage;p.widgets.push(makeWidget({entity:'sensor.neu',label:'Neu'}));assert.equal(allProjectWidgets(p).length,2);capturePage(p);assert.equal(p.pages[0].widgets.length,2);assert.equal(p.activePage,active);
 p.pages[0].widgets=[];assert.equal(allProjectWidgets(p).length,2);assert.equal(validateProject(p).widgets.length,2);
});
test('Pages capture, rename, switch and delete without restoring stale copies',()=>{
 const p=newProject();p.widgets=[makeWidget({kind:'text',label:'Erste'})];const first=p.activePage,second=addPage(p,'Zweite');assert.equal(p.widgets.length,0);
 p.widgets.push(makeWidget({kind:'text',label:'Zweite aktuell'}));p.background='#abcdef';changePage(p,first);assert.equal(p.widgets[0].label,'Erste');assert.equal(p.background,'#0c1422');
 p.widgets[0].label='Erste bearbeitet';changePage(p,second.id);assert.equal(p.widgets[0].label,'Zweite aktuell');assert.equal(p.background,'#abcdef');
 changePage(p,first);assert.equal(p.widgets[0].label,'Erste bearbeitet');deletePage(p,first);assert.equal(p.activePage,second.id);assert.equal(p.widgets[0].label,'Zweite aktuell');assert.throws(()=>deletePage(p,second.id),/Mindestens/);
});
test('Page limit is eight and project widget limit spans every page',()=>{
 const p=newProject();for(let i=1;i<8;i++)addPage(p,'Seite '+i);assert.throws(()=>addPage(p),/acht/);assert.equal(validateProject(p).pages.length,8);
 p.pages[0].widgets=Array.from({length:101},()=>makeWidget({kind:'text'}));assert.throws(()=>validateProject(p),/100/);
 const q=newProject();q.widgets=Array.from({length:41},()=>makeWidget({kind:'text'}));assert.throws(()=>generate(q,icons),/40.*Displayseite/);
 const r=newProject();r.pages=Array.from({length:9},(_,i)=>({id:'p'+i,widgets:[]}));assert.throws(()=>validateProject(r),/acht/);
});
test('Orientation restores independent geometry and parts while keeping changed content',()=>{
 const p=newProject();p.widgets=[makeWidget({kind:'text',label:'Alt',x:24,y:32,w:180,h:80,parts:{name:{x:8,y:12,w:150,h:22}}})];capturePage(p);const landscape=geometry(p.widgets[0]);
 changeOrientation(p,'portrait');p.widgets[0].x=35;p.widgets[0].y=210;p.widgets[0].w=120;p.widgets[0].h=100;p.widgets[0].parts={name:{x:5,y:7,w:100,h:32}};p.widgets[0].label='Neu';const portrait=geometry(p.widgets[0]);
 changeOrientation(p,'landscape');assert.deepEqual(geometry(p.widgets[0]),landscape);assert.equal(p.widgets[0].label,'Neu');changeOrientation(p,'portrait');assert.deepEqual(geometry(p.widgets[0]),portrait);
 const restored=validateProject(p);changeOrientation(restored,'landscape');assert.deepEqual(geometry(restored.widgets[0]),landscape);
});
test('Orientation and hardware changes also retain inactive page layouts',()=>{
 const p=newProject();p.widgets=[makeWidget({kind:'text',x:20,y:40,w:100,h:60})];const first=p.activePage;addPage(p,'Andere');p.widgets=[makeWidget({kind:'text',x:140,y:40,w:100,h:60})];const second=p.activePage;
 changeOrientation(p,'portrait');changePage(p,first);p.widgets[0].y=230;changeOrientation(p,'landscape');assert.equal(p.widgets[0].y,40);changePage(p,second);assert.equal(p.widgets[0].x,140);
 changeHardware(p,{model:'ST7796',backlight:27,dataRate:20});assert.deepEqual(dim(p),{width:480,height:320});assert.equal(p.widgets[0].x,210);changePage(p,first);changeOrientation(p,'portrait');assert.equal(p.widgets[0].y,345);
});
test('Live subscriptions and compact storage retain entities from inactive pages and button targets',()=>{
 const p=newProject();p.widgets=[makeWidget({entity:'sensor.one'})];addPage(p);p.widgets=[makeWidget({kind:'list',items:[{entity:'sensor.two'}]}),makeWidget({kind:'button',actionService:'light.toggle',actionEntity:'light.lamp'}),makeWidget({kind:'clock',entity:'sensor.ignored'})];
 assert.deepEqual([...boundEntityIds(p)].sort(),['light.lamp','sensor.one','sensor.two']);
 const live=new LiveEntities();live.receive('snapshot',{connected:true,entities:[{entity_id:'sensor.other',state:'1',attributes:{}}]});live.apply(p);assert.equal(p.entities.filter(e=>e.state==='unavailable').length,3);assert.equal(storedProject(p).entities.length,3);
});
test('Project, design and YAML metadata roundtrips preserve all pages and current edits',()=>{
 const p=newProject();p.widgets=[makeWidget({entity:'sensor.one',label:'Erste'})];const first=p.activePage;addPage(p,'Andere');p.widgets=[makeWidget({kind:'text',label:'Zweite'})];changeOrientation(p,'portrait');p.widgets[0].x=50;p.timezone='Europe/Berlin';p.pageSeconds=11;p.pageTouch=false;
 const r=decodeProject(generate(p,icons).yaml),design=snapshotDesign(p,'Mehrere Seiten').project;
 for(const copy of [r,design]){assert.equal(copy.pages.length,2);assert.equal(copy.widgets[0].x,50);assert.equal(copy.pageSeconds,11);assert.equal(copy.pages[0].widgets[0].entity,'sensor.one');changePage(copy,first);assert.equal(copy.widgets[0].label,'Erste');}
 p.widgets[0].label='Noch aktueller';const encoded=encodeProject(p);assert.equal(decodeProject('# cyd-atelier-project: '+encoded).widgets[0].label,'Noch aktueller');
});
test('New widget types collect fonts, rule icons, valid time and all entity bindings',()=>{
 const p=screenBase(newProject());p.widgets=['status','bar','ring','timer','clock','button'].map((kind,i)=>makeWidget({kind,entity:'sensor.value'+i,label:kind,x:10,y:10,w:150,h:70,icon:'',rules:kind==='status'?[{operator:'eq',value:'heating',color:'#ffaa00',bg:'#112233',icon:'mdi:coffee'}]:[],show:kind==='bar'?'name':'both'}));
 const result=generate(p,icons),doc=readConfig(result.yaml),lambda=doc.getIn(['display',0,'lambda']);assert.equal(result.bindings,4);assert.equal(doc.getIn(['time',0,'platform']),'homeassistant');assert.equal(doc.getIn(['time',0,'timezone']),'Europe/Berlin');
 assert.ok(lambda.includes('cydg_ring('));assert.ok(lambda.includes('gauge_y'));assert.ok(lambda.includes('clock_now.is_valid()'));assert.ok(lambda.includes('raw == "heating"'));assert.ok(lambda.includes('%02lu:%02lu'));
 assert.ok(doc.get('font',true).items.some(f=>f.get('id')==='cydg_icon_26'));assert.ok(doc.get('font',true).items.some(f=>f.get('id')==='cydg_text_25'));
 const declared=new Set([...result.yaml.matchAll(/\bid: (cydg_\w+)/g)].map(m=>m[1]));for(const [,id] of lambda.matchAll(/\bid\((cydg_\w+)\)/g))assert.ok(declared.has(id),'missing resource '+id);
 p.timezone='Invalid/Nowhere';assert.throws(()=>generate(p,icons),/Zeitzone/);
});
test('Device paging is side-effect free while interval and dotbar touch update page state',()=>{
 const p=screenBase(newProject());changeHardware(p,{model:'ST7796',backlight:27,dataRate:20});p.widgets=[];addPage(p,'Leer');p.widgets=[makeWidget({kind:'text',label:'Seite 2'})];p.pageSeconds=9;p.pageTouch=true;p.pageIndicator.enabled=true;
 const out=generate(p,icons),doc=readConfig(out.yaml),lambda=doc.getIn(['display',0,'lambda']);assert.ok(lambda.includes('switch (id(cydg_page))'));assert.ok(lambda.includes('case 0:'));assert.ok(lambda.includes('case 1:'));assert.ok(!/id\(cydg_page\)\s*=(?!=)/.test(lambda));assert.equal(doc.getIn(['interval',0,'interval']),'9s');
 const touch=doc.getIn(['touchscreen',0],true);assert.equal(touch.get('platform'),'xpt2046');assert.ok(touch.getIn(['on_touch',0,'lambda']).includes('touch.x'));assert.ok(touch.getIn(['on_update',0,'lambda']).includes('point.id'));assert.ok(touch.getIn(['on_release',1,'if','condition','lambda']).includes('>= 292'));assert.ok(touch.getIn(['on_release',1,'if','then',0,'lambda']).includes('/ 20'));assert.ok(lambda.includes('it.filled_circle('));assert.ok(!lambda.includes('Weiter >'));
});
test('Touch buttons preserve existing actions/API and reject unsupported or mismatched targets',()=>{
 const p=screenBase(newProject());p.base+='touchscreen:\n  platform: xpt2046\n  id: existing_touch\n  cs_pin: GPIO33\n  calibration:\n    x_min: 200\n    x_max: 3800\n    y_min: 200\n    y_max: 3800\n  on_touch:\n    then:\n      - logger.log: Existing action\n';p.screenControl.touchscreenId='existing_touch';p.widgets=[makeWidget({kind:'button',label:'Licht',actionService:'light.toggle',actionEntity:'light.lamp'})];
 const doc=readConfig(generate(p,icons).yaml);assert.equal(doc.getIn(['api','encryption','key']),'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');assert.equal(doc.getIn(['touchscreen','on_touch',0,'then',0,'logger.log']),'Existing action');assert.equal(doc.getIn(['touchscreen','on_release',0,'if','then',0,'homeassistant.service','data','entity_id']),'light.lamp');
 p.widgets[0].actionService='homeassistant.restart';assert.throws(()=>generate(p,icons),/unterstützte Touch/);p.widgets[0].actionService='switch.toggle';assert.throws(()=>generate(p,icons),/passende/);
});
test('Invisible buttons do not execute on the first wake touch and overlapping targets respect topmost button',()=>{
 const p=screenBase(newProject());changeHardware(p,{model:'ST7796',backlight:27,dataRate:20});p.screenControl={gateEnabled:true,gateEntity:'input_boolean.screen',touchEnabled:true};
 p.widgets=[makeWidget({kind:'button',actionService:'light.toggle',actionEntity:'light.first',x:20,y:30,w:100,h:50}),makeWidget({kind:'button',actionService:'light.toggle',actionEntity:'light.top',x:20,y:30,w:100,h:50})];
 const doc=readConfig(generate(p,icons).yaml),touch=doc.getIn(['touchscreen',0],true),actions=touch.get('on_touch',true).items,releases=touch.get('on_release',true).items;
 assert.ok(actions[0].get('lambda').includes('cydg_touch_was_awake'));assert.ok(actions[1].getIn(['if','then',0,'script.execute']));assert.ok(actions[2].get('lambda').includes('cydg_touch_can_act'));
 const evaluate=(lambda,awake,moved=false)=>Function('id',lambda.replace(/id\((cydg_\w+)\)/g,'id("$1")').replaceAll('std::abs','Math.abs'))(name=>name==='cydg_touch_can_act'?awake:name==='cydg_touch_moved'?moved:name==='cydg_touch_active'?true:name.endsWith('_x')||name.endsWith('_y')?40:{state:'off',has_state:()=>true});
 assert.equal(evaluate(releases[0].getIn(['if','condition','lambda']),true),false);assert.equal(evaluate(releases[1].getIn(['if','condition','lambda']),true),true);assert.equal(evaluate(releases[1].getIn(['if','condition','lambda']),false),false);assert.equal(evaluate(releases[1].getIn(['if','condition','lambda']),true,true),false);
});
test('Horizontal swipes switch one page on release, while vertical drags and short moves do not',()=>{
 const p=screenBase(newProject());changeHardware(p,{model:'ST7796',backlight:27,dataRate:20});p.widgets=[];addPage(p);addPage(p);p.pageTouch=true;
 const touch=readConfig(generate(p,icons).yaml).getIn(['touchscreen',0],true),action=touch.getIn(['on_release',0,'if'],true);
 const id=(dx,dy)=>name=>({cydg_touch_can_act:true,cydg_touch_x:200,cydg_touch_y:100,cydg_touch_last_x:200+dx,cydg_touch_last_y:100+dy,cydg_touch_start_page:1,cydg_page:1})[name];
 const condition=Function('id',action.getIn(['condition','lambda']).replace(/id\((cydg_\w+)\)/g,'id("$1")').replaceAll('std::abs','Math.abs'));
 assert.equal(condition(id(-100,3)),true);assert.equal(condition(id(100,-5)),true);assert.equal(condition(id(60,0)),false);assert.equal(condition(id(100,100)),false);
 const rhs=action.getIn(['then',0,'lambda']).match(/ = (.*);$/)[1],target=Function('id','return '+rhs.replace(/id\((cydg_\w+)\)/g,'id("$1")'));
 assert.equal(target(id(-100,0)),2);assert.equal(target(id(100,0)),0);
 assert.ok(touch.getIn(['on_update',0,'lambda']).includes('cydg_touch_moved'));assert.ok(touch.getIn(['on_update',0,'lambda']).includes('touches.size() > 1'));
});
console.log(`${count} extended core checks passed.`);
