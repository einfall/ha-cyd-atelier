import assert from 'node:assert/strict';
import fs from 'node:fs';
import {newProject,makeWidget,validateProject,generate,readConfig,decodeProject} from './src/core.mjs';
import {ensurePages,addPage,pageIndicatorFor} from './src/pages.mjs';
import {snapshotDesign} from './src/designs.mjs';
const icons=new Map(JSON.parse(fs.readFileSync('dist/assets/icons.json')).map(i=>[i.name,i]));
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS',name);};
function project(size=3){const p=newProject();p.base='esphome:\n  name: paging-fixture\nesp32:\n  variant: esp32\n  framework:\n    type: esp-idf\napi:\nlogger:\n';p.widgets=[];p.hardware={...p.hardware,model:'ST7796',backlight:27,dataRate:20};for(let i=1;i<size;i++)addPage(p,'Seite '+(i+1));return p;}
const docFor=p=>readConfig(generate(p,icons).yaml);
const cppJS=s=>s.replace(/id\((cydg_\w+)\)/g,'id("$1")').replaceAll('std::abs','Math.abs');
const condition=(text,state)=>Function('id',cppJS(text))(id=>state[id]);
const touchState=(page=0,x=240,y=310,dx=0,dy=0)=>({cydg_page:page,cydg_touch_start_page:page,cydg_touch_can_act:true,cydg_touch_moved:!!(dx||dy),cydg_touch_x:x,cydg_touch_y:y,cydg_touch_last_x:x+dx,cydg_touch_last_y:y+dy});

