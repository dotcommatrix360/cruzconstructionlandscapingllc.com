// Tiny logic-light template engine (Handlebars subset).
//   {{path.to.value}}   escaped output      {{{raw}}}  unescaped output
//   {{#each list}}…{{else}}…{{/each}}       inside: {{this}}, {{@index}}, {{@first}}, {{@last}}, fields by name
//   {{#if value}}…{{else}}…{{/if}}          {{#unless value}}…{{/unless}}
// Lookups walk outward through enclosing scopes. Empty arrays are falsy.
import { escapeHtml } from './util.mjs';

const TOKEN = /\{\{\{\s*([\w.@]+)\s*\}\}\}|\{\{\s*(#each|#if|#unless|\/each|\/if|\/unless|else)?\s*([\w.@]*)\s*\}\}/g;

function parse(src) {
  const root = { type: 'root', children: [] };
  const stack = [root];
  let last = 0;
  let m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(src))) {
    const top = stack[stack.length - 1];
    if (m.index > last) (top.inElse ? top.alt : top.children).push({ type: 'text', value: src.slice(last, m.index) });
    last = TOKEN.lastIndex;
    const push = (n) => (top.inElse ? top.alt : top.children).push(n);
    if (m[1]) push({ type: 'var', path: m[1], raw: true });
    else if (!m[2]) push({ type: 'var', path: m[3], raw: false });
    else if (m[2].startsWith('#')) {
      const node = { type: m[2].slice(1), path: m[3], children: [], alt: [], inElse: false };
      push(node);
      stack.push(node);
    } else if (m[2] === 'else') {
      if (stack.length < 2) throw new Error('Template: {{else}} outside a block');
      top.inElse = true;
    } else {
      const kind = m[2].slice(1);
      if (top.type !== kind) throw new Error(`Template: {{/${kind}}} closes {{#${top.type}}}`);
      stack.pop();
    }
  }
  if (stack.length > 1) throw new Error(`Template: unclosed {{#${stack[stack.length - 1].type}}}`);
  if (last < src.length) root.children.push({ type: 'text', value: src.slice(last) });
  return root;
}

function lookup(scopes, p) {
  if (p === 'this' || p === '.') return scopes[scopes.length - 1];
  const parts = p.replace(/^this\./, '').split('.');
  for (let i = scopes.length - 1; i >= 0; i--) {
    const s = scopes[i];
    if (s != null && typeof s === 'object' && parts[0] in s) {
      return parts.reduce((o, k) => (o == null ? undefined : o[k]), s);
    }
  }
  return undefined;
}

const truthy = (v) => (Array.isArray(v) ? v.length > 0 : !!v);

function run(nodes, scopes) {
  let out = '';
  for (const n of nodes) {
    if (n.type === 'text') out += n.value;
    else if (n.type === 'var') {
      const v = lookup(scopes, n.path);
      const s = v == null ? '' : Array.isArray(v) ? v.join(', ') : String(v);
      out += n.raw ? s : escapeHtml(s);
    } else if (n.type === 'if') out += truthy(lookup(scopes, n.path)) ? run(n.children, scopes) : run(n.alt, scopes);
    else if (n.type === 'unless') out += !truthy(lookup(scopes, n.path)) ? run(n.children, scopes) : run(n.alt, scopes);
    else if (n.type === 'each') {
      const list = lookup(scopes, n.path);
      const arr = Array.isArray(list) ? list : list && typeof list === 'object' ? Object.values(list) : [];
      if (!arr.length) { out += run(n.alt, scopes); continue; }
      arr.forEach((item, i) => {
        const meta = { '@index': i, '@first': i === 0, '@last': i === arr.length - 1 };
        out += run(n.children, [...scopes, meta, item]);
      });
    }
  }
  return out;
}

const cache = new Map();
export function render(src, ctx) {
  let tree = cache.get(src);
  if (!tree) { tree = parse(src); cache.set(src, tree); }
  return run(tree.children, [ctx]);
}
