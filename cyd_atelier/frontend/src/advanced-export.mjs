import {ADVANCED_KINDS,normalizeAdvancedWidget} from './advanced.mjs';
const cstr=s=>JSON.stringify(String(s)).replace(/[\u2028\u2029]/g,' ');
const col=s=>`Color(0x${String(s||'#ffffff').replace('#','')})`;
const align=s=>Math.max(0,['left','center','right'].indexOf(s));
const iconLiteral=(name,iconMap)=>name?`"\\U${iconMap.get(String(name).replace(/^mdi:/,''))?.code.toString(16).padStart(8,'0')||'000F0004'}"`:'""';

// These helpers only read values and draw; strip-buffer displays can call them repeatedly.
export const ADVANCED_CPP = `
auto cydg_number = [](const std::string &raw, double &number) -> bool {
  if (raw.empty()) return false;
  for (char c : raw) if (!((c >= '0' && c <= '9') || c == '.' || c == '+' || c == '-' || c == 'e' || c == 'E' || c == ' ' || c == '\\t' || c == '\\r' || c == '\\n')) return false;
  char *end = nullptr;
  number = strtod(raw.c_str(), &end);
  if (end == raw.c_str() || !std::isfinite(number)) return false;
  while (*end == ' ' || *end == '\\t' || *end == '\\r' || *end == '\\n') ++end;
  return *end == '\\0';
};
auto cydg_text_height = [&](int width, font::Font *f, const std::string &text, bool wrap, int line_h) -> int {
  std::string line;
  int count = 1;
  for (size_t i = 0; i < text.size();) {
    unsigned char c = (unsigned char) text[i];
    if (c == '\\n') { count++; line.clear(); i++; continue; }
    size_t len = c < 0x80 ? 1 : (c < 0xE0 ? 2 : (c < 0xF0 ? 3 : 4));
    std::string next = line + text.substr(i, len);
    int bx, by, bw, bh;
    it.get_text_bounds(0, 0, next.c_str(), f, TextAlign::TOP_LEFT, &bx, &by, &bw, &bh);
    if (wrap && bw > width && !line.empty()) { count++; line.clear(); }
    line += text.substr(i, len); i += len;
  }
  return count * line_h;
};
auto cydg_ring = [&](int cx, int cy, int radius, int thickness, double progress, Color track, Color fill) {
  int inner = std::max(0, radius - thickness + 1);
  int segments = std::max(360, radius * 8);
  for (int step = 0; step < segments; step++) {
    double angle = 360.0 * step / segments;
    double rad = (angle - 90) * 0.017453292519943295;
    Color color = progress >= 0 && angle < progress * 360.0 ? fill : track;
    it.line(cx + (int) std::round(std::cos(rad) * inner), cy + (int) std::round(std::sin(rad) * inner), cx + (int) std::round(std::cos(rad) * radius), cy + (int) std::round(std::sin(rad) * radius), color);
  }
};`;

