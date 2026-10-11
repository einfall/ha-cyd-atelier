import assert from 'node:assert/strict';
import fs from 'node:fs';
import {WIDGET_KINDS,normalizeAdvancedWidget,effectiveWidget,rawWidgetValue,numericValue,ruleMatches,progressValue,durationValue,clockValue,advancedValue,advancedContent} from './src/advanced.mjs';
import {ADVANCED_CPP,advancedDrawCPP} from './src/advanced-export.mjs';
import {newProject,makeWidget,generate,readConfig,decodeProject,validateProject} from './src/core.mjs';
const icons=new Map(JSON.parse(fs.readFileSync(new URL('./dist/assets/icons.json',import.meta.url))).map(i=>[i.name,i]));
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
let checks=0;const test=(label,fn)=>{fn();checks++;console.log('PASS',label);};
const project=()=>({...newProject(),entities:[{entity_id:'sensor.test',state:'50',attributes:{amount:25}},{entity_id:'switch.test',state:'on',attributes:{}}]});

test('Project round-trip preserves all widget kinds and advanced settings',()=>{
  const p=project();p.widgets=WIDGET_KINDS.filter(k=>k!=='list').map(kind=>makeWidget({kind,entity:'sensor.test',icon:'mdi:coffee',nameAlign:'right',valueAlign:'center',valign:'middle',locked:true,minValue:-20,maxValue:80,thickness:9,actionService:'light.turn_on',actionEntity:'light.test'}));
  const restored=validateProject(p);assert.deepEqual(restored.widgets.map(w=>w.kind),p.widgets.map(w=>w.kind));
  for(const w of restored.widgets){assert.equal(w.nameAlign,'right');assert.equal(w.valueAlign,'center');assert.equal(w.valign,'middle');assert.equal(w.locked,true);assert.equal(w.minValue,-20);}
});
test('Normalization bounds ranges and rejects unsafe colors and service identifiers',()=>{
  const w=normalizeAdvancedWidget({kind:'bar',minValue:100,maxValue:20,thickness:999,rules:[{operator:'fake',value:4,color:'javascript:test',bg:'#FF0000'}],actionService:'light.turn_on;bad',actionEntity:'../bad',nameAlign:'fake',rowAlternateBg:'red'});
  assert.ok(w.maxValue>w.minValue);assert.equal(w.thickness,24);assert.equal(w.rules[0].operator,'eq');assert.equal(w.rules[0].color,'');assert.equal(w.rules[0].bg,'#ff0000');assert.equal(w.actionService,'');assert.equal(w.actionEntity,'');assert.equal(w.nameAlign,'');assert.equal(w.rowAlternateBg,'#223047');
});
test('Appearance uses the first matching rule and leaves original widget unchanged',()=>{
  const p=project(),w=makeWidget({entity:'sensor.test',color:'#ffffff',rules:[{operator:'gte',value:'50',color:'#00ff00',bg:'#123456',icon:'mdi:check'},{operator:'gte',value:'10',color:'#ff0000'}]});
  const result=effectiveWidget(p,w);assert.equal(result.color,'#00ff00');assert.equal(result.iconColor,'#00ff00');assert.equal(result.bg,'#123456');assert.equal(result.icon,'mdi:check');assert.equal(w.color,'#ffffff');
  w.attribute='amount';assert.equal(rawWidgetValue(p,w),25);assert.equal(effectiveWidget(p,w).color,'#ff0000');
  assert.equal(ruleMatches(undefined,{operator:'ne',value:'on'}),false);assert.equal(ruleMatches('unavailable',{operator:'gt',value:'0'}),false);assert.equal(ruleMatches('off',{operator:'eq',value:'off'}),true);
});
test('Numeric progress clamps real states and never turns a preview into data',()=>{
  const p=project(),w=makeWidget({kind:'bar',entity:'sensor.test',minValue:0,maxValue:100,preview:'80'});
  assert.equal(progressValue(p,w),.5);p.entities[0].state='120';assert.equal(progressValue(p,w),1);p.entities[0].state='-10';assert.equal(progressValue(p,w),0);
  for(const raw of ['',null,undefined,'unknown','unavailable','NaN','Infinity','0x10','0b10',{},true])assert.equal(numericValue(raw),null);
  assert.equal(numericValue(' 1.25e2 '),125);w.entity='sensor.missing';assert.equal(progressValue(p,w),null);assert.equal(advancedValue(p,w),'—');
});
test('Duration comes only from nonnegative numeric seconds with stable hours',()=>{
  assert.equal(durationValue('125.9'),'02:05');assert.equal(durationValue(3661,'hhmmss'),'01:01:01');assert.equal(durationValue(3661),'61:01');assert.equal(durationValue(0),'00:00');
  for(const raw of ['active','00:20',-1,'unavailable',null])assert.equal(durationValue(raw),'—');
  const p=project(),w=makeWidget({kind:'timer',entity:'sensor.test',timerFormat:'hhmmss'});assert.equal(advancedValue(p,w),'00:00:50');p.entities[0].state='80';assert.equal(advancedValue(p,w),'00:01:20');
});
test('Clock uses project timezone and explicit 24-hour/date formats',()=>{
  const p={timezone:'Europe/Berlin'},now=new Date('2026-10-11T10:07:59Z');
  assert.equal(clockValue(p,{clockFormat:'time'},now),'12:07');assert.equal(clockValue(p,{clockFormat:'time',clockSeconds:true},now),'12:07:59');assert.equal(clockValue(p,{clockFormat:'date'},now),'11.10.2026');assert.equal(clockValue(p,{clockFormat:'datetime'},now),'11.10.2026 12:07');assert.equal(clockValue({timezone:'Bad/Zone'},{clockFormat:'time'},now),'—');
});
test('Clock weekday prefixes use the local calendar and match ESPTime Sunday numbering',()=>{
  const p={timezone:'Europe/Berlin'},start=Date.parse('2026-10-05T10:07:59Z'),days=['Mo.','Di.','Mi.','Do.','Fr.','Sa.','So.'];
  for(let i=0;i<7;i++)assert.equal(clockValue(p,{clockFormat:'time',clockWeekday:true},new Date(start+i*86400000)),days[i]+' 12:07');
  const date=new Date('2026-10-11T23:07:59Z');assert.equal(clockValue(p,{clockFormat:'datetime',clockWeekday:true},date),'Mo. 12.10.2026 01:07');assert.equal(clockValue(p,{clockFormat:'date',clockWeekday:true},date),'Mo. 12.10.2026');
  const w=makeWidget({kind:'clock',clockWeekday:true,clockFormat:'date',icon:''}),code=advancedDrawCPP(w,{iconMap:icons}).join('\n');assert.ok(code.includes('{"", "So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."}'));assert.ok(code.includes('weekdays[clock_now.day_of_week]'));
  const q=project();q.widgets=[w];assert.equal(decodeProject(generate(q,icons).yaml).widgets[0].clockWeekday,true);assert.equal(makeWidget({kind:'clock'}).clockWeekday,false);
});
test('Preview renders gauges, escapes text, and keeps touch buttons inert',()=>{
  const p=project(),w=makeWidget({kind:'bar',entity:'sensor.test',label:'<script>bad</script>',nameAlign:'right',valueAlign:'center',valign:'middle'}),html=advancedContent(p,w,{esc,iconHTML:()=>''});
  assert.ok(html.includes('width:50%'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('text-align:right'));assert.ok(html.includes('text-align:center'));assert.ok(html.includes('justify-content:center'));
  assert.ok(advancedContent(p,{...w,kind:'ring'},{esc}).includes('stroke-dashoffset'));
  const button=advancedContent(p,{...w,kind:'button',actionService:'light.turn_on',actionEntity:'light.test'},{esc});assert.ok(!button.includes('onclick'));assert.ok(!button.includes('light.turn_on'));assert.equal(advancedContent(p,{...w,kind:'entity'},{esc}),null);
});
test('Measured preview wraps by characters and reserves bar space when text overflows',()=>{
  const p=project(),w=makeWidget({kind:'status',entity:'sensor.test',label:'ABCDEFG',show:'name',nameSize:8,icon:'',padding:0,w:40,h:100,valign:'middle'}),measure=s=>String(s).length*10;
  const html=advancedContent(p,w,{esc,measure});assert.ok(html.includes('top:40px'));assert.ok(html.includes('>ABCD</span>'));assert.ok(html.includes('top:50px'));assert.ok(html.includes('>EFG</span>'));
  const bar=makeWidget({kind:'bar',entity:'sensor.test',label:'Sehr langer Text für einen Balken',icon:'',padding:0,w:40,h:40,thickness:6});
  const barHTML=advancedContent(p,bar,{esc,measure});assert.ok(barHTML.includes('top:34px'));assert.ok(barHTML.includes('height:31px;overflow:hidden'));assert.ok(barHTML.includes('width:50%'));
  const code=advancedDrawCPP(bar,{bindingId:'value0',iconMap:icons}).join('\n');assert.ok(code.includes('gauge_y - 3'));assert.ok(code.indexOf('it.end_clipping();\nit.filled_rectangle')>code.indexOf('int gauge_y'));
});
test('Generator includes synchronized time, rules icons/fonts, progress and duration logic',()=>{
  const p=project();p.widgets=[makeWidget({kind:'status',entity:'switch.test',label:'Status',rules:[{operator:'eq',value:'on',color:'#00ff00',icon:'mdi:check'}]}),makeWidget({kind:'bar',entity:'sensor.test',label:'Balken',minValue:20,maxValue:80}),makeWidget({kind:'ring',entity:'sensor.test',label:'Ring'}),makeWidget({kind:'timer',entity:'sensor.test',label:'Dauer',timerFormat:'hhmmss'}),makeWidget({kind:'clock',label:'Zeit',clockFormat:'datetime',clockSeconds:true,icon:''})];
  const generated=generate(p,icons),doc=readConfig(generated.yaml),code=String(doc.getIn(['display',0,'lambda']));
  assert.equal(generated.bindings,2);assert.ok(generated.yaml.includes('platform: homeassistant'));assert.ok(generated.yaml.includes('id: cydg_clock'));assert.ok(code.includes('clock_now.is_valid()'));assert.ok(code.includes('%d.%m.%Y %H:%M:%S'));assert.ok(code.includes('raw == "on"'));assert.ok(code.includes('icon = "\\U000f012c"'));assert.ok(code.includes('cydg_ring('));assert.ok(code.includes('progress >= 0'));assert.ok(code.includes('std::floor(std::min(2147483647.0, numeric))'));assert.ok(!code.includes('millis()'));
  const restored=decodeProject(generated.yaml);assert.deepEqual(restored.widgets.map(w=>w.kind),p.widgets.map(w=>w.kind));assert.equal(restored.widgets[0].rules[0].icon,'mdi:check');
});
test('Legacy widgets keep their drawing branch; explicit alignment produces helper code',()=>{
  const p=project(),w=makeWidget({entity:'sensor.test',icon:''});assert.equal(advancedDrawCPP(w,{bindingId:'value0',iconMap:icons}),null);
  const code=advancedDrawCPP({...w,nameAlign:'right',valueAlign:'center',valign:'bottom'},{bindingId:'value0',iconMap:icons}).join('\n');assert.ok(code.includes('content_h'));assert.ok(code.includes('std::max'));assert.ok(code.includes('value_color'));assert.ok(ADVANCED_CPP.includes('strtod'));
});
test('All generated widget resources resolve, including gauges with hidden value labels',()=>{
  const p=project();p.widgets=[];
  for(const kind of ['status','bar','ring','clock','timer','text','entity'])for(const show of ['name','value','both'])p.widgets.push(makeWidget({kind,show,entity:'sensor.test',nameSize:13,valueSize:23,iconSize:27,icon:'',nameAlign:'center',valueAlign:'right'}));
  const doc=readConfig(generate(p,icons).yaml),code=String(doc.getIn(['display',0,'lambda']));
  const ids=new Set(['cydg_clock']);for(const section of ['font','text_sensor'])for(const n of doc.get(section,true)?.items||[])ids.add(n.get('id'));
  for(const match of code.matchAll(/\bid\((cydg_\w+)\)/g))assert.ok(ids.has(match[1]),`Missing generated resource ${match[1]}`);
  const gauge=code.slice(code.indexOf('// Advanced widget '+p.widgets[3].id),code.indexOf('// Advanced widget '+p.widgets[4].id));assert.ok(gauge.includes('id(cydg_value_0).has_state()'));
});
test('Configured touch button exports a scoped service action and rejects unsupported targets',()=>{
  const p=project();p.base+='\ntouchscreen:\n  platform: xpt2046\n  id: existing_touch\n  cs_pin: GPIO33\n  calibration:\n    x_min: 200\n    x_max: 3800\n    y_min: 200\n    y_max: 3800\n';p.screenControl.touchscreenId='existing_touch';
  p.widgets=[makeWidget({kind:'button',label:'Licht',entity:'',icon:'',x:20,y:30,w:100,h:50,actionService:'light.toggle',actionEntity:'light.test'})];
  const doc=readConfig(generate(p,icons).yaml),touch=doc.get('touchscreen',true),actions=touch.get('on_release',true);
  const action=actions.items[0].get('if',true);assert.equal(action.getIn(['then',0,'homeassistant.service','service']),'light.toggle');assert.equal(action.getIn(['then',0,'homeassistant.service','data','entity_id']),'light.test');assert.ok(action.getIn(['condition','lambda']).includes('id(cydg_touch_x) >= 20'));assert.ok(action.getIn(['condition','lambda']).includes('id(cydg_touch_y) < 80'));
  p.widgets[0].actionEntity='switch.test';assert.throws(()=>generate(p,icons),/Touch-Aktion/);p.widgets[0].actionService='homeassistant.restart';assert.throws(()=>generate(p,icons),/Touch-Aktion/);
});
console.log(`${checks} advanced widget checks passed.`);