test('Legacy footer migrates, while new projects start with optional indicators off',()=>{
 const p=project();assert.equal(p.pageIndicator.enabled,false);assert.equal(p.pageSwitchMode,'next');assert.equal(p.pages.every(page=>page.indicator==='inherit'),true);
 p.pageTouch=true;delete p.pageIndicator;const restored=validateProject(p);assert.equal(restored.pageIndicator.enabled,true);assert.equal(pageIndicatorFor(restored).enabled,true);
 const direct=structuredClone(p);ensurePages(direct);assert.equal(direct.pageIndicator.enabled,true);
 restored.pageIndicator={enabled:false,activeColor:'invalid',inactiveColor:'#345678',background:null};restored.pageSwitchMode='invalid';restored.pages[0].indicator='invalid';ensurePages(restored);
 assert.deepEqual(restored.pageIndicator,{enabled:false,activeColor:'#f6f8fc',inactiveColor:'#345678',background:'#182334'});assert.equal(restored.pageSwitchMode,'next');assert.equal(restored.pages[0].indicator,'inherit');
});
test('Global settings and per-page overrides survive both designs and YAML roundtrips',()=>{
 const p=project();p.pageSeconds=17;p.pageSwitchMode='random';p.pageIndicator={enabled:true,activeColor:'#ffaa00',inactiveColor:'#555555',background:'#112233'};p.pages[0].indicator='hide';p.pages[1].indicator='show';
 for(const copy of [decodeProject(generate(p,icons).yaml),snapshotDesign(p,'Paging').project]){
  assert.equal(copy.pageSwitchMode,'random');assert.equal(copy.pageSeconds,17);assert.deepEqual(copy.pageIndicator,p.pageIndicator);assert.deepEqual(copy.pages.map(page=>page.indicator),['hide','show','inherit']);assert.deepEqual(copy.pages.map(page=>pageIndicatorFor(copy,page).enabled),[false,true,true]);
 }
 p.pageIndicator.enabled=false;assert.deepEqual(p.pages.map(page=>pageIndicatorFor(p,page).enabled),[false,true,false]);
});
test('Automatic sequential paging wraps; random paging always picks a different page',()=>{
 for(let size=2;size<=8;size++){
  const p=project(size);p.pageSeconds=23;p.pageSwitchMode='random';const doc=docFor(p),text=doc.getIn(['interval',0,'then',0,'lambda']);assert.equal(doc.getIn(['interval',0,'interval']),'23s');assert.equal(doc.getIn(['interval',0,'then',1,'component.update']),'cydg_display');
  const rhs=text.match(/ = (.*);$/)[1].replace(/static_cast<int>\((esphome::random_uint32\(\) % \d+)\)/g,'($1)').replaceAll('esphome::random_uint32()','random()');
  const target=Function('id','random','return '+cppJS(rhs));
  for(let current=0;current<size;current++){const reachable=new Set();for(let sample=0;sample<32;sample++){const next=target(()=>current,()=>sample);assert.notEqual(next,current);assert.ok(next>=0&&next<size);reachable.add(next);}assert.equal(reachable.size,size-1);}
  const drawing=doc.getIn(['display',0,'lambda']);assert.ok(!drawing.includes('random_uint32'));assert.ok(!/id\(cydg_page\)\s*(?:=(?!=)|\+\+|--)/.test(drawing));
  p.pageSwitchMode='next';const nextText=docFor(p).getIn(['interval',0,'then',0,'lambda']),next=Function('id','return '+cppJS(nextText.match(/ = (.*);$/)[1]));assert.equal(next(()=>size-1),0);assert.equal(next(()=>0),1);
 }
 const single=project(1);single.pageSeconds=13;single.pageSwitchMode='random';single.pageTouch=true;single.pageIndicator.enabled=true;const doc=docFor(single);assert.equal(doc.has('interval'),false);assert.equal(doc.has('touchscreen'),false);assert.ok(!doc.getIn(['display',0,'lambda']).includes('it.filled_circle('));assert.equal(pageIndicatorFor(single).enabled,false);
});
test('Immediate page refresh also targets an existing display ID',()=>{
 const p=project();p.pageSeconds=11;p.hardware.existingDisplay='owned_display';p.hardware.replaceDrawing=true;
 p.base+='spi:\n  id: owned_spi\n  clk_pin: GPIO14\n  mosi_pin: GPIO13\n  miso_pin: GPIO12\ndisplay:\n  - platform: mipi_spi\n    model: ST7796\n    id: owned_display\n    spi_id: owned_spi\n    cs_pin: GPIO15\n    dc_pin: GPIO2\n    dimensions:\n      width: 320\n      height: 480\n';
 const doc=docFor(p);assert.equal(doc.getIn(['interval',0,'then',1,'component.update']),'owned_display');assert.equal(doc.getIn(['display',0,'id']),'owned_display');
});
test('Dots indicate automatic paging without requiring touch or arrow labels',()=>{
 const p=project();p.pageIndicator={enabled:true,activeColor:'#ffaa00',inactiveColor:'#223344',background:'#102030'};p.pages[0].indicator='hide';p.pageTouch=false;const doc=docFor(p),draw=doc.getIn(['display',0,'lambda']);
 assert.equal(doc.has('touchscreen'),false);assert.ok(draw.includes('if (id(cydg_page) == 1 || id(cydg_page) == 2)'));assert.ok(draw.includes('it.filled_rectangle(0, 292, 480, 28, Color(0x102030))'));assert.ok(draw.includes('it.filled_circle(220, 306, id(cydg_page) == 0 ? 5 : 3'));assert.ok(draw.includes('Color(0xffaa00) : Color(0x223344)'));assert.ok(!draw.includes('Weiter >'));assert.ok(!draw.includes('Zurück'));
});
test('Direct dot taps select exactly their page and ignore empty gutter or hidden bars',()=>{
 const p=project();p.pageTouch=true;p.pageIndicator.enabled=true;p.pages[0].indicator='hide';const touch=docFor(p).getIn(['touchscreen',0],true),tap=touch.getIn(['on_release',1,'if'],true),guard=tap.getIn(['condition','lambda']),rhs=tap.getIn(['then',0,'lambda']).match(/ = (.*);$/)[1],target=Function('id','return Math.trunc('+cppJS(rhs)+')');
 assert.equal(tap.getIn(['then',1,'component.update']),'cydg_display');for(let index=0;index<3;index++){const state=touchState(1,220+index*20);assert.equal(condition(guard,state),true);assert.equal(target(id=>state[id]),index);}
 for(const state of [touchState(0),touchState(1,209),touchState(1,270),touchState(1,240,291),touchState(1,240,320),touchState(1,240,310,100)])assert.equal(condition(guard,state),false);
 const blocked=touchState(1);blocked.cydg_touch_can_act=false;assert.equal(condition(guard,blocked),false);const changed=touchState(1);changed.cydg_page=2;assert.equal(condition(guard,changed),false);
});
test('Hidden bars keep bottom buttons usable, visible bars consume their touch area',()=>{
 const p=project();p.pageTouch=true;p.pageIndicator.enabled=true;p.pages[0].indicator='hide';
 for(let index=0;index<3;index++)p.pages[index].widgets=[makeWidget({kind:'button',label:'Bottom',actionService:'light.toggle',actionEntity:'light.page'+index,x:0,y:292,w:480,h:28})];p.widgets=structuredClone(p.pages[2].widgets);
 const touch=docFor(p).getIn(['touchscreen',0],true),releases=touch.get('on_release',true).items,buttonGuards=releases.filter(action=>action.getIn(['if','then',0,'homeassistant.service'],true)).map(action=>action.getIn(['if','condition','lambda']));assert.equal(buttonGuards.length,3);
 assert.equal(condition(buttonGuards[0],touchState(0)),true);assert.equal(condition(buttonGuards[1],touchState(1)),false);assert.equal(condition(buttonGuards[2],touchState(2)),false);
 for(const guard of buttonGuards){const state=touchState(0,240,310,100);assert.equal(condition(guard,state),false);state.cydg_touch_can_act=false;assert.equal(condition(guard,state),false);}
 p.pageTouch=false;const displayOnly=docFor(p).getIn(['touchscreen',0,'on_release'],true).items,guards=displayOnly.filter(action=>action.getIn(['if','then',0,'homeassistant.service'],true)).map(action=>action.getIn(['if','condition','lambda']));assert.equal(condition(guards[0],touchState(0)),true);assert.equal(condition(guards[1],touchState(1)),false);
});
test('Swiping wraps independently of dotbar visibility and preserves gesture guards',()=>{
 const p=project();p.pageTouch=true;p.pageIndicator.enabled=false;const touch=docFor(p).getIn(['touchscreen',0],true),swipe=touch.getIn(['on_release',0,'if'],true),guard=swipe.getIn(['condition','lambda']),target=Function('id','return '+cppJS(swipe.getIn(['then',0,'lambda']).match(/ = (.*);$/)[1]));
 assert.equal(condition(guard,touchState(2,240,100,-100,2)),true);assert.equal(target(id=>touchState(2,240,100,-100,2)[id]),0);assert.equal(target(id=>touchState(0,240,100,100,2)[id]),2);
 assert.equal(swipe.getIn(['then',1,'component.update']),'cydg_display');
 assert.equal(condition(guard,touchState(0,240,100,60,0)),false);assert.equal(condition(guard,touchState(0,240,100,100,100)),false);const blocked=touchState(0,240,100,100,0);blocked.cydg_touch_can_act=false;assert.equal(condition(guard,blocked),false);
 assert.ok(touch.getIn(['on_update',0,'lambda']).includes('touches.size() > 1'));assert.ok(!docFor(p).getIn(['display',0,'lambda']).includes('it.filled_circle('));
});
console.log(`${count} paging core checks passed.`);