export function advancedDrawCPP(source,{bindingId,iconMap,timeId='cydg_clock'}={}){
  const needsAdvanced=ADVANCED_KINDS.includes(source.kind)||(source.rules||[]).length||source.nameAlign||source.valueAlign||source.valign&&source.valign!=='top'||source.listRow&&(source.listStyle&&source.listStyle!=='plain');
  if(!needsAdvanced||source.kind==='list'||source.kind==='frame')return null;
  const w=normalizeAdvancedWidget({...source}),out=[];
  const pad=Number(w.padding)||0,nline=Math.ceil(w.nameSize*1.2),vline=Math.ceil(w.valueSize*1.2);
  const name=w.kind==='text'||w.kind==='button'||w.show!=='value';
  const value=!['text','button'].includes(w.kind)&&w.show!=='name';
  const inline=name&&value&&!w.breakLine&&!['bar','ring'].includes(w.kind);
  const initialBg=w.bg;
  out.push(`{ // Advanced widget ${String(w.id).replace(/[^\w]/g,'')}`,`it.start_clipping(${w.x}, ${w.y}, ${w.x+w.w}, ${w.y+w.h});`,
    `Color bg_color = ${col(initialBg)}, value_color = ${col(w.color)}, icon_color = ${col(w.iconColor)};`,
    `std::string icon = ${iconLiteral(w.icon,iconMap)};`,
    bindingId?`bool has_raw = id(${bindingId}).has_state();\nstd::string raw = has_raw ? id(${bindingId}).state : "";`:'bool has_raw = false;\nstd::string raw;',
    'double numeric = 0; bool is_numeric = has_raw && cydg_number(raw, numeric);');
  for(const [i,r] of w.rules.entries()){
    const comparison={eq:`raw == ${cstr(r.value)}`,ne:`raw != ${cstr(r.value)}`}[r.operator];
    const numericRule=/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(r.value.trim())&&Number.isFinite(Number(r.value));
    const operator={gt:'>',gte:'>=',lt:'<',lte:'<='}[r.operator];
    const test=comparison?`has_raw && (${comparison})`:numericRule?`is_numeric && numeric ${operator} ${Number(r.value)}`:'false';
    out.push(`${i?'else ':''}if (${test}) {`);
    if(r.color)out.push(`value_color = ${col(r.color)}; icon_color = ${col(r.color)};`);
    if(r.bg)out.push(`bg_color = ${col(r.bg)};`);
    if(r.icon)out.push(`icon = ${iconLiteral(r.icon,iconMap)};`);
    out.push('}');
  }
  if(!w.transparent||source.listRow&&source.listStyle==='zebra')out.push(w.cornerRadius>0?`draw_widget_shape(${w.x}, ${w.y}, ${w.w}, ${w.h}, ${w.cornerRadius}, 0, bg_color);`:`it.filled_rectangle(${w.x}, ${w.y}, ${w.w}, ${w.h}, bg_color);`);
  out.push(`int iw = icon.empty() ? 0 : ${w.iconSize+8};`,`int tx = ${w.x+pad} + iw, tw = std::max(1, ${w.w-2*pad} - iw);`,`std::string value;`);
  if(value){
    if(w.kind==='clock'){
      const format=(w.clockFormat==='date'?'%d.%m.%Y':w.clockFormat==='datetime'?'%d.%m.%Y %H:%M':'%H:%M')+(w.clockFormat!=='date'&&w.clockSeconds?':%S':'');
      out.push(`auto clock_now = id(${timeId}).now();`,`value = clock_now.is_valid() ? clock_now.strftime(${cstr(format)}) : "—";`);
      if(w.clockWeekday)out.push('if (clock_now.is_valid()) {','const char *weekdays[] = {"", "So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."};','value = std::string(weekdays[clock_now.day_of_week]) + " " + value;','}');
    }else if(w.kind==='timer'){
      out.push('if (!is_numeric || numeric < 0) value = "—";','else {','unsigned long seconds = (unsigned long) std::floor(std::min(2147483647.0, numeric));',
        w.timerFormat==='hhmmss'?'value = str_sprintf("%02lu:%02lu:%02lu", seconds / 3600, (seconds / 60) % 60, seconds % 60);':'value = str_sprintf("%02lu:%02lu", seconds / 60, seconds % 60);','}');
    }else{
      out.push('value = raw;','if (!has_raw || value.empty() || value == "unknown" || value == "unavailable") value = "—";','else {',`if (value == "on") value = ${cstr(w.onText)};`,`else if (value == "off") value = ${cstr(w.offText)};`);
      if(w.precision>=0)out.push(`else if (is_numeric) value = str_sprintf("%.${Math.floor(w.precision)}f", numeric);`);
      if(w.unit)out.push(`value += ${cstr(' '+w.unit)};`);
      out.push('}');
    }
  }
  if(['bar','ring'].includes(w.kind))out.push(`double progress = is_numeric ? std::max(0.0, std::min(1.0, (numeric - (${w.minValue})) / (${w.maxValue} - (${w.minValue})))) : -1.0;`);
  const bodyHeight=`std::max(${w.iconSize} * (!icon.empty()), ${name?`cydg_text_height(tw, id(cydg_text_${w.nameSize}), ${cstr(w.label)}, ${!!w.wrap}, ${nline})`:'0'}${name&&value&&!inline?' + 3':''}${value?`${name&&!inline?' + ':inline?' + 0 * ':' + '}cydg_text_height(tw, id(cydg_text_${w.valueSize}), value, ${!!w.wrap}, ${vline})`:''})`;
  const bar=w.kind==='bar'?w.thickness+3:0;
  out.push(`int content_h = ${bodyHeight}${bar?' + '+bar:''};`);
  if(inline)out.push('int inline_x, inline_y, inline_width, inline_height;',`it.get_text_bounds(0, 0, ${cstr(w.label+' ')}, id(cydg_text_${w.nameSize}), TextAlign::TOP_LEFT, &inline_x, &inline_y, &inline_width, &inline_height);`,
    `content_h = std::max(${w.iconSize} * (!icon.empty()), std::max(cydg_text_height(tw, id(cydg_text_${w.nameSize}), ${cstr(w.label+' ')}, false, ${nline}), cydg_text_height(std::max(1, tw - inline_width), id(cydg_text_${w.valueSize}), value, ${!!w.wrap}, ${vline})));`);
  const y=w.valign==='bottom'?`std::max(${w.y+pad}, ${w.y+w.h-pad} - content_h)`:w.valign==='middle'?`std::max(${w.y+pad}, ${w.y+pad} + (${w.h-2*pad} - content_h) / 2)`:String(w.y+pad);
  out.push(`int y = ${y}; int content_y = y;`);
  if(w.kind==='ring'){
    const radius=Math.max(1,Math.floor(Math.min(w.w-2*pad,w.h-2*pad)/2)),thickness=Math.min(w.thickness,radius);
    out.push(`cydg_ring(${w.x+Math.floor(w.w/2)}, ${w.y+Math.floor(w.h/2)}, ${radius}, ${thickness}, progress, ${col(w.trackColor)}, value_color);`);
  }
  if(w.kind==='bar')out.push(`int gauge_y = std::max(${w.y+pad}, std::min(${w.y+w.h-pad-w.thickness}, content_y + content_h - ${w.thickness}));`,`it.start_clipping(${w.x+pad}, ${w.y+pad}, ${w.x+w.w-pad}, std::max(${w.y+pad}, gauge_y - 3));`);
  if(w.parts){
    const fallback={icon:{x:pad,y:pad,w:w.iconSize,h:w.iconSize},name:{x:pad,y:pad,w:w.w-2*pad,h:nline},value:{x:pad,y:pad+(name?nline+3:0),w:w.w-2*pad,h:vline}};
    for(const key of ['icon','name','value']){
      if(key==='name'&&!name||key==='value'&&!value)continue;
      if(key==='icon'&&!w.icon&&!w.rules.some(r=>r.icon))continue;
      const r=w.parts[key]||fallback[key],x=w.x+r.x,y=w.y+r.y;
      out.push(`// Item ${key}`,`it.start_clipping(${x}, ${y}, ${x+r.w}, ${y+r.h});`);
      if(key==='icon')out.push(`if (!icon.empty()) it.print(${x}, ${y}, id(cydg_icon_${w.iconSize}), icon_color, TextAlign::TOP_LEFT, icon.c_str());`);
      else{
        const size=key==='name'?w.nameSize:w.valueSize,str=key==='name'?cstr(w.label):'value',paint=key==='name'?col(w.nameColor):'value_color';
        const lineHeight=key==='name'?nline:vline;
        const posY=w.valign==='top'?String(y):w.valign==='bottom'?`${y} + std::max(0, ${r.h} - cydg_text_height(${r.w}, id(cydg_text_${size}), ${str}, ${!!w.wrap}, ${lineHeight}))`:`${y} + std::max(0, (${r.h} - cydg_text_height(${r.w}, id(cydg_text_${size}), ${str}, ${!!w.wrap}, ${lineHeight})) / 2)`;
        out.push(`draw_text(${x}, ${posY}, ${r.w}, id(cydg_text_${size}), ${paint}, ${str}, ${!!w.wrap}, ${align(w[key==='name'?'nameAlign':'valueAlign']||(source.listRow&&key==='value'?'right':w.align))}, ${lineHeight});`);
      }
      out.push('it.end_clipping();');
    }
  }else{
    if(w.icon||w.rules.some(r=>r.icon))out.push(`if (!icon.empty()) it.print(${w.x+pad}, y, id(cydg_icon_${w.iconSize}), icon_color, TextAlign::TOP_LEFT, icon.c_str());`);
    if(inline){
      out.push('int bx, by, bw, bh;',`it.get_text_bounds(0, 0, ${cstr(w.label+' ')}, id(cydg_text_${w.nameSize}), TextAlign::TOP_LEFT, &bx, &by, &bw, &bh);`,
        `draw_text(tx, y, std::min(tw, bw), id(cydg_text_${w.nameSize}), ${col(w.nameColor)}, ${cstr(w.label+' ')}, false, ${align(w.nameAlign||'left')}, ${nline});`,
        `draw_text(tx + bw, y, std::max(1, tw - bw), id(cydg_text_${w.valueSize}), value_color, value, ${!!w.wrap}, ${align(w.valueAlign||'left')}, ${vline});`);
    }else{
      if(name)out.push(`y = draw_text(tx, y, tw, id(cydg_text_${w.nameSize}), ${col(w.nameColor)}, ${cstr(w.label)}, ${!!w.wrap}, ${align(w.nameAlign||w.align)}, ${nline});`);
      if(name&&value)out.push('y += 3;');
      if(value)out.push(`y = draw_text(tx, y, tw, id(cydg_text_${w.valueSize}), value_color, value, ${!!w.wrap}, ${align(w.valueAlign||w.align)}, ${vline});`);
    }
  }
  if(w.kind==='bar')out.push('it.end_clipping();',`it.filled_rectangle(${w.x+pad}, gauge_y, ${Math.max(1,w.w-2*pad)}, ${w.thickness}, ${col(w.trackColor)});`,`if (progress >= 0) it.filled_rectangle(${w.x+pad}, gauge_y, (int) std::round(${Math.max(1,w.w-2*pad)} * progress), ${w.thickness}, value_color);`);
  if(source.rowSeparator||source.listRow&&source.listStyle==='lines')out.push(`it.line(${w.x}, ${w.y+w.h-1}, ${w.x+w.w-1}, ${w.y+w.h-1}, ${col(source.rowLineColor)});`);
  if(w.borderWidth>0)out.push(`draw_widget_shape(${w.x}, ${w.y}, ${w.w}, ${w.h}, ${w.cornerRadius}, ${w.borderWidth}, ${col(w.borderColor)});`);
  out.push('it.end_clipping();','}');return out;
}
