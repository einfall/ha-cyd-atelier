// Pointer capture keeps touch sorting independent of native HTML drag-and-drop.
// Only the DOM order changes during a gesture; the project commits on release.
export function bindListSorting(root, onMove) {
  let gesture = null, frame = null;
  const animations = new Set();
  const rows = list => [...list.querySelectorAll('[data-list-index]')];
  const cancelAnimations = () => {
    for (const animation of animations) animation.cancel();
    animations.clear();
  };
  function scrollParent(el) {
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight) return parent;
    }
    return document.scrollingElement || document.documentElement;
  }
  function positionGhost() {
    gesture.ghost.style.transform = `translateY(${gesture.y - gesture.startY}px) scale(1.02)`;
  }
  function reorder() {
    const g = gesture;
    cancelAnimations();
    const before = new Map(rows(g.list).map(row => [row, row.getBoundingClientRect().top]));
    const center = g.y - g.offsetY + g.height / 2;
    const others = rows(g.list).filter(row => row !== g.row);
    const next = others.find(row => {
      const rect = row.getBoundingClientRect();
      return center < rect.top + rect.height / 2;
    });
    if (next === g.row.nextElementSibling || (!next && !g.row.nextElementSibling)) return;
    g.list.insertBefore(g.row, next || null);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    for (const row of rows(g.list)) {
      const delta = before.get(row) - row.getBoundingClientRect().top;
      if (!delta || !row.animate) continue;
      const animation = row.animate([{transform: `translateY(${delta}px)`}, {transform: 'translateY(0)'}], {duration: 150, easing: 'ease-out'});
      animations.add(animation);
      animation.onfinish = () => animations.delete(animation);
    }
  }
  function autoScroll() {
    frame = null;
    if (!gesture?.ghost) return;
    const g = gesture, page = g.scroll === document.scrollingElement || g.scroll === document.documentElement;
    const rect = page ? {top: 0, bottom: window.innerHeight} : g.scroll.getBoundingClientRect();
    const edge = 56;
    const speed = g.y < rect.top + edge ? -Math.min(14, (rect.top + edge - g.y) / 4)
      : g.y > rect.bottom - edge ? Math.min(14, (g.y - rect.bottom + edge) / 4) : 0;
    if (speed) {
      g.scroll.scrollTop += speed;
      reorder();
    }
    frame = requestAnimationFrame(autoScroll);
  }
  function lift() {
    const g = gesture, rect = g.row.getBoundingClientRect();
    g.offsetY = g.startY - rect.top;
    g.height = rect.height;
    g.ghost = g.row.cloneNode(true);
    g.ghost.classList.add('list-drag-ghost');
    g.ghost.removeAttribute('data-list-index');
    g.ghost.setAttribute('aria-hidden', 'true');
    for (const button of g.ghost.querySelectorAll('button')) button.tabIndex = -1;
    Object.assign(g.ghost.style, {top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`, height: `${rect.height}px`});
    document.body.append(g.ghost);
    g.row.classList.add('list-sort-source');
    g.list.classList.add('list-sorting');
    document.body.classList.add('list-sort-active');
    positionGhost();
    frame = requestAnimationFrame(autoScroll);
  }
  function finish(cancel = false) {
    if (!gesture) return;
    const g = gesture, to = rows(g.list).indexOf(g.row);
    gesture = null;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    cancelAnimations();
    g.ghost?.remove();
    g.row.classList.remove('list-sort-source');
    g.list.classList.remove('list-sorting');
    document.body.classList.remove('list-sort-active');
    if (cancel) for (const row of g.order) g.list.append(row);
    if (root.hasPointerCapture?.(g.pointerId)) root.releasePointerCapture(g.pointerId);
    if (!cancel && to !== g.from) onMove(g.from, to);
    const handle = root.querySelector(`[data-list-drag="${cancel ? g.from : to}"]`);
    handle?.focus({preventScroll: true});
  }
  root.addEventListener('pointerdown', event => {
    const handle = event.target.closest('[data-list-drag]');
    if (!handle || handle.disabled || gesture || event.isPrimary === false || event.button !== 0) return;
    event.preventDefault();
    const row = handle.closest('[data-list-index]'), list = row.parentElement;
    gesture = {row, list, order: rows(list), from: Number(handle.dataset.listDrag), pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY, y: event.clientY, scroll: scrollParent(list), ghost: null};
    handle.focus({preventScroll: true});
    root.setPointerCapture?.(event.pointerId);
  });
  root.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    event.preventDefault();
    gesture.y = event.clientY;
    if (!gesture.ghost && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) >= 5) lift();
    if (gesture.ghost) {positionGhost();reorder();}
  });
  root.addEventListener('pointerup', event => {if (event.pointerId === gesture?.pointerId) finish();});
  root.addEventListener('pointercancel', event => {if (event.pointerId === gesture?.pointerId) finish(true);});
  root.addEventListener('lostpointercapture', () => finish(true));
  root.addEventListener('keydown', event => {
    const handle = event.target.closest('[data-list-drag]');
    if (!handle || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();event.stopPropagation();
    if (gesture || handle.disabled) return;
    const from = Number(handle.dataset.listDrag), last = rows(handle.closest('.list-item-controls')).length - 1;
    const to = event.key === 'Home' ? 0 : event.key === 'End' ? last : Math.max(0, Math.min(last, from + (event.key === 'ArrowUp' ? -1 : 1)));
    if (to !== from) onMove(from, to);
    root.querySelector(`[data-list-drag="${to}"]`)?.focus({preventScroll: true});
  });
  document.addEventListener('keydown', event => {
    if (!gesture) return;
    // Prevent project/widget shortcuts while a temporary DOM order is visible.
    if (event.key === 'Escape') {event.preventDefault();event.stopPropagation();finish(true);}
    else if (event.ctrlKey || event.metaKey) {event.preventDefault();event.stopPropagation();}
  }, true);
  window.addEventListener('blur', () => finish(true));
  window.addEventListener('pagehide', () => finish(true));
  return {get active() {return !!gesture;}, cancel: () => finish(true)};
}
