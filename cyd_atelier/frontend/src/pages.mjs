import {createId} from './id.mjs';

export const MAX_PAGES=8;
export const PAGE_INDICATOR_DEFAULTS=Object.freeze({enabled:false,activeColor:'#f6f8fc',inactiveColor:'#65758a',background:'#182334'});
const indicatorMode=mode=>['inherit','show','hide'].includes(mode)?mode:'inherit';
// Visibility is independent of touch: a dotbar can indicate automatic paging only.
export function pageIndicatorFor(p,page=p.pages?.find(page=>page.id===p.activePage)){
 const settings=p.pageIndicator||PAGE_INDICATOR_DEFAULTS;
 return {...settings,enabled:(p.pages?.length||1)>1&&(indicatorMode(page?.indicator)==='show'||indicatorMode(page?.indicator)==='inherit'&&!!settings.enabled)};
}
const clone=v=>structuredClone(v);
const geometry=w=>({id:w.id,x:w.x,y:w.y,w:w.w,h:w.h,parts:w.parts?clone(w.parts):null});
export const snapshotLayout=widgets=>widgets.map(geometry);
export function restoreLayout(widgets,layout){
 const map=new Map((Array.isArray(layout)?layout:[]).map(r=>[r.id,r]));
 for(const w of widgets){const r=map.get(w.id);if(!r)continue;for(const key of ['x','y','w','h'])if(Number.isFinite(Number(r[key])))w[key]=Number(r[key]);w.parts=r.parts?clone(r.parts):null;}
 return widgets;
}
export function ensurePages(p){
 if(!Array.isArray(p.pages)||!p.pages.length){const id='p'+createId().replace(/-/g,'');p.pages=[{id,name:'Seite 1',widgets:clone(p.widgets||[]),layouts:{[p.orientation||'landscape']:snapshotLayout(p.widgets||[])},background:p.background}];p.activePage=id;}
 if(!p.pages.some(page=>page.id===p.activePage))p.activePage=p.pages[0].id;
 for(const page of p.pages){if(!Array.isArray(page.widgets))page.widgets=[];if(!page.layouts||typeof page.layouts!=='object'||Array.isArray(page.layouts))page.layouts={};page.indicator=indicatorMode(page.indicator);}
 if(!Array.isArray(p.widgets))p.widgets=clone(p.pages.find(page=>page.id===p.activePage).widgets);
 p.pageSeconds=Number(p.pageSeconds)>0?Math.round(Math.max(5,Math.min(600,Number(p.pageSeconds)))):0;
 p.pageSwitchMode=p.pageSwitchMode==='random'?'random':'next';
 const previous=p.pageIndicator&&typeof p.pageIndicator==='object'&&!Array.isArray(p.pageIndicator)?p.pageIndicator:null;
 p.pageIndicator={enabled:previous?!!previous.enabled:!!p.pageTouch};
 for(const key of ['activeColor','inactiveColor','background'])p.pageIndicator[key]=/^#[0-9a-f]{6}$/i.test(previous?.[key])?previous[key]:PAGE_INDICATOR_DEFAULTS[key];
 p.pageTouch=!!p.pageTouch;p.timezone=String(p.timezone||'Europe/Berlin').slice(0,80);
 return p.pages;
}
// p.widgets is the authoritative active page. Capturing never restores an older copy.
export function capturePage(p){
 ensurePages(p);const page=p.pages.find(page=>page.id===p.activePage);
 page.widgets=clone(p.widgets);page.layouts[p.orientation||'landscape']=snapshotLayout(p.widgets);page.background=p.background;
 return page;
}
export function changePage(p,id){
 ensurePages(p);const target=p.pages.find(page=>page.id===id);if(!target)throw new Error('Diese Displayseite existiert nicht.');
 if(id===p.activePage)return target;capturePage(p);p.activePage=id;p.widgets=clone(target.widgets);if(target.background)p.background=target.background;
 return target;
}
export function addPage(p,name){
 ensurePages(p);if(p.pages.length>=MAX_PAGES)throw new Error('Maximal acht Displayseiten sind möglich.');capturePage(p);
 const page={id:'p'+createId().replace(/-/g,''),name:String(name||'Seite '+(p.pages.length+1)).trim().slice(0,60)||'Neue Seite',widgets:[],layouts:{[p.orientation||'landscape']:[]},background:p.background,indicator:'inherit'};
 p.pages.push(page);p.activePage=page.id;p.widgets=[];return page;
}
export function deletePage(p,id){
 ensurePages(p);if(p.pages.length===1)throw new Error('Mindestens eine Displayseite muss erhalten bleiben.');
 const index=p.pages.findIndex(page=>page.id===id);if(index<0)return;
 capturePage(p);p.pages.splice(index,1);if(p.activePage===id){const next=p.pages[Math.min(index,p.pages.length-1)];p.activePage=next.id;p.widgets=clone(next.widgets);p.background=next.background||p.background;}
}
export function allProjectWidgets(p){
 if(!Array.isArray(p.pages)||!p.pages.length)return p.widgets||[];
 return p.pages.flatMap(page=>page.id===p.activePage?(p.widgets||[]):(page.widgets||[]));
}
