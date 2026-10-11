import {normalizeScreenControl,gateTruthCPP} from './screen-control.mjs';
import {createId} from './id.mjs';
import {ensurePages,capturePage,allProjectWidgets,snapshotLayout,restoreLayout,MAX_PAGES,pageIndicatorFor} from './pages.mjs';
export {ensurePages,capturePage,changePage,addPage,deletePage,allProjectWidgets,pageIndicatorFor} from './pages.mjs';
import {WIDGET_KINDS,normalizeAdvancedWidget} from './advanced.mjs';
import {advancedDrawCPP,ADVANCED_CPP} from './advanced-export.mjs';
import {normalizeList,listRows,drawingWidgets,listRequiredHeight} from './list.mjs';
import {getTheme} from './themes.mjs';
import {parseDocument,isMap,isSeq,isScalar,Scalar} from 'yaml';
import {normalizeParts,scaleParts} from './parts.mjs';
import {normalizeFrame,FRAME_CPP} from './frame.mjs';
import {HARDWARE_MODELS,hardwareSpec,nativeDimensions,displayDimensions,displayRotation} from './hardware.mjs';

export const BASE=`esphome:
  name: kaffeebar
  friendly_name: Kaffeebar
  min_version: 2026.4.0
  name_add_mac_suffix: false

esp32:
  variant: esp32
  framework:
    type: esp-idf

# Enable logging
logger:

# Enable Home Assistant API
api:
  encryption:
    key: !secret kaffeebar__encryption_key

# Allow Over-The-Air updates
ota:
  - platform: esphome

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password
`;
export {HA_TEMPLATE,makeHATemplate,COFFEE_ENTITIES} from './ha-template.mjs';
export const DEMO=[
 {entity_id:'sensor.beispiel_leistung',state:'842',attributes:{friendly_name:'Leistung',unit_of_measurement:'W',device_class:'power',icon:'mdi:flash'},demo:true},
 {entity_id:'sensor.beispiel_temperatur',state:'22.4',attributes:{friendly_name:'Raumtemperatur',unit_of_measurement:'°C',device_class:'temperature',icon:'mdi:thermometer'},demo:true},
 {entity_id:'binary_sensor.beispiel_tuer',state:'off',attributes:{friendly_name:'Haustür',device_class:'door',icon:'mdi:door-closed'},demo:true},
 {entity_id:'climate.beispiel_wohnzimmer',state:'heat',attributes:{friendly_name:'Wohnzimmer',current_temperature:21.4,temperature:22,icon:'mdi:thermostat'},demo:true},
 {entity_id:'sensor.beispiel_feuchte',state:'48',attributes:{friendly_name:'Luftfeuchtigkeit',unit_of_measurement:'%',device_class:'humidity',icon:'mdi:water-percent'},demo:true}
];
export const dim=p=>displayDimensions(p.hardware?.model,p.orientation);
export const clamp=(x,a,b)=>Math.min(b,Math.max(a,Number(x)||0));
export function makeWidget(extra={}) {return normalizeAdvancedWidget(normalizeList({id:'w'+createId().replace(/-/g,''),kind:'entity',entity:'',attribute:'',label:'Neuer Messwert',show:'both',x:16,y:16,w:144,h:76,nameSize:12,valueSize:25,iconSize:26,color:'#f6f8fc',nameColor:'#a4b3c8',iconColor:'#8cadff',bg:'#182334',transparent:false,borderColor:'#8cadff',borderWidth:0,cornerRadius:0,icon:'mdi:flash',wrap:true,breakLine:true,padding:10,align:'left',precision:1,unit:'',onText:'An',offText:'Aus',preview:'—',...extra}));}
export function newProject(){const p={version:1,title:'Kaffeebar',base:BASE,themeId:null,screenControl:normalizeScreenControl(),orientation:'landscape',background:'#0c1422',grid:true,snap:4,entities:structuredClone(DEMO),widgets:[
 makeWidget({kind:'text',label:'Kaffeebar',show:'name',x:16,y:12,w:288,h:34,nameSize:19,icon:'mdi:coffee',iconSize:22,nameColor:'#f6f8fc',transparent:true,padding:0}),
 makeWidget({entity:DEMO[0].entity_id,label:'Leistung',x:16,y:58,w:288,h:80,valueSize:32,icon:'mdi:flash',iconSize:32,unit:'W',precision:0}),
 makeWidget({entity:DEMO[1].entity_id,label:'Temperatur',x:16,y:150,w:140,h:74,valueSize:22,icon:'mdi:thermometer',iconSize:22,unit:'°C'}),
 makeWidget({entity:DEMO[2].entity_id,label:'Haustür',x:168,y:150,w:136,h:74,valueSize:16,icon:'mdi:door-closed',iconSize:20,onText:'Offen',offText:'Zu'})
 ],hardware:{model:'ILI9341',dataRate:40,clk:14,mosi:13,miso:12,cs:15,dc:2,backlight:21,invert:false,colorOrder:'BGR',flip:false,existingDisplay:'',replaceDrawing:false,backlightEnabled:true}};ensurePages(p);return p;}
