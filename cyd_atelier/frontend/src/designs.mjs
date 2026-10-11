import {validateProject} from './core.mjs';
import {createId} from './id.mjs';
export const DESIGNS_KEY='cyd-atelier.designs.v1';
export const MAX_DESIGNS=30;
export function readDesigns(storage){
 const raw=storage.getItem(DESIGNS_KEY);if(!raw)return [];
 const data=JSON.parse(raw);
 if(data.version!==1||!Array.isArray(data.designs)||data.designs.length>MAX_DESIGNS)throw new Error('Die gespeicherten Designs konnten nicht gelesen werden.');
 return data.designs.map(d=>{if(typeof d.id!=='string'||typeof d.name!=='string'||!Number.isFinite(Date.parse(d.updatedAt)))throw new Error('Ein gespeichertes Design ist beschädigt.');return {...d,name:d.name.slice(0,60),project:validateProject(d.project)};});
}
export function writeDesigns(storage,designs){storage.setItem(DESIGNS_KEY,JSON.stringify({version:1,designs}));}
export function snapshotDesign(project,name,id=createId()){
 return {id,name:String(name).trim().slice(0,60)||'Mein Display',updatedAt:new Date().toISOString(),project:validateProject(structuredClone(project))};
}
