// Lightweight HTML inspection (regex-based; adequate for well-formed static pages we author).

export function stripComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

/** Remove <script>/<style>/<template> contents (keeps the tags so attributes remain inspectable). */
export function stripScriptsStyles(html) {
  return html.replace(/<(script|style|template)\b([^>]*)>[\s\S]*?<\/\1>/gi, '<$1$2></$1>');
}

export function parseAttrs(s) {
  const attrs = {};
  const re = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;
  let m;
  while ((m = re.exec(s))) attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return attrs;
}

/** All opening tags of the given names, with attributes and position. */
export function findTags(html, names) {
  const re = new RegExp(`<(${names.join('|')})\\b((?:[^>"']|"[^"]*"|'[^']*')*)>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push({ tag: m[1].toLowerCase(), attrs: parseAttrs(m[2]), index: m.index, raw: m[0] });
  return out;
}

/** Elements with inner content (non-nested use: title, h1–h6, a, button, label, script). */
export function findElements(html, name) {
  const re = new RegExp(`<${name}\\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\\s\\S]*?)</${name}>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push({ attrs: parseAttrs(m[1]), inner: m[2], index: m.index });
  return out;
}

export function textContent(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp|#39);/gi, (all, e) => {
    const map = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
    if (map[e.toLowerCase()]) return map[e.toLowerCase()];
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return all;
  });
}

export function headings(html) {
  const re = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push({ level: Number(m[1]), text: textContent(m[2]), index: m.index });
  return out;
}

export function meta(html, key, attr = 'name') {
  const t = findTags(html, ['meta']).find((x) => (x.attrs[attr] || '').toLowerCase() === key.toLowerCase());
  return t ? t.attrs.content : undefined;
}

export function linkRel(html, rel) {
  return findTags(html, ['link']).filter((x) => (x.attrs.rel || '').toLowerCase().split(/\s+/).includes(rel));
}

/** Line number (1-based) of a string index. */
export function lineOf(html, index) {
  let n = 1;
  for (let i = 0; i < index && i < html.length; i++) if (html.charCodeAt(i) === 10) n++;
  return n;
}
