// Widget-local rectangles. Text sizes stay in the existing widget fields.
export const PART_KEYS = ['icon', 'name', 'value'];
export const PART_SIZE = {icon:'iconSize', name:'nameSize', value:'valueSize'};
export const PART_COLOR = {icon:'iconColor', name:'nameColor', value:'color'};
export const PART_LABEL = {icon:'Icon', name:'Name / Text', value:'Wert'};
const clamp=(n,a,b)=>Math.min(b,Math.max(a,Number(n)||0));
export function visibleParts(w){return PART_KEYS.filter(k=>k==='icon'?!!w.icon:k==='name'?w.kind==='text'||w.show!=='value':w.kind==='entity'&&w.show!=='name');}
export function normalizeParts(w){
  if(!w.parts||typeof w.parts!=='object'||Array.isArray(w.parts)){w.parts=null;return w;}
  const clean={};
  for(const key of PART_KEYS){
    const r=w.parts[key];if(!r||typeof r!=='object')continue;
    const x=Math.round(clamp(r.x,0,Math.max(0,w.w-1)));
    const y=Math.round(clamp(r.y,0,Math.max(0,w.h-1)));
    clean[key]={x,y,w:Math.round(clamp(r.w,1,w.w-x)),h:Math.round(clamp(r.h,1,w.h-y))};
  }
  w.parts=Object.keys(clean).length?clean:null;
  return w;
}
export function boundPart(w,key){
  const r=w.parts?.[key];if(!r)return;
  r.w=Math.round(clamp(r.w,1,w.w));r.h=Math.round(clamp(r.h,1,w.h));
  r.x=Math.round(clamp(r.x,0,w.w-r.w));r.y=Math.round(clamp(r.y,0,w.h-r.h));
}
export function scaleParts(w,oldWidth,oldHeight){
  if(!w.parts)return;
  for(const key of PART_KEYS){const r=w.parts[key];if(!r)continue;
    r.x=Math.round(r.x*w.w/oldWidth);r.y=Math.round(r.y*w.h/oldHeight);
    r.w=Math.max(1,Math.round(r.w*w.w/oldWidth));r.h=Math.max(1,Math.round(r.h*w.h/oldHeight));
  }
  normalizeParts(w);
}
export function movePart(w,key,start,dx,dy,step=1){
  const r=w.parts[key],snap=v=>Math.round(v/step)*step;
  r.x=snap(start.x+dx);r.y=snap(start.y+dy);boundPart(w,key);
}
export function resizePart(w,key,start,dx,dy,mode='scale'){
  const r=w.parts[key];
  if(mode==='width'){
    r.w=Math.round(clamp(start.w+dx,4,w.w-r.x));
    return;
  }
  if(mode==='height'){
    r.h=Math.round(clamp(start.h+dy,4,w.h-r.y));
    return;
  }
  const rx=dx/Math.max(1,start.w),ry=dy/Math.max(1,start.h);
  const factor=Math.max(.05,1+(Math.abs(rx)>Math.abs(ry)?rx:ry));
  const field=PART_SIZE[key];
  const size=Math.round(clamp(start.size*factor,8,64));
  const actual=size/start.size;
  w[field]=size;
  if(key==='icon'){
    w[field]=Math.round(clamp(size,8,Math.max(8,Math.min(64,w.w-r.x,w.h-r.y))));
    r.w=Math.min(w[field],w.w-r.x);r.h=Math.min(w[field],w.h-r.y);
  }else{
    r.w=Math.round(clamp(start.w*actual,4,w.w-r.x));
    r.h=Math.round(clamp(start.h*actual,4,w.h-r.y));
  }
}
