import {parseEntities} from './core.mjs';
import {allProjectWidgets,capturePage} from './pages.mjs';

export class LiveEntities {
 constructor(onChange=()=>{}){this.entities=new Map();this.ready=false;this.connected=false;this.message='Verbindung zu Home Assistant wird hergestellt …';this.onChange=onChange;}
 receive(type,data){
  if(type==='snapshot'){
   const entries=data.entities?.length?parseEntities(JSON.stringify(data.entities)):[];
   if(data.connected||entries.length){this.entities=new Map(entries.map(e=>[e.entity_id,e]));this.ready=true;}
   this.connected=!!data.connected;this.message=String(data.message||'');
  }else if(type==='state'){
   if(data.entity){const [e]=parseEntities(JSON.stringify([data.entity]));this.entities.set(e.entity_id,e);}
   else this.entities.delete(data.entity_id);
  }else if(type==='status'){this.connected=!!data.connected;this.message=String(data.message||'');}
  this.onChange();
 }
 connect(EventSourceImpl=EventSource,url='api/ha/events'){
  this.stream=new EventSourceImpl(url);
  for(const type of ['snapshot','state','status'])this.stream.addEventListener(type,event=>{try{this.receive(type,JSON.parse(event.data));}catch{this.connected=false;this.message='Live-Daten konnten nicht gelesen werden.';this.onChange();}});
  this.stream.onerror=()=>{this.connected=false;this.message='Live-Verbindung getrennt · letzte Werte, erneuter Verbindungsversuch …';this.onChange();};
  return this;
 }
 close(){this.stream?.close();}
 apply(project){
  if(!this.ready)return;
  const missing=new Map(project.entities.map(e=>[e.entity_id,e]));
  const ids=boundEntityIds(project);
  project.entities=[...this.entities.values()];
  for(const id of ids)if(!this.entities.has(id))project.entities.push({entity_id:id,state:'unavailable',attributes:missing.get(id)?.attributes||{},source:'ha'});
 }
}

export function boundEntityIds(project){
 const ids=new Set();for(const w of allProjectWidgets(project)){if(w.kind!=='clock'&&w.entity)ids.add(w.entity);if(w.kind==='button'&&w.actionEntity)ids.add(w.actionEntity);for(const item of w.items||[])if(item.entity)ids.add(item.entity);}
 if(project.screenControl?.gateEntity)ids.add(project.screenControl.gateEntity);return ids;
}

export function storedProject(project){
 capturePage(project);const ids=boundEntityIds(project);
 // Store the layout and its referenced entities, not thousands of unrelated states.
 return {...project,entities:project.entities.filter(e=>ids.has(e.entity_id))};
}
