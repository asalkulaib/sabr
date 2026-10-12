// Tiny DOM helpers. No framework.

const SVG_NS = 'http://www.w3.org/2000/svg';

function apply(el, props) {
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.setAttribute('class', value);
    else if (key === 'text') el.textContent = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'live') el.__live = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'value' && 'value' in el) el.value = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false || child === true) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** h('p', { class: 'quiet' }, 'text', h('span', ...)) */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  apply(el, props);
  append(el, children);
  return el;
}

export function s(tag, props, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  apply(el, props);
  append(el, children);
  return el;
}

/** The single highlight: a word or figure in gold. */
export const hl = (text) => h('span', { class: 'hl' }, text);

/**
 * An element whose content is recomputed on every tick. fn(nowTs) -> string.
 * With render, that string is a key and render(key) draws the children, as a
 * figure with small units is drawn.
 */
export function live(tag, props, fn, render = null) {
  const el = h(tag, props);
  el.__live = fn;
  el.__render = render;
  paint(el, fn(Date.now()));
  return el;
}

function paint(el, value) {
  if (el.__shown === value) return;
  el.__shown = value;
  if (!el.__render) {
    el.textContent = value;
    return;
  }
  el.replaceChildren();
  append(el, [el.__render(value)]);
}

/** Recomputes every live element under root. */
export function updateLive(root, nowTs) {
  for (const el of root.querySelectorAll('*')) {
    if (typeof el.__live === 'function') paint(el, el.__live(nowTs));
  }
}

/**
 * Shows one series and fades the rest: every outermost [data-series] element
 * under root that is not the focused one gets .dim. focus null shows all.
 */
export function dimOthers(root, focus) {
  root.setAttribute('data-focus', focus || '');
  for (const el of root.querySelectorAll('[data-series]')) {
    if (el.parentElement.closest('[data-series]')) continue;
    el.classList.toggle('dim', !!focus && el.dataset.series !== focus);
  }
  return root;
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
}

/** Soft fade in (250 to 400 ms, ease-out). */
export function fadeIn(el) {
  el.classList.remove('fade-out');
  el.classList.add('fade-in');
  return el;
}

export function fadeOut(el) {
  return new Promise((resolve) => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return resolve();
    el.classList.remove('fade-in');
    el.classList.add('fade-out');
    const done = () => resolve();
    el.addEventListener('animationend', done, { once: true });
    setTimeout(done, 400);
  });
}
