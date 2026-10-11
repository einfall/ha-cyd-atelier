const num=(v,min,max,fallback)=>Math.round(Math.min(max,Math.max(min,Number.isFinite(Number(v))?Number(v):fallback)));
export function normalizeList(w){
 if(w.kind!=='list')return w;
 w.parts=null;w.icon='';w.show='both';
 w.rowHeight=num(w.rowHeight,16,160,32);w.rowGap=num(w.rowGap,0,24,4);w.valueColumn=num(w.valueColumn,15,70,35);
 w.items=(Array.isArray(w.items)?w.items:[]).slice(0,40).map(r=>{
   const o={};for(const k of ['entity','attribute','label','icon','unit','onText','offText'])o[k]=String(r?.[k]??({onText:'An',offText:'Aus'}[k]||'')).slice(0,2000);
   o.show=['both','name','value'].includes(r?.show)?r.show:'both';o.precision=num(r?.precision,-1,5,1);return o;
 });return w;
}
// Same row rectangles are used by the browser preview and ESPHome export.
export function listRows(w,all=false){
 const pad=Math.min(Math.max(Number(w.padding)||0,w.borderWidth||0),Math.floor((w.w-1)/2));
 const width=Math.max(1,w.w-2*pad),valueWidth=Math.max(1,Math.round(width*w.valueColumn/100));
 return (w.items||[]).map((item,i)=>{
   const y=pad+i*(w.rowHeight+w.rowGap),height=all?w.rowHeight:Math.min(w.rowHeight,w.h-pad-y);
   if(height<=0)return null;
   const iconWidth=item.icon?Math.min(width, w.iconSize+8):0;
   const nameWidth=item.show==='name'?width-iconWidth:Math.max(1,width-iconWidth-valueWidth-8);
   const valueX=item.show==='value'?iconWidth:width-valueWidth;
   const offset=size=>w.rowValign==='top'?0:w.rowValign==='bottom'?Math.max(0,w.rowHeight-size):Math.max(0,Math.floor((w.rowHeight-size)/2));
   return {...w,...item,id:w.id+'_row_'+i,kind:'entity',listRow:true,rowIndex:i,x:w.x+pad,y:w.y+y,w:width,h:height,padding:0,align:'left',valign:'top',transparent:w.listStyle!=='zebra',bg:i%2?w.rowAlternateBg:w.bg,rowSeparator:w.listStyle==='lines',borderWidth:0,cornerRadius:0,
    parts:{icon:{x:0,y:offset(w.iconSize),w:Math.max(1,iconWidth-8),h:w.iconSize},
     name:{x:iconWidth,y:offset(Math.ceil(w.nameSize*1.2)),w:Math.max(1,nameWidth),h:height},
     value:{x:valueX,y:offset(Math.ceil(w.valueSize*1.2)),w:item.show==='value'?Math.max(1,width-iconWidth):valueWidth,h:height}}};
 }).filter(Boolean);
}
export function drawingWidgets(w){
 if(w.kind!=='list')return [w];
 const frame={...w,kind:'frame',show:'value',icon:'',parts:null,label:''};
 return [{...frame,borderWidth:0},...listRows(w),{...frame,transparent:true}];
}

export const listRequiredHeight=w=>2*Math.max(Number(w.padding)||0,w.borderWidth||0)+w.items.length*w.rowHeight+Math.max(0,w.items.length-1)*w.rowGap;
