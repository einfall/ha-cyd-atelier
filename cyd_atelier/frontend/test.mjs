import {normalizeScreenControl} from './src/screen-control.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BASE,newProject,generate,readConfig,decodeProject,changeOrientation,parseEntities,entitiesFromConfig,validateProject,normalizePaste,makeWidget,dim,boundWidget,formatValue,changeHardware} from './src/core.mjs';
const icons=new Map(JSON.parse(fs.readFileSync('dist/assets/icons.json')).map(i=>[i.name,i]));
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS',name);};
test('Secret-Verweise, Grundkonfiguration und Kommentare bleiben erhalten',()=>{const p=newProject(),out=generate(p,icons).yaml,doc=readConfig(out);assert.ok(out.includes('# Enable Home Assistant API'));assert.ok(out.includes('!secret kaffeebar__encryption_key'));assert.ok(out.includes('!secret wifi_password'));assert.equal(doc.getIn(['esphome','min_version']),'2026.4.0');assert.equal(doc.getIn(['esp32','framework','type']),'esp-idf');});
test('Rundreise YAML → Projekt erhält Layout und ursprüngliche Basis',()=>{const p=newProject();p.widgets[0].label='Kaffee & Spaß\n"Text"';const r=decodeProject(generate(p,icons).yaml);assert.equal(r.base,BASE);assert.equal(r.widgets[0].label,p.widgets[0].label);assert.equal(r.widgets[1].entity,p.widgets[1].entity);assert.equal(generate(r,icons).bindings,3);});
test('Zustands- und Attributimporte erzeugen getrennte Bindungen',()=>{const p=newProject();p.widgets=[makeWidget({entity:'climate.wohnzimmer',attribute:'temperature',label:'Soll'}),makeWidget({entity:'climate.wohnzimmer',attribute:'current_temperature',label:'Ist'}),makeWidget({entity:'climate.wohnzimmer',attribute:'temperature',label:'Soll 2'})];const d=readConfig(generate(p,icons).yaml);assert.equal(d.get('text_sensor',true).items.length,2);assert.equal(d.getIn(['text_sensor',1,'attribute']),'current_temperature');});
test('Hoch- und Querformat für beide Controller',()=>{for(const model of ['ILI9341','ILI9342'])for(const orientation of ['landscape','portrait']){const p=newProject();p.hardware.model=model;changeOrientation(p,orientation);const d=readConfig(generate(p,icons).yaml);const rot=d.getIn(['display',0,'rotation']);assert.equal(rot,model==='ILI9341'?(orientation==='landscape'?90:0):(orientation==='landscape'?0:90));for(const w of p.widgets){assert.ok(w.x+w.w<=dim(p).width);assert.ok(w.y+w.h<=dim(p).height);}}});
test('Ungültiges YAML und doppelte Schlüssel werden blockiert',()=>{assert.throws(()=>readConfig(BASE+'wifi:\n  ssid: b\n'));assert.throws(()=>readConfig('esphome: [\n'));});
test('Vorhandene Sensoren und eigene Includes bleiben erhalten',()=>{const p=newProject();p.base+='\nsensor:\n  - platform: homeassistant\n    id: current_power\n    entity_id: sensor.power\n    name: Vorhanden\nsubstitutions: !include common.yaml\n';const g=generate(p,icons),d=readConfig(g.yaml);assert.equal(d.getIn(['sensor',0,'id']),'current_power');assert.ok(g.yaml.includes('!include common.yaml'));assert.equal(entitiesFromConfig(d)[0].entity_id,'sensor.power');});
test('Vorhandenes Display wird erst nach Bestätigung verändert',()=>{const p=newProject();p.base+='\nspi:\n  clk_pin: GPIO14\n  mosi_pin: GPIO13\ndisplay:\n  - platform: ili9xxx\n    id: original\n    model: ILI9341\n    cs_pin: GPIO15\n    dc_pin: GPIO2\n    invert_colors: false\n    lambda: |-\n      it.fill(Color::BLACK);\n';assert.throws(()=>generate(p,icons),/Zeichenblocks/);p.hardware.existingDisplay='original';p.hardware.replaceDrawing=true;const d=readConfig(generate(p,icons).yaml);assert.equal(d.get('display',true).items.length,1);assert.equal(d.getIn(['display',0,'cs_pin']),'GPIO15');assert.ok(d.getIn(['display',0,'lambda']).includes('draw_text'));});
test('Nicht auflösbare Listen und fremdes LVGL werden blockiert',()=>{const p=newProject();p.base+='\nfont: !include fonts.yaml\n';assert.throws(()=>generate(p,icons),/Verweis/);p.base=BASE+'\nlvgl:\n  pages: []\n';assert.throws(()=>generate(p,icons),/LVGL/);});
test('Leeres Display und reine Textseite erzeugen gültiges YAML',()=>{const p=newProject();p.widgets=[];assert.ok(readConfig(generate(p,icons).yaml).getIn(['display',0,'lambda']).includes('it.fill'));p.widgets=[makeWidget({kind:'text',show:'name',icon:'',label:'Hallo\nWelt'})];assert.equal(generate(p,icons).bindings,0);});
test('Einfügeformat, JSON und Sonderzeichen werden behandelt',()=>{const s='esphome:\\\n&#x20; name: test\\\nesp32:\\\n&#x20; variant: esp32';assert.equal(readConfig(normalizePaste(s)).getIn(['esphome','name']),'test');const a=parseEntities('[{"entity_id":"sensor.test","state":"3.5","attributes":{"friendly_name":"<script>test</script>"}}]');assert.equal(a.length,1);assert.throws(()=>parseEntities('{"bad":true}'));const p=newProject();p.entities=a;const w=makeWidget({entity:'sensor.test',precision:2,unit:'W'});assert.equal(formatValue(p,w),'3.50 W');p.entities[0].state='unavailable';assert.equal(formatValue(p,w),'—');});
test('Ungültige Pins und unbekannte Icons werden blockiert',()=>{const p=newProject();p.hardware.cs=14;assert.throws(()=>generate(p,icons),/mehrfach/);p.hardware.cs=15;p.widgets[1].icon='mdi:fake-random';assert.throws(()=>generate(p,icons),/nicht in MDI/);});
test('Projektvalidierung und Displaybegrenzung',()=>{const p=validateProject(newProject());const w=boundWidget(makeWidget({x:-4,y:2000,w:999,h:999}),p);assert.equal(w.x,0);assert.equal(w.y,0);assert.equal(w.w,320);assert.equal(w.h,240);});
test('3,5 Zoll ST7796: Größe, GPIO27, Ausrichtung, Layout und Rundreise',()=>{
 const p=newProject();p.widgets[1].parts={name:{x:12,y:8,w:90,h:18}};
 changeHardware(p,{model:'ST7796',backlight:27,dataRate:20});
 assert.deepEqual(dim(p),{width:480,height:320});assert.equal(p.widgets[1].x,24);
 const d=readConfig(generate(p,icons).yaml);
 assert.equal(d.getIn(['display',0,'model']),'ST7796');assert.equal(d.getIn(['display',0,'rotation']),90);
 assert.equal(d.getIn(['display',0,'platform']),'mipi_spi');assert.equal(d.getIn(['display',0,'buffer_size']),'12.5%');assert.equal(d.getIn(['display',0,'color_depth']),8);assert.equal(d.getIn(['display',0,'color_palette']),undefined);
 assert.equal(d.getIn(['display',0,'dimensions','width']),320);assert.equal(d.getIn(['display',0,'dimensions','height']),480);
 assert.equal(d.getIn(['display',0,'data_rate']),'20MHz');assert.equal(d.getIn(['output',0,'pin']),'GPIO27');
 const restored=decodeProject(generate(p,icons).yaml);assert.deepEqual(dim(restored),dim(p));assert.deepEqual(restored.widgets[1].parts,p.widgets[1].parts);
 changeOrientation(p,'portrait');assert.deepEqual(dim(p),{width:320,height:480});
 assert.equal(readConfig(generate(p,icons).yaml).getIn(['display',0,'rotation']),0);
 for(const w of p.widgets){assert.ok(w.x+w.w<=320);assert.ok(w.y+w.h<=480);}
 p.hardware.flip=true;assert.equal(readConfig(generate(p,icons).yaml).getIn(['display',0,'rotation']),180);
});
test('Vorhandenes ST7796 mipi_spi behält Pins und kleinen Puffer',()=>{
 const p=newProject();changeHardware(p,{model:'ST7796',backlight:27,dataRate:20});
 const doc=readConfig(generate(p,icons).yaml);doc.set('font',[]);doc.set('text_sensor',[]);doc.set('output',[]);doc.set('light',[]);
 const display=doc.getIn(['display',0],true);display.set('id','original');display.set('spi_id','original_spi');display.set('data_rate','10MHz');
 doc.getIn(['spi',0],true).set('id','original_spi');
 p.base=doc.toString();p.hardware.replaceDrawing=true;p.hardware.existingDisplay='original';
 const out=readConfig(generate(p,icons).yaml);assert.equal(out.getIn(['display',0,'platform']),'mipi_spi');assert.equal(out.getIn(['display',0,'buffer_size']),'12.5%');assert.equal(out.getIn(['display',0,'data_rate']),'10MHz');assert.equal(out.getIn(['display',0,'cs_pin']),'GPIO15');assert.equal(out.get('display',true).items.length,1);
});
test('Liste: Attribute, geteilte Bindungen, abgeschnittene Zeilen und Rundreise',()=>{
 const p=newProject();changeHardware(p,{model:'ST7796',backlight:27,dataRate:20});
 p.widgets=[makeWidget({kind:'list',label:'Kaffeewerte',w:288,h:160,items:[{entity:'sensor.test',label:'Erster Wert',icon:'mdi:coffee',show:'both',precision:0},{entity:'sensor.test',attribute:'temperature',label:'Attribut',unit:'°C',show:'both',precision:1},{entity:'sensor.test',label:'Wiederholung',show:'both',precision:0}]})];
 const out=generate(p,icons);assert.equal(out.bindings,2);assert.ok(out.yaml.includes('attribute: temperature'));assert.ok(out.yaml.includes('Wiederholung'));assert.ok(out.yaml.includes('mipi_spi'));
 const restored=decodeProject(out.yaml);assert.equal(restored.widgets[0].kind,'list');assert.deepEqual(restored.widgets[0].items,p.widgets[0].items);
 p.widgets[0].h=50;const small=generate(p,icons);assert.ok(small.warnings.some(w=>w.includes('zu klein')));assert.equal(small.bindings,2);
});
test('Display-Steuerung: Starthelligkeit, HA-Bedingung, Boot aus und Zustandswechsel',()=>{
 const p=newProject();p.screenControl={brightness:65,gateEnabled:true,gateEntity:'input_boolean.display_an',lightId:''};
 const out=generate(p,icons),d=readConfig(out.yaml),light=d.getIn(['light',0],true);
 assert.equal(light.get('restore_mode'),'ALWAYS_OFF');assert.equal(light.getIn(['initial_state','brightness']),'65%');assert.equal(light.getIn(['initial_state','state']),false);
 const gate=d.get('text_sensor',true).items.find(n=>n.get('id')==='cydg_display_gate');assert.equal(gate.get('entity_id'),'input_boolean.display_an');assert.equal(gate.get('internal'),true);
 assert.equal(gate.getIn(['on_value',0,'if','then',0,'light.turn_on','brightness']),'65%');assert.equal(gate.getIn(['on_value',0,'if','else',0,'light.turn_off','id']),'cydg_backlight');
 assert.ok(light.getIn(['on_turn_on',0,'if','condition','lambda']).includes('has_state()'));
 const expression=gate.getIn(['on_value',0,'if','condition','lambda']).replace(/^return /,'').replace(/;$/,'');const truth=Function('x','return '+expression);
 for(const x of ['on','true','1'])assert.equal(truth(x),true);for(const x of ['off','false','0','unknown','unavailable','', 'heating'])assert.equal(truth(x),false);
 assert.deepEqual(decodeProject(out.yaml).screenControl,normalizeScreenControl(p.screenControl));
 p.screenControl.gateEnabled=false;const manual=readConfig(generate(p,icons).yaml);assert.equal(manual.getIn(['light',0,'restore_mode']),'ALWAYS_ON');assert.equal(manual.getIn(['light',0,'initial_state','brightness']),'65%');assert.ok(!generate(p,icons).yaml.includes('id: cydg_display_gate'));
 const old=structuredClone(p);delete old.screenControl;assert.equal(validateProject(old).screenControl.brightness,100);
 p.screenControl.gateEnabled=true;p.screenControl.gateEntity='bad';assert.throws(()=>generate(p,icons),/gültige Entität/);
});
test('Vorhandene Hintergrundbeleuchtung gezielt steuern und eigene Automationen erhalten',()=>{
 const p=newProject();p.hardware.backlightEnabled=false;p.base+='\noutput:\n  - platform: ledc\n    id: own_output\n    pin: GPIO21\nlight:\n  - platform: monochromatic\n    id: own_light\n    output: own_output\n    name: Meine Anzeige\n    on_turn_on:\n      then:\n        - logger.log: Eigene Automation\n';
 p.screenControl={brightness:40,gateEnabled:true,gateEntity:'binary_sensor.bewegung',lightId:'own_light'};
 const d=readConfig(generate(p,icons).yaml);assert.equal(d.get('light',true).items.length,1);assert.equal(d.getIn(['light',0,'name']),'Meine Anzeige');assert.equal(d.getIn(['light',0,'on_turn_on',0,'then',0,'logger.log']),'Eigene Automation');assert.equal(d.getIn(['light',0,'on_turn_on',1,'if','then',0,'light.turn_off','id']),'own_light');
 p.screenControl.lightId='missing';assert.throws(()=>generate(p,icons),/Hintergrundbeleuchtung/);p.screenControl.lightId='';assert.throws(()=>generate(p,icons),/Hintergrundbeleuchtung/);
});
test('Touch-Aufwecken: Zeit, Wiederstart und Entitätsvorrang',()=>{
 const p=newProject();changeHardware(p,{model:'ST7796',backlight:27,dataRate:20});p.screenControl={brightness:65,gateEnabled:true,gateEntity:'input_boolean.display_an',touchEnabled:true,touchSeconds:10};
 const out=generate(p,icons),d=readConfig(out.yaml),script=d.getIn(['script',0],true),touch=d.getIn(['touchscreen',0],true);
 assert.equal(touch.get('platform'),'xpt2046');assert.equal(touch.get('cs_pin'),'GPIO33');assert.equal(touch.get('spi_id'),'cydg_spi');assert.equal(touch.get('display'),'cydg_display');assert.equal(script.get('mode'),'restart');assert.equal(script.getIn(['then',0,'globals.set','value']),'true');assert.equal(script.getIn(['then',1,'light.turn_on','brightness']),'65%');assert.equal(script.getIn(['then',2,'delay']),'10s');assert.equal(script.getIn(['then',3,'globals.set','value']),'false');
 const gate=d.get('text_sensor',true).items.find(n=>n.get('id')==='cydg_display_gate');
 const evaluate=(lambda,active,state,hasState=true)=>Function('id',lambda.replace(/id\((cydg_\w+)\)/g,'id("$1")'))(name=>name==='cydg_touch_active'?active:{state,has_state:()=>hasState});
 const guard=d.getIn(['light',0,'on_turn_on',0,'if','condition','lambda']),timeout=script.getIn(['then',4,'if','condition','lambda']),wake=touch.getIn(['on_touch',0,'if','condition','lambda']),falseUpdate=gate.getIn(['on_value',0,'if','else',0,'if','condition','lambda']);
 assert.equal(evaluate(guard,true,'off'),false);assert.equal(evaluate(guard,false,'off'),true);assert.equal(evaluate(falseUpdate,true,'off'),false);assert.equal(evaluate(falseUpdate,false,'off'),true);
 for(const state of ['off','unknown','unavailable']){assert.equal(evaluate(timeout,false,state),true);assert.equal(evaluate(wake,false,state),true);}
 for(const state of ['on','true','1']){assert.equal(evaluate(timeout,false,state),false);assert.equal(evaluate(wake,false,state),false);assert.equal(evaluate(wake,true,state),true);}
 assert.equal(evaluate(timeout,false,'on',false),true);
 assert.equal(decodeProject(out.yaml).screenControl.touchSeconds,10);p.screenControl.touchSeconds=27;assert.equal(readConfig(generate(p,icons).yaml).getIn(['script',0,'then',2,'delay']),'27s');
 p.screenControl.gateEnabled=false;const manual=readConfig(generate(p,icons).yaml);for(const key of ['script','globals','touchscreen'])assert.equal(manual.has(key),false);
});
test('Vorhandenen Touchscreen erhalten, fehlende IDs und falsche Boards blockieren',()=>{
 const p=newProject();p.screenControl={gateEnabled:true,gateEntity:'input_boolean.display_an',touchEnabled:true};assert.throws(()=>generate(p,icons),/3,5/);
 p.base+='\ntouchscreen:\n  platform: xpt2046\n  id: own_touch\n  cs_pin: GPIO33\n  calibration:\n    x_min: 200\n    x_max: 3800\n    y_min: 300\n    y_max: 3700\n  on_touch:\n    then:\n      - logger.log: Eigene Touch-Aktion\n';
 p.screenControl.touchscreenId='own_touch';const d=readConfig(generate(p,icons).yaml);assert.equal(d.getIn(['touchscreen','calibration','x_min']),200);assert.equal(d.getIn(['touchscreen','on_touch',0,'then',0,'logger.log']),'Eigene Touch-Aktion');assert.equal(d.getIn(['touchscreen','on_touch',1,'if','then',0,'script.execute']),'cydg_touch_wake');
 p.screenControl.touchscreenId='missing';assert.throws(()=>generate(p,icons),/Touchscreen-ID/);
 assert.equal(normalizeScreenControl().touchSeconds,10);assert.equal(normalizeScreenControl({touchSeconds:0}).touchSeconds,1);assert.equal(normalizeScreenControl({touchSeconds:9999}).touchSeconds,600);
});
console.log(`${count} generator checks passed.`);
