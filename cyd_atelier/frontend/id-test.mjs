import assert from 'node:assert/strict';
import {createId} from './src/id.mjs';
import {makeWidget,newProject} from './src/core.mjs';
import {snapshotDesign,readDesigns,writeDesigns} from './src/designs.mjs';

const uuid=/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const originalCrypto=Object.getOwnPropertyDescriptor(globalThis,'crypto');
function withCrypto(crypto,fn){
 Object.defineProperty(globalThis,'crypto',{value:crypto,configurable:true,writable:true});
 try{fn();}finally{
  if(originalCrypto)Object.defineProperty(globalThis,'crypto',originalCrypto);
  else delete globalThis.crypto;
 }
}

withCrypto({randomUUID(){assert.equal(this,globalThis.crypto);return '00112233-4455-4677-8899-aabbccddeeff';}},()=>{
 assert.equal(createId(),'00112233-4455-4677-8899-aabbccddeeff');
});
console.log('PASS native UUID support');

withCrypto({getRandomValues(bytes){assert.equal(this,globalThis.crypto);bytes.fill(255);return bytes;}},()=>{
 assert.match(createId(),uuid);
 const design=snapshotDesign(newProject(),'HTTP-Design');
 assert.match(design.id,uuid);
 assert.equal(design.name,'HTTP-Design');
});
console.log('PASS saving designs with randomUUID unavailable');

withCrypto(undefined,()=>{
 delete globalThis.crypto;
 const originalRandom=Math.random,originalNow=Date.now;
 Math.random=()=>0;Date.now=()=>1791713279000;
 try{
  const ids=Array.from({length:1000},()=>createId());
  ids.forEach(id=>assert.match(id,uuid));
  assert.equal(new Set(ids).size,ids.length);
  const design=snapshotDesign(newProject(),'Ohne Web Crypto');
  assert.match(design.id,uuid);
  assert.equal(snapshotDesign(design.project,'Aktualisiert',design.id).id,design.id);
  const stored=new Map(),storage={getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)};
  writeDesigns(storage,[design]);
  assert.equal(readDesigns(storage)[0].id,design.id);
  const widgets=Array.from({length:100},()=>makeWidget());
  assert.equal(new Set(widgets.map(w=>w.id)).size,widgets.length);
  widgets.forEach(w=>assert.match(w.id,/^w[\da-f]{32}$/));
  assert.equal(makeWidget({id:'existing-widget'}).id,'existing-widget');
 }finally{Math.random=originalRandom;Date.now=originalNow;}
});
console.log('PASS unique widget IDs and design save/read/update without global crypto');
