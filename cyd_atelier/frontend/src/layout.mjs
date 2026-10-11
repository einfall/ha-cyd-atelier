import {scaleParts} from './parts.mjs';

const clone = value => Array.isArray(value) ? value.map(clone) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) : value;
const clamp = (value, min, max) => Math.min(Math.max(min, max), Math.max(min, value));
const selected = (widgets, ids) => {
  const order = [...(ids || [])], byId = new Map(widgets.map(widget => [widget.id, widget]));
  return [...new Set(order)].map(id => byId.get(id)).filter(widget => widget && !widget.locked);
};
const displayRect = bounds => ({x: Number(bounds?.x) || 0, y: Number(bounds?.y) || 0,
  w: Math.max(1, Number(bounds?.width ?? bounds?.w) || 1), h: Math.max(1, Number(bounds?.height ?? bounds?.h) || 1)});
export function groupRect(widgets, ids) {
  const group = selected(widgets, ids);
  if (!group.length) return null;
  const x = Math.min(...group.map(widget => widget.x)), y = Math.min(...group.map(widget => widget.y));
  return {x, y, w: Math.max(...group.map(widget => widget.x + widget.w)) - x,
    h: Math.max(...group.map(widget => widget.y + widget.h)) - y};
}

// Geometry helpers return independent widgets so callers can checkpoint before assignment.
export function alignWidgets(widgets, ids, mode, bounds) {
  const result = clone(widgets), group = selected(result, ids), display = displayRect(bounds);
  if (!group.length || !['left', 'center', 'right', 'top', 'middle', 'bottom'].includes(mode)) return result;
  const target = group.length === 1 ? display : groupRect(result, ids);
  for (const widget of group) {
    if (mode === 'left') widget.x = target.x;
    if (mode === 'center') widget.x = target.x + (target.w - widget.w) / 2;
    if (mode === 'right') widget.x = target.x + target.w - widget.w;
    if (mode === 'top') widget.y = target.y;
    if (mode === 'middle') widget.y = target.y + (target.h - widget.h) / 2;
    if (mode === 'bottom') widget.y = target.y + target.h - widget.h;
    widget.x = clamp(widget.x, display.x, display.x + display.w - widget.w);
    widget.y = clamp(widget.y, display.y, display.y + display.h - widget.h);
  }
  return result;
}

export function equalSize(widgets, ids, axis, bounds) {
  const result = clone(widgets), group = selected(result, ids), display = displayRect(bounds);
  if (!group.length || !['width', 'height', 'both'].includes(axis)) return result;
  const reference = {...group[0]};
  for (const widget of group) {
    const oldWidth = widget.w, oldHeight = widget.h;
    if (axis !== 'height') widget.w = clamp(reference.w, Math.min(24, display.w), display.w);
    if (axis !== 'width') widget.h = clamp(reference.h, Math.min(16, display.h), display.h);
    widget.x = clamp(widget.x, display.x, display.x + display.w - widget.w);
    widget.y = clamp(widget.y, display.y, display.y + display.h - widget.h);
    if (oldWidth !== widget.w || oldHeight !== widget.h) scaleParts(widget, oldWidth, oldHeight);
  }
  return result;
}

export function distributeWidgets(widgets, ids, axis) {
  const result = clone(widgets), group = selected(result, ids);
  if (group.length < 3 || !['horizontal', 'vertical'].includes(axis)) return result;
  const position = axis === 'horizontal' ? 'x' : 'y', size = axis === 'horizontal' ? 'w' : 'h';
  group.sort((a, b) => a[position] - b[position]);
  const first = group[0][position], last = Math.max(...group.map(widget => widget[position] + widget[size]));
  const remaining = last - first - group.reduce((sum, widget) => sum + widget[size], 0);
  // Overlapping widgets may not fit the existing span. Keep that layout until resized.
  if (remaining < 0) return result;
  const gap = remaining / (group.length - 1);
  let cursor = first;
  for (const widget of group) {
    widget[position] = cursor;
    cursor += widget[size] + gap;
  }
  return result;
}

export function smartSnap(widgets, ids, rect, bounds, tolerance = 5) {
  const display = displayRect(bounds), excluded = new Set(ids || []), guides = [];
  const targets = [display, ...widgets.filter(widget => !excluded.has(widget.id))];
  const snapAxis = (position, size, axis) => {
    const start = display[position], end = start + display[size] - rect[size];
    const original = clamp(rect[position], start, end);
    let closest = null;
    for (const target of targets) {
      for (const offset of [0, target[size] / 2, target[size]]) {
        const line = target[position] + offset;
        for (const anchor of [0, rect[size] / 2, rect[size]]) {
          const candidate = line - anchor, delta = Math.abs(candidate - original);
          if (candidate < start || candidate > Math.max(start, end) || delta > Math.max(0, tolerance)) continue;
          if (!closest || delta < closest.delta) closest = {candidate, delta, line};
        }
      }
    }
    if (!closest) return original;
    guides.push({axis, position: closest.line});
    return closest.candidate;
  };
  return {x: snapAxis('x', 'w', 'x'), y: snapAxis('y', 'h', 'y'), guides};
}

export const STYLE_FIELDS = ['nameSize', 'valueSize', 'iconSize', 'color', 'nameColor', 'iconColor',
  'bg', 'transparent', 'borderColor', 'borderWidth', 'cornerRadius', 'padding', 'align',
  'nameAlign', 'valueAlign', 'valign', 'wrap', 'breakLine', 'rowHeight', 'rowGap',
  'valueColumn', 'listStyle', 'rowValign', 'rowAlternateBg', 'rowLineColor', 'rules', 'trackColor', 'thickness'];
export function styleOf(widget) {
  return Object.fromEntries(STYLE_FIELDS.filter(key => Object.hasOwn(widget, key)).map(key => [key, clone(widget[key])]));
}
export function applyStyle(widget, style) {
  const result = clone(widget);
  for (const key of STYLE_FIELDS) if (Object.hasOwn(style, key)) result[key] = clone(style[key]);
  return result;
}