export function normalizePaste(s){return String(s).replace(/&#x20;|&#32;/g,' ').replace(/\\\r?\n/g,'\n').replace(/^\\#/gm,'#').replace(/^(\s*)\\-/gm,'$1-').replace(/\\\s*$/,'').replace(/^```(?:yaml|yml)?\s*\n|\n```\s*$/g,'');}
export function readConfig(source){
 const doc=parseDocument(normalizePaste(source),{uniqueKeys:true,keepSourceTokens:true,customTags:['!secret','!lambda','!include','!env_var'].map(tag=>({tag,resolve:s=>s}))});
 if(doc.errors.length)throw new Error(doc.errors[0].message);
 if(!isMap(doc.contents))throw new Error('Die Konfiguration muss ein YAML-Dokument mit Abschnitten sein.');
 if(!doc.has('esphome')||!doc.has('esp32'))throw new Error('Die Abschnitte esphome: und esp32: fehlen.');
 return doc;
}
function list(doc,key){const n=doc.get(key,true);return !n?[]:isSeq(n)?n.items:[n];}
export function entitiesFromConfig(doc){const m=new Map();for(const section of ['sensor','text_sensor','binary_sensor'])for(const n of list(doc,section))if(isMap(n)&&n.get('platform')==='homeassistant'&&n.get('entity_id')){const id=String(n.get('entity_id'));if(!m.has(id))m.set(id,{entity_id:id,state:'unknown',attributes:{friendly_name:String(n.get('name')||id.split('.')[1]),...(n.get('unit_of_measurement')?{unit_of_measurement:String(n.get('unit_of_measurement'))}:{}),...(n.get('device_class')?{device_class:String(n.get('device_class'))}:{})},source:'yaml'});if(n.get('attribute'))m.get(id).attributes[String(n.get('attribute'))]='';}return [...m.values()];}
export function parseEntities(input){let a;try{a=JSON.parse(input);}catch{throw new Error('Bitte den JSON-Export aus Home Assistant einfügen.');}if(!Array.isArray(a))a=Array.isArray(a?.result)?a.result:Array.isArray(a?.states)?a.states:Array.isArray(a?.entities)?a.entities:null;if(!a)throw new Error('Erwartet wird eine Liste von Home-Assistant-Zuständen.');const m=new Map();for(const e of a){if(!e||typeof e.entity_id!=='string'||!/^\w+\.[\w]+$/.test(e.entity_id))continue;m.set(e.entity_id,{entity_id:e.entity_id,state:String(e.state??'unknown'),attributes:e.attributes&&typeof e.attributes==='object'&&!Array.isArray(e.attributes)?e.attributes:{},source:'ha'});}if(!m.size)throw new Error('Keine gültigen Entitäten gefunden.');return [...m.values()];}
export const getEntity=(p,w)=>p.entities.find(e=>e.entity_id===w.entity);
export function inferType(e,attr=''){if(!e)return {type:'Unbekannt',icon:'mdi:help-circle-outline',certain:false};const dc=e.attributes?.device_class;const state=attr?e.attributes?.[attr]:e.state;const domain=e.entity_id.split('.')[0];if(attr){return {type:typeof state==='number'||(state!==''&&Number.isFinite(Number(state)))?'Zahl':'Text',icon:e.attributes?.icon||'mdi:text',certain:state!==undefined};}if(domain==='binary_sensor'||['switch','light','input_boolean'].includes(domain))return {type:'Binär / Status',icon:e.attributes?.icon||(dc==='door'?'mdi:door-closed':'mdi:toggle-switch'),certain:true};if(domain==='sensor'||domain==='input_number'||domain==='number'){return {type:e.attributes?.unit_of_measurement||e.attributes?.state_class||(state!==''&&Number.isFinite(Number(state)))?'Zahl / Messwert':'Text / Status',icon:e.attributes?.icon||({temperature:'mdi:thermometer',humidity:'mdi:water-percent',power:'mdi:flash',energy:'mdi:lightning-bolt'}[dc]||'mdi:gauge'),certain:!!e.attributes?.unit_of_measurement||!['unknown','unavailable',''].includes(state)};}return {type:({climate:'Klima',weather:'Wetter',person:'Person',cover:'Rollladen',lock:'Schloss',media_player:'Medien'})[domain]||'Text / Status',icon:e.attributes?.icon||'mdi:information-outline',certain:true};}
export function formatValue(p,w){const e=getEntity(p,w);let s=w.attribute?e?.attributes?.[w.attribute]:e?.state;if(s===undefined||s===null||s==='unknown'||s==='unavailable')return e?'—':w.preview||'—';if(typeof s==='object')s=JSON.stringify(s);s=String(s);if(s==='on')s=w.onText;if(s==='off')s=w.offText;if(s.trim()!==''&&Number.isFinite(Number(s))&&w.precision>=0)s=Number(s).toFixed(w.precision);return s+(w.unit?' '+w.unit:'');}
export function boundWidget(w,p){const d=dim(p);w.w=Math.round(clamp(w.w,24,d.width));w.h=Math.round(clamp(w.h,16,d.height));w.x=Math.round(clamp(w.x,0,d.width-w.w));w.y=Math.round(clamp(w.y,0,d.height-w.h));return normalizeAdvancedWidget(normalizeList(normalizeParts(normalizeFrame(w))));}
function resizeLayout(p,old){const d=dim(p);for(const w of p.widgets){const ow=w.w,oh=w.h;w.x=Math.round(w.x*d.width/old.width);w.y=Math.round(w.y*d.height/old.height);w.w=Math.round(w.w*d.width/old.width);w.h=Math.round(w.h*d.height/old.height);scaleParts(w,ow,oh);boundWidget(w,p);}}
export function changeOrientation(p,v){
 v=v==='portrait'?'portrait':'landscape';if(v===p.orientation)return;
 capturePage(p);const old=dim(p),active=p.activePage;p.orientation=v;
 for(const page of p.pages){p.widgets=structuredClone(page.widgets);if(page.layouts[v]){resizeLayout(p,old);restoreLayout(p.widgets,page.layouts[v]);for(const w of p.widgets)boundWidget(w,p);}else resizeLayout(p,old);page.widgets=structuredClone(p.widgets);page.layouts[v]=snapshotLayout(p.widgets);}
 p.widgets=structuredClone(p.pages.find(page=>page.id===active).widgets);
}
export function changeHardware(p,settings){
 capturePage(p);const old=dim(p),oldModel=p.hardware.model;Object.assign(p.hardware,settings);
 for(const page of p.pages){p.widgets=structuredClone(page.widgets);resizeLayout(p,old);page.widgets=structuredClone(p.widgets);
  for(const orientation of ['portrait','landscape'])if(page.layouts[orientation]){const oldDim=displayDimensions(oldModel,orientation),newDim=displayDimensions(p.hardware.model,orientation);for(const r of page.layouts[orientation]){const ow=r.w,oh=r.h;r.x=Math.round(r.x*newDim.width/oldDim.width);r.y=Math.round(r.y*newDim.height/oldDim.height);r.w=Math.round(r.w*newDim.width/oldDim.width);r.h=Math.round(r.h*newDim.height/oldDim.height);scaleParts(r,ow,oh);}}
  page.layouts[p.orientation]=snapshotLayout(page.widgets);
 }
 p.widgets=structuredClone(p.pages.find(page=>page.id===p.activePage).widgets);
}
export function validateProject(o){
 if(o?.version!==1||typeof o.base!=='string'||!Array.isArray(o.widgets)||!Array.isArray(o.entities)||o.widgets.length>100)throw new Error('Keine gültige CYD-Atelier-Projektdatei.');
 if(o.pages!==undefined&&(!Array.isArray(o.pages)||!o.pages.length||o.pages.length>MAX_PAGES))throw new Error('Maximal acht gültige Displayseiten sind möglich.');
 readConfig(o.base);const defaults=newProject(),p={...defaults,...o,hardware:{...defaults.hardware,...o.hardware}};
 // A missing setting belongs to an older project whose pageTouch drew the footer.
 p.pageIndicator=o.pageIndicator;
 p.themeId=getTheme(o.themeId)?.id||null;p.screenControl=normalizeScreenControl(o.screenControl);p.title=String(o.title||'Mein Display').slice(0,60);p.snap=clamp(o.snap||4,1,16);p.grid=!!o.grid;
 for(const k of ['clk','mosi','miso','cs','dc','backlight'])p.hardware[k]=Math.round(clamp(p.hardware[k],0,39));
 p.hardware.model=HARDWARE_MODELS[p.hardware.model]?p.hardware.model:'ILI9341';p.hardware.dataRate=[10,20,40].includes(Number(o.hardware?.dataRate))?Number(o.hardware.dataRate):hardwareSpec(p.hardware.model).dataRate;p.hardware.colorOrder=p.hardware.colorOrder==='RGB'?'RGB':'BGR';p.hardware.existingDisplay=String(p.hardware.existingDisplay||'').replace(/[^\w]/g,'');
 p.orientation=o.orientation==='portrait'?'portrait':'landscape';p.background=/^#[0-9a-f]{6}$/i.test(o.background)?o.background:'#0c1422';
 p.entities=(o.entities.length?parseEntities(JSON.stringify(o.entities)):[]).map(e=>({...e,demo:!!o.entities.find(x=>x.entity_id===e.entity_id)?.demo}));
 let nextId=0;const cleanWidgets=(widgets,orientation=p.orientation)=>{
  if(!Array.isArray(widgets))throw new Error('Eine Displayseite enthält keine gültige Widgetliste.');
  return widgets.map(w=>{const n=makeWidget(w);n.id='w'+nextId++;
   for(const k of ['nameSize','valueSize','iconSize'])n[k]=Math.round(clamp(n[k],8,64));n.padding=clamp(n.padding,0,24);n.precision=clamp(n.precision,-1,5);
   for(const k of ['color','nameColor','iconColor','bg'])if(!/^#[0-9a-f]{6}$/i.test(n[k]))n[k]='#ffffff';
   for(const k of ['label','entity','attribute','icon','unit','onText','offText','preview'])n[k]=String(n[k]||'').slice(0,2000);
   n.kind=WIDGET_KINDS.includes(n.kind)?n.kind:'entity';n.show=['both','name','value'].includes(n.show)?n.show:'both';n.align=['left','center','right'].includes(n.align)?n.align:'left';return boundWidget(n,{...p,orientation});
  });
 };
 const sourcePages=o.pages||[{id:'page1',name:'Seite 1',widgets:o.widgets,layouts:{}}];
 if(sourcePages.some(page=>!page||typeof page!=='object'))throw new Error('Eine Displayseite ist beschädigt.');
 const sourceActive=sourcePages.some(page=>page.id===o.activePage)?o.activePage:sourcePages[0].id;
 const total=sourcePages.reduce((n,page)=>n+(page.id===sourceActive?o.widgets.length:(Array.isArray(page.widgets)?page.widgets.length:101)),0);
 if(total>100)throw new Error('Maximal 100 Widgets im gesamten Projekt sind möglich.');
 const pageIds=new Set();p.pages=sourcePages.map((page,index)=>{
  if(!page||typeof page!=='object')throw new Error('Eine Displayseite ist beschädigt.');
  let id=String(page.id||'page'+index).replace(/[^\w-]/g,'').slice(0,80)||'page'+index;if(pageIds.has(id))throw new Error('Displayseiten müssen unterschiedliche IDs haben.');pageIds.add(id);
  const originals=page.id===sourceActive?o.widgets:page.widgets,widgets=cleanWidgets(originals),remap=new Map(originals.map((w,i)=>[String(w.id),widgets[i].id]));
  const layouts={};for(const orientation of ['portrait','landscape'])if(Array.isArray(page.layouts?.[orientation])){
   layouts[orientation]=page.layouts[orientation].slice(0,100).filter(r=>r&&remap.has(String(r.id))).map(r=>{const n={...r,id:remap.get(String(r.id))};const d=displayDimensions(p.hardware.model,orientation);n.w=Math.round(clamp(n.w,24,d.width));n.h=Math.round(clamp(n.h,16,d.height));n.x=Math.round(clamp(n.x,0,d.width-n.w));n.y=Math.round(clamp(n.y,0,d.height-n.h));normalizeParts(n);return {id:n.id,x:n.x,y:n.y,w:n.w,h:n.h,parts:n.parts};});
  }
  layouts[p.orientation]=snapshotLayout(widgets);
  return {id,name:String(page.name||'Seite '+(index+1)).trim().slice(0,60)||'Seite '+(index+1),widgets,layouts,background:/^#[0-9a-f]{6}$/i.test(page.background)?page.background:p.background,indicator:page.indicator};
 });
 p.activePage=p.pages[sourcePages.findIndex(page=>page.id===sourceActive)].id;p.widgets=structuredClone(p.pages.find(page=>page.id===p.activePage).widgets);
 ensurePages(p);capturePage(p);return p;
}
export const META='# cyd-atelier-project: ';
export function encodeProject(p){capturePage(p);return btoa(Array.from(new TextEncoder().encode(JSON.stringify(p)),b=>String.fromCharCode(b)).join(''));}
export function decodeProject(s){const m=s.match(/^# cyd-atelier-project: (\S+)$/m);if(!m)return null;try{return validateProject(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(m[1]),c=>c.charCodeAt(0)))));}catch{throw new Error('Die eingebetteten Projektinformationen sind beschädigt.');}}
const cstr=s=>JSON.stringify(String(s)).replace(/[\u2028\u2029]/g,' ');
const col=s=>`Color(0x${s.replace('#','')})`;
function append(doc,key,data){let n=doc.get(key,true);if(!n){doc.set(key,doc.createNode([]));n=doc.get(key,true);}if(!isSeq(n)){if(isMap(n)){const s=doc.createNode([n]);doc.set(key,s);n=s;}else throw new Error(`${key}: verwendet einen Verweis oder ungültiges Format. Bitte diesen Abschnitt vor dem Export als Liste einfügen.`);}for(const item of data)n.add(doc.createNode(item));}
export function generate(p,iconMap){
 capturePage(p);const doc=readConfig(p.base);const warnings=[];const pages=p.pages,allWidgets=allProjectWidgets(p);
 if(doc.has('lvgl'))throw new Error('Diese Basis enthält bereits LVGL. Ein fremdes LVGL-Layout kann nicht verlustfrei in diesen Editor importiert werden. Verwende die Geräte-Basis ohne den LVGL-/Display-Layoutblock; bewahre die Originaldatei auf.');
 if(!doc.has('api'))throw new Error('Für Home-Assistant-Entitäten wird api: in der Basis benötigt.');
 if(/\bid:\s*["']?cydg_/m.test(p.base))throw new Error('Die Basis enthält bereits cydg_-IDs. Importiere den vollständigen Atelier-Export mit Projektinformationen.');
 if(pages.some(page=>page.widgets.length>40))throw new Error('Maximal 40 Widgets pro Displayseite, damit der ESP32-Speicher überschaubar bleibt.');
 if(allWidgets.length>100)throw new Error('Maximal 100 Widgets im gesamten Projekt sind möglich.');
 const h=p.hardware;const d=dim(p);const control=normalizeScreenControl(p.screenControl);const touchWake=control.gateEnabled&&control.touchEnabled;
 if(control.gateEnabled&&!/^\w+\.[\w]+$/.test(control.gateEntity))throw new Error('Bitte unter „Helligkeit & Ein/Aus“ eine gültige Entität wählen.');
 const rotation=model=>displayRotation(model,p.orientation,h.flip);
 const nativeDim=nativeDimensions;const textSizes=new Set(), iconSizes=new Map(), bindings=new Map();
 const dataWidgets=allWidgets.flatMap(w=>w.kind==='list'?listRows(w,true):w);
 const renderWidgets=pages.flatMap((page,index)=>page.widgets.flatMap(drawingWidgets).map(w=>({...w,exportPage:index})));
 for(const w of allWidgets)if(w.kind==='list'&&listRequiredHeight(w)>w.h)warnings.push('Die Liste „'+w.label+'“ ist zu klein. Vergrößere sie oder reduziere Zeilenhöhe und Abstand; untere Zeilen werden abgeschnitten.');
 const allChars=new Set(Array.from(' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~ÄÖÜäöüß°²³µ€–—…'));
 for(const w of dataWidgets){
  const valued=!['text','list','frame','button'].includes(w.kind)&&w.show!=='name';
  if(w.show!=='value'||w.kind==='text'||w.kind==='button')textSizes.add(w.nameSize);if(valued)textSizes.add(w.valueSize);
  for(const t of [w.label,w.unit,w.onText,w.offText,...(w.rules||[]).map(r=>r.value)])for(const c of String(t||''))if(c!=='\n'&&c!=='\r')allChars.add(c);
  for(const name of new Set([w.icon,...(w.rules||[]).map(r=>r.icon)].filter(Boolean))){const icon=iconMap.get(name.replace(/^mdi:/,''));if(!icon)throw new Error(`Das Icon „${name}“ ist nicht in MDI 7.4 enthalten. Bitte im Icon-Picker auswählen.`);if(!iconSizes.has(w.iconSize))iconSizes.set(w.iconSize,new Set());iconSizes.get(w.iconSize).add(icon.code);}
  const needsBinding=w.kind!=='clock'&&w.kind!=='button'&&(valued||['bar','ring'].includes(w.kind)||(w.rules||[]).length>0);
  if(needsBinding){if(!/^\w+\.[\w]+$/.test(w.entity))throw new Error(`Bitte für „${w.label}“ eine gültige Entität auswählen.`);const k=w.entity+'|'+w.attribute;if(!bindings.has(k))bindings.set(k,{id:'cydg_value_'+bindings.size,platform:'homeassistant',entity_id:w.entity,...(w.attribute?{attribute:w.attribute}:{}),internal:true});if(getEntity(p,w)?.demo)warnings.push(`„${w.label}“ verwendet noch eine Beispiel-Entität.`);}
 }
 if(allWidgets.some(w=>w.kind==='clock')){try{new Intl.DateTimeFormat('de-DE',{timeZone:p.timezone}).format();}catch{throw new Error('Bitte eine gültige Zeitzone wählen, zum Beispiel Europe/Berlin.');}append(doc,'time',[{platform:'homeassistant',id:'cydg_clock',timezone:p.timezone}]);warnings.push('Die Uhr benötigt eine Verbindung des ESPHome-Geräts mit Home Assistant zur Zeitsynchronisation.');}
 if(pages.length>1){
  append(doc,'globals',[{id:'cydg_page',type:'int',restore_value:false,initial_value:String(Math.max(0,pages.findIndex(page=>page.id===p.activePage)))}]);
 }
 if(!textSizes.size)textSizes.add(12);
 const fonts=[...textSizes].sort((a,b)=>a-b).map(size=>({file:'gfonts://Roboto',id:'cydg_text_'+size,size,bpp:4,glyphs:[...allChars].join('')}));
 for(const [size,glyphs] of iconSizes)fonts.push({file:{type:'web',url:'https://raw.githubusercontent.com/Templarian/MaterialDesign-Webfont/v7.4.47/fonts/materialdesignicons-webfont.ttf'},id:'cydg_icon_'+size,size,bpp:4,glyphs:[...glyphs].map(c=>String.fromCodePoint(c))});
 if(fonts.length>12)warnings.push('Viele unterschiedliche Schriftgrößen benötigen mehr Flash-Speicher. Gleiche Größen werden wiederverwendet.');
 if(fonts.length)append(doc,'font',fonts);
 if(bindings.size)append(doc,'text_sensor',[...bindings.values()]);
 let disp;const existing=list(doc,'display');
 if(existing.length){if(!h.replaceDrawing)throw new Error('Die Basis enthält bereits ein Display. Unter „Hardware“ das Ziel wählen und den Austausch seines Zeichenblocks bestätigen. Andere Abschnitte bleiben erhalten.');disp=existing.find(n=>isMap(n)&&String(n.get('id')||'')===h.existingDisplay);if(!disp)throw new Error('Bitte ein vorhandenes Display mit expliziter ID unter „Hardware“ auswählen.');if(!(disp.get('platform')==='ili9xxx'||(disp.get('platform')==='mipi_spi'&&String(disp.get('model')).toUpperCase()==='ST7796'))||!HARDWARE_MODELS[String(disp.get('model')).toUpperCase()])throw new Error('Vorhandene Displays werden mit ili9xxx (ILI9341 / ILI9342 / ST7796) und mipi_spi (ST7796) unterstützt.');disp.delete('pages');disp.delete('transform');const model=String(disp.get('model')).toUpperCase();if(model!==h.model)throw new Error('Wähle unter Hardware den Treiber des vorhandenen Displays, damit die Arbeitsfläche zur Auflösung passt.');disp.set('rotation',rotation(model));const dims=disp.get('dimensions',true);if(isMap(dims)){dims.set('width',nativeDim(model).width);dims.set('height',nativeDim(model).height);}warnings.push('Zeichenblock und Ausrichtung des gewählten Displays werden ersetzt; seine Pins bleiben erhalten.');}
 else {for(const k of ['clk','mosi','miso','cs','dc','backlight'])if(!Number.isInteger(Number(h[k]))||Number(h[k])<0||Number(h[k])>39)throw new Error(`Ungültiger GPIO für ${k}.`);if(!HARDWARE_MODELS[h.model])throw new Error('Ungültiger Displaytreiber.');const writePins=[h.clk,h.mosi,h.cs,h.dc,...(h.backlightEnabled?[h.backlight]:[])].map(Number);if(new Set(writePins).size!==writePins.length)throw new Error('Display-Pins dürfen nicht mehrfach belegt werden.');if(writePins.some(n=>n>33))throw new Error('GPIO34–39 können beim klassischen ESP32 nicht als Ausgang verwendet werden.');append(doc,'spi',[{id:'cydg_spi',clk_pin:'GPIO'+h.clk,mosi_pin:'GPIO'+h.mosi,miso_pin:'GPIO'+h.miso}]);
 // ST7796 on the 3.5-inch ESP32 board has no PSRAM. Draw in eight strips (19,200 bytes).
 // The lambda only draws and reads states, so repeated calls have no side effects.
 const smallBuffer=h.model==='ST7796';
 append(doc,'display',[{platform:smallBuffer?'mipi_spi':'ili9xxx',model:h.model,id:'cydg_display',spi_id:'cydg_spi',cs_pin:'GPIO'+h.cs,dc_pin:'GPIO'+h.dc,data_rate:(h.dataRate||hardwareSpec(h.model).dataRate)+'MHz',invert_colors:!!h.invert,color_order:h.colorOrder==='RGB'?'RGB':'BGR',...(smallBuffer?{color_depth:8,buffer_size:'12.5%'}:{color_palette:'8BIT'}),dimensions:nativeDim(h.model),rotation:rotation(h.model),update_interval:'1s'}]);disp=list(doc,'display').at(-1);
 if(h.backlightEnabled){append(doc,'output',[{platform:'ledc',pin:'GPIO'+h.backlight,id:'cydg_backlight_output'}]);append(doc,'light',[{platform:'monochromatic',output:'cydg_backlight_output',id:'cydg_backlight',name:'Display-Helligkeit',restore_mode:control.gateEnabled?'ALWAYS_OFF':'ALWAYS_ON',initial_state:{state:!control.gateEnabled,brightness:control.brightness+'%'},default_transition_length:'0s'}]);}}
 const refreshPage=()=>({'component.update':String(disp.get('id'))});
 if(pages.length>1&&p.pageSeconds>0)append(doc,'interval',[{interval:p.pageSeconds+'s',then:[{lambda:p.pageSwitchMode==='random'?`id(cydg_page) = (id(cydg_page) + 1 + static_cast<int>(esphome::random_uint32() % ${pages.length-1})) % ${pages.length};`:`id(cydg_page) = (id(cydg_page) + 1) % ${pages.length};`},refreshPage()]}]);
 const attachTrigger=(touch,key,actions)=>{
  const old=touch.get(key,true);if(old&&!isSeq(old)&&!isMap(old))throw new Error('Die vorhandene '+key+'-Automation verwendet einen Verweis. Bitte als YAML-Liste einfügen.');
  if(!old)touch.set(key,doc.createNode(actions));else if(isSeq(old))for(const action of actions)old.add(doc.createNode(action));else touch.set(key,doc.createNode([old,...actions]));
 };
 const attachTouch=(touch,actions)=>attachTrigger(touch,'on_touch',actions);
 const getTouchscreen=()=>{
  const touchscreens=list(doc,'touchscreen');
  if(control.touchscreenId){const touch=touchscreens.find(n=>isMap(n)&&n.get('id')===control.touchscreenId);if(!touch)throw new Error('Die gewählte Touchscreen-ID fehlt in der Basis-Konfiguration.');return touch;}
  const generated=touchscreens.find(n=>isMap(n)&&n.get('id')==='cydg_touchscreen');if(generated)return generated;
  if(touchscreens.length)throw new Error('Bitte unter „Helligkeit & Ein/Aus“ die vorhandene Touchscreen-ID auswählen.');
  if(h.model!=='ST7796')throw new Error('Automatischer Touch ist für dein 3,5″-Board ESP32-3248S035R verfügbar. Für andere Boards einen Touchscreen in der Basis konfigurieren und dessen ID auswählen.');
  const spiId=disp.get('spi_id'),bus=list(doc,'spi').find(n=>isMap(n)&&n.get('id')===spiId);
  const pin=n=>isScalar(n)?String(n.value):isMap(n)?String(n.get('number')):'';
  if(!bus||pin(bus.get('clk_pin',true))!=='GPIO14'||pin(bus.get('mosi_pin',true))!=='GPIO13'||pin(bus.get('miso_pin',true))!=='GPIO12')throw new Error('Automatischer Touch benötigt den SPI-Bus des 3,5″-Boards mit GPIO14/13/12 und expliziter ID. Andernfalls einen vorhandenen Touchscreen auswählen.');
  if([pin(disp.get('cs_pin',true)),pin(disp.get('dc_pin',true)),...list(doc,'output').filter(isMap).map(n=>pin(n.get('pin',true)))].includes('GPIO33'))throw new Error('GPIO33 wird bereits verwendet und ist auf diesem Board für Touch-CS erforderlich.');
  append(doc,'touchscreen',[{platform:'xpt2046',id:'cydg_touchscreen',display:String(disp.get('id')),spi_id:String(spiId),cs_pin:'GPIO33',update_interval:'50ms',threshold:400,calibration:{x_min:0,x_max:4095,y_min:0,y_max:4095}}]);
  return list(doc,'touchscreen').at(-1);
 };
 const generatedBacklight=!existing.length&&h.backlightEnabled;
 const lightId=control.lightId||(generatedBacklight?'cydg_backlight':'');
 if(control.gateEnabled||control.brightness!==100||control.lightId){
  const target=list(doc,'light').find(n=>isMap(n)&&n.get('id')===lightId);
  if(!target)throw new Error('Für Helligkeit und Ein/Aus wird eine Hintergrundbeleuchtung benötigt. Unter Hardware aktivieren oder unter „Helligkeit & Ein/Aus“ die vorhandene Light-ID auswählen.');
  if(target.get('platform')!=='monochromatic')throw new Error('Die Hintergrundbeleuchtung muss als monochromatic-Licht mit Helligkeitsregelung konfiguriert sein.');
  target.set('restore_mode',control.gateEnabled?'ALWAYS_OFF':'ALWAYS_ON');target.set('initial_state',doc.createNode({state:!control.gateEnabled,brightness:control.brightness+'%'}));
  if(control.gateEnabled){
   const turnOff={'light.turn_off':{id:lightId,transition_length:'0s'}};
   const turnOn={'light.turn_on':{id:lightId,brightness:control.brightness+'%',transition_length:'0s'}};
   append(doc,'text_sensor',[{platform:'homeassistant',id:'cydg_display_gate',entity_id:control.gateEntity,internal:true,filters:[{to_lower:null}],on_value:[{if:{condition:{lambda:'return '+gateTruthCPP('x')+';'},then:[turnOn],else:touchWake?[{if:{condition:{lambda:'return !id(cydg_touch_active);'},then:[turnOff]}}]:[turnOff]}}]}]);
   const guard={if:{condition:{lambda:'return '+(touchWake?'!id(cydg_touch_active) && (':'')+'!id(cydg_display_gate).has_state() || !('+gateTruthCPP('id(cydg_display_gate).state')+')'+(touchWake?')':'')+';'},then:[turnOff]}};
   const old=target.get('on_turn_on',true);
   if(old&&!isSeq(old)&&!isMap(old))throw new Error('Die vorhandene on_turn_on-Automation verwendet einen Verweis. Bitte als YAML-Liste einfügen.');
   if(!old)target.set('on_turn_on',doc.createNode([guard]));else if(isSeq(old))old.add(doc.createNode(guard));else target.set('on_turn_on',doc.createNode([old,guard]));
   if(touchWake){
    const gateOff='!id(cydg_display_gate).has_state() || !('+gateTruthCPP('id(cydg_display_gate).state')+')';
    append(doc,'globals',[{id:'cydg_touch_active',type:'bool',restore_value:false,initial_value:'false'}]);
    append(doc,'script',[{id:'cydg_touch_wake',mode:'restart',then:[{'globals.set':{id:'cydg_touch_active',value:'true'}},turnOn,{delay:control.touchSeconds+'s'},{'globals.set':{id:'cydg_touch_active',value:'false'}},{if:{condition:{lambda:'return '+gateOff+';'},then:[turnOff]}}]}]);
    const wake={if:{condition:{lambda:'return id(cydg_touch_active) || '+gateOff+';'},then:[{'script.execute':'cydg_touch_wake'}]}};
    const interactive=p.pageTouch&&pages.length>1||allWidgets.some(w=>w.kind==='button'&&w.actionService);
    if(interactive){append(doc,'globals',[{id:'cydg_touch_was_awake',type:'bool',restore_value:false,initial_value:'false'}]);attachTouch(getTouchscreen(),[{lambda:'id(cydg_touch_was_awake) = id(cydg_touch_active) || (id(cydg_display_gate).has_state() && ('+gateTruthCPP('id(cydg_display_gate).state')+'));'},wake]);}
    else attachTouch(getTouchscreen(),[wake]);
   }
   if(p.entities.find(e=>e.entity_id===control.gateEntity)?.demo)warnings.push('Die Display-Steuerung verwendet noch eine Beispiel-Entität.');
  }
 }
 const touchActions=[];
 const gateAwake=control.gateEnabled?'id(cydg_display_gate).has_state() && ('+gateTruthCPP('id(cydg_display_gate).state')+')':'true';
 const awakeNow=touchWake?'id(cydg_touch_active) || ('+gateAwake+')':gateAwake;
 const beginAwake=touchWake?'id(cydg_touch_was_awake)':awakeNow;
 const tapCondition='id(cydg_touch_can_act) && !id(cydg_touch_moved) && ('+awakeNow+') && std::abs(id(cydg_touch_last_x) - id(cydg_touch_x)) < 12 && std::abs(id(cydg_touch_last_y) - id(cydg_touch_y)) < 12 && ';
 const unchangedPage=pages.length>1?'id(cydg_page) == id(cydg_touch_start_page) && ':'';
 const tapX='id(cydg_touch_x)',tapY='id(cydg_touch_y)';
 const indicatorPages=pages.map((page,index)=>pageIndicatorFor(p,page).enabled?index:null).filter(index=>index!==null);
 const indicatorCondition=indicatorPages.map(index=>`id(cydg_page) == ${index}`).join(' || ');
 const dotStart=Math.floor((d.width-(pages.length-1)*20)/2);
 if(p.pageTouch&&pages.length>1){
  touchActions.push({if:{condition:{lambda:`return id(cydg_touch_can_act) && (${awakeNow}) && std::abs(id(cydg_touch_last_x) - id(cydg_touch_x)) >= ${Math.max(40,Math.round(d.width/6))} && std::abs(id(cydg_touch_last_x) - id(cydg_touch_x)) > 2 * std::abs(id(cydg_touch_last_y) - id(cydg_touch_y));`},then:[{lambda:`id(cydg_page) = (id(cydg_touch_start_page) + (id(cydg_touch_last_x) < id(cydg_touch_x) ? 1 : ${pages.length-1})) % ${pages.length};`},refreshPage()]}});
  if(indicatorPages.length)touchActions.push({if:{condition:{lambda:`return ${tapCondition}${unchangedPage}(${indicatorCondition}) && ${tapY} >= ${d.height-28} && ${tapY} < ${d.height} && ${tapX} >= ${dotStart-10} && ${tapX} < ${dotStart+(pages.length-1)*20+10};`},then:[{lambda:`id(cydg_page) = (${tapX} - ${dotStart-10}) / 20;`},refreshPage()]}});
 }
 if(indicatorPages.some(index=>pages[index].widgets.some(w=>w.y+w.h>d.height-28)))warnings.push('Die Punkte-Seitenleiste belegt auf sichtbaren Seiten die unteren 28 Pixel. Widgets in diesem Bereich werden dort überdeckt.');
 const allowedActions=new Set(['light.toggle','light.turn_on','light.turn_off','switch.toggle','switch.turn_on','switch.turn_off','input_boolean.toggle','input_boolean.turn_on','input_boolean.turn_off','scene.turn_on','script.turn_on','button.press']);
 for(let index=0;index<pages.length;index++){const buttons=pages[index].widgets.filter(w=>w.kind==='button'&&w.actionService);for(const w of pages[index].widgets.filter(w=>w.kind==='button')){
  if(!w.actionService&&!w.actionEntity){warnings.push('Die Taste „'+w.label+'“ hat noch keine Aktion und bleibt eine reine Anzeige.');continue;}
  if(!allowedActions.has(w.actionService)||!/^\w+\.[\w]+$/.test(w.actionEntity)||w.actionService.split('.')[0]!==w.actionEntity.split('.')[0])throw new Error('Bitte für „'+w.label+'“ eine passende unterstützte Touch-Aktion und Zielentität wählen.');
  const pageCondition=pages.length>1?`id(cydg_page) == ${index} && id(cydg_touch_start_page) == ${index} && `:'';
  const navCondition=pageIndicatorFor(p,pages[index]).enabled?`${tapY} < ${d.height-28} && `:'';
  const above=buttons.slice(buttons.indexOf(w)+1).map(b=>`!(${tapX} >= ${b.x} && ${tapX} < ${b.x+b.w} && ${tapY} >= ${b.y} && ${tapY} < ${b.y+b.h}) && `).join('');
  touchActions.push({if:{condition:{lambda:`return ${tapCondition}${pageCondition}${navCondition}${above}${tapX} >= ${w.x} && ${tapX} < ${w.x+w.w} && ${tapY} >= ${w.y} && ${tapY} < ${w.y+w.h};`},then:[{'homeassistant.service':{service:w.actionService,data:{entity_id:w.actionEntity}}}]}});
 }}
 if(touchActions.length){
  const touch=getTouchscreen();
  append(doc,'globals',[...['cydg_touch_id','cydg_touch_x','cydg_touch_y','cydg_touch_last_x','cydg_touch_last_y','cydg_touch_start_page'].map(id=>({id,type:'int',restore_value:false,initial_value:'0'})),...['cydg_touch_can_act','cydg_touch_moved'].map(id=>({id,type:'bool',restore_value:false,initial_value:'false'}))]);
  attachTouch(touch,[{lambda:`id(cydg_touch_id) = touch.id;
id(cydg_touch_x) = id(cydg_touch_last_x) = touch.x;
id(cydg_touch_y) = id(cydg_touch_last_y) = touch.y;
id(cydg_touch_start_page) = ${pages.length>1?'id(cydg_page)':'0'};
id(cydg_touch_can_act) = ${beginAwake};
id(cydg_touch_moved) = false;`}]);
  attachTrigger(touch,'on_update',[{lambda:`if (touches.size() > 1) id(cydg_touch_can_act) = false;
for (const auto &point : touches) {
  if (point.id == id(cydg_touch_id) && (point.state == 1 || point.state == 2)) {
    id(cydg_touch_last_x) = point.x; id(cydg_touch_last_y) = point.y;
    if (std::abs(point.x - id(cydg_touch_x)) >= 12 || std::abs(point.y - id(cydg_touch_y)) >= 12) id(cydg_touch_moved) = true;
  }
}`}]);
  attachTrigger(touch,'on_release',[...touchActions,{lambda:'id(cydg_touch_can_act) = false;'}]);
  if(allWidgets.some(w=>w.kind==='button'&&w.actionService))warnings.push('Touch-Tasten werden erst auf dem Gerät aktiv. In Home Assistant beim ESPHome-Gerät „Ausführen von Home-Assistant-Aktionen erlauben“ aktivieren.');
 }
 const code=[`// CYD Atelier: ${d.width} x ${d.height} px. Werte kommen aus Home Assistant.`,`it.fill(${col(p.background)});`,
 `auto draw_text = [&](int x, int y, int width, font::Font *f, Color color, const std::string &text, bool wrap, int align, int line_h) -> int {
  std::string line;
  auto draw_line = [&](const std::string &v) {
    int bx, by, bw, bh;
    it.get_text_bounds(0, 0, v.c_str(), f, TextAlign::TOP_LEFT, &bx, &by, &bw, &bh);
    int dx = align == 1 ? (width - bw) / 2 : (align == 2 ? width - bw : 0);
    it.print(x + dx, y, f, color, TextAlign::TOP_LEFT, v.c_str());
    y += line_h;
  };
  for (size_t i = 0; i < text.size();) {
    unsigned char c = (unsigned char) text[i];
    if (c == '\\n') { draw_line(line); line.clear(); i++; continue; }
    size_t len = c < 0x80 ? 1 : (c < 0xE0 ? 2 : (c < 0xF0 ? 3 : 4));
    std::string next = line + text.substr(i, len);
    int bx, by, bw, bh;
    it.get_text_bounds(0, 0, next.c_str(), f, TextAlign::TOP_LEFT, &bx, &by, &bw, &bh);
    if (wrap && bw > width && !line.empty()) { draw_line(line); line.clear(); }
    line += text.substr(i, len); i += len;
  }
  draw_line(line);
  return y;
};`];
 if(allWidgets.some(w=>w.borderWidth>0||w.cornerRadius>0))code.push(FRAME_CPP);
 code.push(ADVANCED_CPP);
 let drawingPage=-1;
 if(pages.length>1)code.push('switch (id(cydg_page)) {');
 for(const w0 of renderWidgets){
  if(pages.length>1&&w0.exportPage!==drawingPage){if(drawingPage>=0)code.push('break;','}');drawingPage=w0.exportPage;code.push(`case ${drawingPage}: {`, `it.fill(${col(pages[drawingPage].background||p.background)});`);}
  const advanced=advancedDrawCPP(w0,{bindingId:bindings.get(w0.entity+'|'+w0.attribute)?.id,iconMap,timeId:'cydg_clock'});if(advanced){code.push(...advanced);continue;}
  const w=w0.listRow||w0.kind==='frame'?w0:boundWidget({...w0},p);const pad=Number(w.padding),iw=w.icon?w.iconSize+8:0,tx=w.x+pad+iw,ty=w.y+pad,tw=Math.max(1,w.w-2*pad-iw);const align=['left','center','right'].indexOf(w.align);code.push(`{ // Widget ${w.id.replace(/[^\w]/g,'')}`,`it.start_clipping(${w.x}, ${w.y}, ${w.x+w.w}, ${w.y+w.h});`);if(!w.transparent)code.push(w.cornerRadius>0?`draw_widget_shape(${w.x}, ${w.y}, ${w.w}, ${w.h}, ${w.cornerRadius}, 0, ${col(w.bg)});`:`it.filled_rectangle(${w.x}, ${w.y}, ${w.w}, ${w.h}, ${col(w.bg)});`);if(w.icon&&!w.parts){const cp=iconMap.get(w.icon.replace(/^mdi:/,'')).code.toString(16).padStart(8,'0');code.push(`it.print(${w.x+pad}, ${w.y+pad}, id(cydg_icon_${w.iconSize}), ${col(w.iconColor)}, TextAlign::TOP_LEFT, "\\U${cp}");`);}
 code.push(`int y = ${ty};`);const drawName=w.kind==='text'||w.show!=='value',drawVal=w.kind==='entity'&&w.show!=='name';if(drawVal){const b=bindings.get(w.entity+'|'+w.attribute);code.push(`std::string value = id(${b.id}).has_state() ? id(${b.id}).state : "";`,`if (value.empty() || value == "unknown" || value == "unavailable") value = "—";`,`else {`,`  if (value == "on") value = ${cstr(w.onText)};`,`  else if (value == "off") value = ${cstr(w.offText)};`);if(w.precision>=0)code.push(`  char *end = nullptr; float n = strtof(value.c_str(), &end);`,`  if (end != value.c_str() && *end == '\\0' && std::isfinite(n)) value = str_sprintf("%.${Math.floor(w.precision)}f", n);`);if(w.unit)code.push(`  value += ${cstr(' '+w.unit)};`);code.push('}');}
 const line=(str,size,color,x=tx,width=tw)=>`y = draw_text(${x}, y, ${width}, id(cydg_text_${size}), ${col(color)}, ${str}, ${!!w.wrap}, ${align}, ${Math.ceil(size*1.2)});`;
 if(w.parts){
   const fallback={icon:{x:pad,y:pad,w:w.iconSize,h:w.iconSize},name:{x:tx-w.x,y:ty-w.y,w:tw,h:Math.ceil(w.nameSize*1.2)},value:{x:tx-w.x,y:ty-w.y+(drawName?Math.ceil(w.nameSize*1.2)+3:0),w:tw,h:Math.ceil(w.valueSize*1.2)}};
   for(const key of ['icon','name','value']){
     if(key==='icon'&&!w.icon||key==='name'&&!drawName||key==='value'&&!drawVal)continue;
     const r=w.parts[key]||fallback[key],x=w.x+r.x,y=w.y+r.y;
     code.push(`// Item ${key}`,`it.start_clipping(${x}, ${y}, ${x+r.w}, ${y+r.h});`);
     if(key==='icon'){
       const cp=iconMap.get(w.icon.replace(/^mdi:/,'')).code.toString(16).padStart(8,'0');
       code.push(`it.print(${x}, ${y}, id(cydg_icon_${w.iconSize}), ${col(w.iconColor)}, TextAlign::TOP_LEFT, "\\U${cp}");`);
     }else{
       const size=key==='name'?w.nameSize:w.valueSize,color=key==='name'?w.nameColor:w.color,str=key==='name'?cstr(w.label):'value';
       code.push(`draw_text(${x}, ${y}, ${r.w}, id(cydg_text_${size}), ${col(color)}, ${str}, ${!!w.wrap}, ${w.listRow&&key==='value'?2:align}, ${Math.ceil(size*1.2)});`);
     }
     code.push('it.end_clipping();');
   }
 }else if(drawName&&drawVal&&!w.breakLine){code.push('int bx, by, bw, bh;',`it.get_text_bounds(0, 0, ${cstr(w.label+' ')}, id(cydg_text_${w.nameSize}), TextAlign::TOP_LEFT, &bx, &by, &bw, &bh);`,`draw_text(${tx}, y, ${tw}, id(cydg_text_${w.nameSize}), ${col(w.nameColor)}, ${cstr(w.label+' ')}, false, 0, ${Math.ceil(w.nameSize*1.2)});`,`draw_text(${tx} + bw, y, std::max(1, ${tw} - bw), id(cydg_text_${w.valueSize}), ${col(w.color)}, value, ${!!w.wrap}, 0, ${Math.ceil(w.valueSize*1.2)});`);}else {if(drawName)code.push(line(cstr(w.label),w.nameSize,w.nameColor));if(drawName&&drawVal)code.push('y += 3;');if(drawVal)code.push(line('value',w.valueSize,w.color));}if(w.rowSeparator)code.push(`it.line(${w.x}, ${w.y+w.h-1}, ${w.x+w.w-1}, ${w.y+w.h-1}, ${col(w.rowLineColor)});`);if(w.borderWidth>0)code.push(`draw_widget_shape(${w.x}, ${w.y}, ${w.w}, ${w.h}, ${w.cornerRadius}, ${w.borderWidth}, ${col(w.borderColor)});`);code.push('it.end_clipping();','}');}
 if(pages.length>1){if(drawingPage>=0)code.push('break;','}');for(let index=0;index<pages.length;index++)if(!pages[index].widgets.length)code.push(`case ${index}: it.fill(${col(pages[index].background||p.background)}); break;`);code.push('default: break;','}');}
 if(indicatorPages.length){
  code.push(`if (${indicatorCondition}) {`,`  it.filled_rectangle(0, ${d.height-28}, ${d.width}, 28, ${col(p.pageIndicator.background)});`);
  for(let index=0;index<pages.length;index++)code.push(`  it.filled_circle(${dotStart+index*20}, ${d.height-14}, id(cydg_page) == ${index} ? 5 : 3, id(cydg_page) == ${index} ? ${col(p.pageIndicator.activeColor)} : ${col(p.pageIndicator.inactiveColor)});`);
  code.push('}');
 }
 const lambda=new Scalar(code.join('\n'));lambda.type=Scalar.BLOCK_LITERAL;disp.set('lambda',lambda);disp.set('update_interval','1s');disp.set('auto_clear_enabled',true);
 const yaml='# Erst in ESPHome validieren, dann installieren. Displayprofil und GPIOs prüfen.\n'+doc.toString({lineWidth:0})+'\n'+META+encodeProject(p)+'\n';
 return {yaml,warnings:[...new Set(warnings)],fonts:fonts.length,bindings:bindings.size};
}
