// Shared widget semantics for editor previews and generated ESPHome drawing.
export const WIDGET_KINDS = ['entity','text','list','status','bar','ring','clock','timer','button'];
export const ADVANCED_KINDS = ['status','bar','ring','clock','timer','button'];
const ALIGN = ['left','center','right'];
const OPERATORS = ['eq','ne','gt','gte','lt','lte'];
const color = (v,fallback='') => /^#[0-9a-f]{6}$/i.test(String(v||'')) ? String(v).toLowerCase() : fallback;
const finite = (v,fallback) => v!==''&&v!==null&&v!==undefined&&Number.isFinite(Number(v)) ? Number(v) : fallback;
const bounded = (v,a,b,fallback) => Math.min(b,Math.max(a,finite(v,fallback)));
export function normalizeAdvancedWidget(w){
  w.kind=WIDGET_KINDS.includes(w.kind)?w.kind:'entity';
  w.nameAlign=ALIGN.includes(w.nameAlign)?w.nameAlign:'';
  w.valueAlign=ALIGN.includes(w.valueAlign)?w.valueAlign:'';
  w.valign=['top','middle','bottom'].includes(w.valign)?w.valign:'top';
  w.locked=!!w.locked;
  w.rules=(Array.isArray(w.rules)?w.rules:[]).slice(0,12).filter(r=>r&&typeof r==='object').map(r=>({
    operator:OPERATORS.includes(r.operator)?r.operator:'eq',value:String(r.value??'').slice(0,2000),
    color:color(r.color),bg:color(r.bg),icon:String(r.icon||'').slice(0,100)
  }));
  w.minValue=bounded(w.minValue,-1e9,1e9,0);
  w.maxValue=bounded(w.maxValue,-1e9,1e9,100);
  if(w.maxValue<=w.minValue){w.maxValue=Math.min(1e9,w.minValue+100);if(w.maxValue<=w.minValue)w.minValue=w.maxValue-100;}
  w.trackColor=color(w.trackColor,'#344156');
  w.thickness=Math.round(bounded(w.thickness,2,24,6));
  w.clockFormat=['time','date','datetime'].includes(w.clockFormat)?w.clockFormat:'time';
  w.clockSeconds=!!w.clockSeconds;
  w.clockWeekday=!!w.clockWeekday;
  w.timerFormat=w.timerFormat==='hhmmss'?'hhmmss':'mmss';
  w.actionService=/^\w+\.\w+$/.test(String(w.actionService||''))?String(w.actionService):'';
  w.actionEntity=/^\w+\.\w+$/.test(String(w.actionEntity||''))?String(w.actionEntity):'';
  w.rowValign=['top','middle','bottom'].includes(w.rowValign)?w.rowValign:'middle';
  w.listStyle=['plain','lines','zebra'].includes(w.listStyle)?w.listStyle:'plain';
  w.rowAlternateBg=color(w.rowAlternateBg,'#223047');
  w.rowLineColor=color(w.rowLineColor,'#344156');
  return w;
}
export function rawWidgetValue(p,w){
  const e=(p.entities||[]).find(e=>e.entity_id===w.entity);
  return w.attribute?e?.attributes?.[w.attribute]:e?.state;
}
export function numericValue(raw){
  if(typeof raw!=='string'&&typeof raw!=='number')return null;
  const text=String(raw).trim();
  if(!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text))return null;
  const n=Number(text);return Number.isFinite(n)?n:null;
}
export function ruleMatches(raw,rule){
  if(raw===undefined||raw===null||typeof raw==='object')return false;
  const value=String(rule.value??'');
  if(rule.operator==='eq')return String(raw)===value;
  if(rule.operator==='ne')return String(raw)!==value;
  const a=numericValue(raw),b=numericValue(value);
  if(a===null||b===null)return false;
  return ({gt:()=>a>b,gte:()=>a>=b,lt:()=>a<b,lte:()=>a<=b}[rule.operator]||(()=>false))();
}
export function effectiveWidget(p,w){
  const rule=(w.rules||[]).find(r=>ruleMatches(rawWidgetValue(p,w),r));
  if(!rule)return w;
  return {...w,...(rule.color?{color:rule.color,iconColor:rule.color}:{}),...(rule.bg?{bg:rule.bg}:{}),...(rule.icon?{icon:rule.icon}:{})};
}
export function progressValue(p,w){
  const n=numericValue(rawWidgetValue(p,w));
  const min=finite(w.minValue,0),max=finite(w.maxValue,100);
  return n===null||max<=min?null:Math.min(1,Math.max(0,(n-min)/(max-min)));
}
export function durationValue(raw,format='mmss'){
  const n=numericValue(raw);if(n===null||n<0)return '—';
  const seconds=Math.floor(Math.min(2147483647,n)),pad=n=>String(n).padStart(2,'0');
  return format==='hhmmss'?`${pad(Math.floor(seconds/3600))}:${pad(Math.floor(seconds/60)%60)}:${pad(seconds%60)}`:`${pad(Math.floor(seconds/60))}:${pad(seconds%60)}`;
}
export function clockValue(p,w,now=new Date()){
  try{
    const date=now instanceof Date?now:new Date(now),opts=p.timezone?{timeZone:p.timezone}:{};
    const day=new Intl.DateTimeFormat('de-DE',{...opts,day:'2-digit',month:'2-digit',year:'numeric'}).format(date);
    const time=new Intl.DateTimeFormat('de-DE',{...opts,hour:'2-digit',minute:'2-digit',...(w.clockSeconds?{second:'2-digit'}:{}),hourCycle:'h23'}).format(date);
    const weekday=w.clockWeekday?new Intl.DateTimeFormat('de-DE',{...opts,weekday:'short'}).format(date).replace(/\.$/,'')+'. ':'';
    return weekday+(w.clockFormat==='date'?day:w.clockFormat==='datetime'?day+' '+time:time);
  }catch{return '—';}
}
export function advancedValue(p,w,now){
  if(w.kind==='clock')return clockValue(p,w,now);
  if(w.kind==='timer')return durationValue(rawWidgetValue(p,w),w.timerFormat);
  const raw=rawWidgetValue(p,w);
  if(raw===undefined||raw===null||raw==='unknown'||raw==='unavailable'||raw==='')return '—';
  let value=typeof raw==='object'?JSON.stringify(raw):String(raw);
  if(value==='on')value=w.onText||'An';else if(value==='off')value=w.offText||'Aus';
  const n=numericValue(raw);if(n!==null&&w.precision>=0)value=n.toFixed(Math.min(5,Math.floor(w.precision)));
  return value+(w.unit?' '+w.unit:'');
}
// Preview actions are deliberately inert. Only the exported device handles touch.
export function advancedContent(p,source,{esc=s=>String(s),iconHTML=()=>'',now=new Date(),measure}={}){
  if(!ADVANCED_KINDS.includes(source.kind))return null;
  const w=effectiveWidget(p,source),pad=Number(w.padding)||0;
  const showName=w.kind==='button'||w.show!=='value',showValue=w.kind!=='button'&&w.show!=='name';
  const iw=w.icon?w.iconSize+8:0,align=w.align||'left';
  const inline=showName&&showValue&&!w.breakLine&&!['bar','ring'].includes(w.kind);
  const textWidth=Math.max(1,w.w-2*pad-iw),label=w.label+(inline?' ':''),nameWidth=inline&&measure?measure(label,w.nameSize):null;
  const textHTML=(text,size,width,wrap)=>{
    if(!measure)return esc(text);
    const output=[];let line='';
    for(const c of String(text)){
      if(c==='\n'){output.push(line);line='';continue;}
      if(wrap&&line&&measure(line+c,size)>width){output.push(line);line='';}
      line+=c;
    }
    output.push(line);
    return output.map(line=>`<span style="display:block;height:${Math.ceil(size*1.2)}px;white-space:pre">${esc(line)||' '}</span>`).join('');
  };
  const name=showName?`<div class="advanced-name" style="${inline?'flex:none;':''}${nameWidth!==null?'width:'+nameWidth+'px;':''}font-size:${w.nameSize}px;line-height:${Math.ceil(w.nameSize*1.2)}px;color:${w.nameColor};text-align:${w.nameAlign||align};white-space:${w.wrap&&!inline?'pre-wrap':'pre'};word-break:break-all;overflow:hidden">${textHTML(label,w.nameSize,textWidth,w.wrap&&!inline)}</div>`:'';
  const value=showValue?`<div class="advanced-value" style="${inline?'flex:1;min-width:0;':''}font-size:${w.valueSize}px;line-height:${Math.ceil(w.valueSize*1.2)}px;color:${w.color};text-align:${w.valueAlign||align};white-space:${w.wrap?'pre-wrap':'pre'};word-break:break-all;overflow:hidden">${textHTML(advancedValue(p,w,now),w.valueSize,Math.max(1,textWidth-(nameWidth||0)),w.wrap)}</div>`:'';
  const icon=w.icon?`<div class="advanced-icon" style="width:${w.iconSize}px;flex:none;font-size:${w.iconSize}px;color:${w.iconColor};line-height:1">${iconHTML(w.icon)}</div>`:'';
  let gauge='';const progress=progressValue(p,w);
  if(w.kind==='bar')gauge=`<div class="advanced-bar" style="height:${w.thickness}px;flex:none;background:${w.trackColor};overflow:hidden"><div style="width:${progress===null?0:progress*100}%;height:100%;background:${w.color}"></div></div>`;
  if(w.kind==='ring'){
    const size=Math.max(1,Math.min(w.w-2*pad,w.h-2*pad)),thickness=Math.min(w.thickness,size/2),radius=Math.max(0,(size-thickness)/2),circ=2*Math.PI*radius;
    gauge=`<svg class="advanced-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);overflow:hidden" aria-hidden="true"><circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="${w.trackColor}" stroke-width="${thickness}"/><circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="${w.color}" stroke-width="${thickness}" stroke-dasharray="${circ}" stroke-dashoffset="${circ*(1-(progress||0))}" transform="rotate(-90 ${size/2} ${size/2})"/></svg>`;
  }
  const justify={top:'flex-start',middle:'center',bottom:'flex-end'}[w.valign]||'flex-start';
  const ring=w.kind==='ring';
  if(measure){
    // Use the same character wrapping and integer line positions as draw_text.
    const wrapped=(text,size,width,wrap)=>{
      const output=[];let line='';
      for(const c of String(text)){
        if(c==='\n'){output.push(line);line='';continue;}
        if(wrap&&line&&measure(line+c,size)>width){output.push(line);line='';}
        line+=c;
      }
      output.push(line);return output;
    };
    const nline=Math.ceil(w.nameSize*1.2),vline=Math.ceil(w.valueSize*1.2),actualValue=advancedValue(p,w,now);
    const nameLines=showName?wrapped(label,w.nameSize,textWidth,w.wrap&&!inline):[],valueWidth=Math.max(1,textWidth-(inline?nameWidth:0));
    const valueLines=showValue?wrapped(actualValue,w.valueSize,valueWidth,w.wrap):[];
    const textHeight=inline?Math.max(nameLines.length*nline,valueLines.length*vline):nameLines.length*nline+valueLines.length*vline+(showName&&showValue?3:0);
    const contentHeight=Math.max(w.icon?w.iconSize:0,textHeight)+(w.kind==='bar'?w.thickness+3:0),available=w.h-2*pad;
    const offset=w.valign==='bottom'?Math.max(0,available-contentHeight):w.valign==='middle'?Math.max(0,Math.floor((available-contentHeight)/2)):0;
    let body=w.icon?`<div class="advanced-icon" style="position:absolute;left:0;top:${offset}px;width:${w.iconSize}px;font-size:${w.iconSize}px;color:${w.iconColor};line-height:1">${iconHTML(w.icon)}</div>`:'';
    const drawLines=(ls,size,lineHeight,paint,x,y,width,alignment)=>ls.map((line,i)=>{
      const delta=alignment==='right'?width-measure(line,size):alignment==='center'?(width-measure(line,size))/2:0;
      return `<span class="widget-text" style="left:${x+delta}px;top:${y+i*lineHeight}px;font-size:${size}px;line-height:${lineHeight}px;color:${paint}">${esc(line)||' '}</span>`;
    }).join('');
    if(showName)body+=`<div class="advanced-name" style="position:absolute;inset:0;font-size:${w.nameSize}px;line-height:${nline}px;color:${w.nameColor};pointer-events:none">${drawLines(nameLines,w.nameSize,nline,w.nameColor,iw,offset,inline?Math.min(textWidth,nameWidth):textWidth,w.nameAlign||(inline?'left':align))}</div>`;
    if(showValue)body+=`<div class="advanced-value" style="position:absolute;inset:0;font-size:${w.valueSize}px;line-height:${vline}px;color:${w.color};pointer-events:none">${drawLines(valueLines,w.valueSize,vline,w.color,iw+(inline?nameWidth:0),offset+(inline?0:nameLines.length*nline+(showName&&showValue?3:0)),valueWidth,w.valueAlign||(inline?'left':align))}</div>`;
    let visual=gauge;
    if(w.kind==='bar'){
      const gaugeY=Math.max(0,Math.min(available-w.thickness,offset+contentHeight-w.thickness));
      body=`<div style="position:absolute;left:0;top:0;width:100%;height:${Math.max(0,gaugeY-3)}px;overflow:hidden">${body}</div>`;
      visual=`<div class="advanced-bar" style="position:absolute;left:0;top:${gaugeY}px;width:100%;height:${w.thickness}px;background:${w.trackColor};overflow:hidden"><div style="width:${progress===null?0:progress*100}%;height:100%;background:${w.color}"></div></div>`;
    }
    return `<div class="widget-content advanced-content advanced-${w.kind}" style="position:absolute;inset:${pad}px;overflow:hidden">${ring?visual:''}${body}${ring?'':visual}</div>`;
  }
  return `<div class="widget-content advanced-content advanced-${w.kind}" style="position:absolute;inset:${pad}px;display:flex;flex-direction:column;justify-content:${justify};gap:3px;overflow:hidden">${ring?gauge:''}<div style="display:flex;align-items:flex-start;gap:${iw?8:0}px;min-width:0;${ring?'position:relative;z-index:1;':''}">${icon}<div style="min-width:0;flex:1;${inline?'display:flex;align-items:flex-start;':''}">${name}${showName&&showValue&&!inline?'<div style="height:3px"></div>':''}${value}</div></div>${ring?'':gauge}</div>`;
}
