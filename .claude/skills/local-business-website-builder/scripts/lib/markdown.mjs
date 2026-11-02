// Front matter + Markdown → HTML. Uses `marked` if installed in the repo; otherwise a
// built-in converter covering what articles need: headings (with ids), paragraphs,
// lists (nested by indent), blockquotes, fenced code, tables, hr, images, links,
// emphasis, inline code, and raw HTML blocks (passed through).
import { escapeHtml, slugify, tryImport } from './util.mjs';

export function parseFrontMatter(src) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  if (!m) return { data: {}, body: src };
  const data = {};
  let lastKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const item = /^\s+-\s+(.*)$/.exec(line) || /^-\s+(.*)$/.exec(line);
    if (item && lastKey) {
      if (!Array.isArray(data[lastKey])) data[lastKey] = [];
      data[lastKey].push(scalar(item[1]));
      continue;
    }
    const kv = /^([\w-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    lastKey = kv[1];
    data[kv[1]] = kv[2] === '' ? '' : scalar(kv[2]);
  }
  return { data, body: src.slice(m[0].length) };
}

function scalar(v) {
  v = v.trim();
  if (/^\[.*\]$/.test(v)) return v.slice(1, -1).split(',').map((s) => scalar(s)).filter((s) => s !== '');
  if (/^(['"]).*\1$/.test(v)) return v.slice(1, -1);
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return '';
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

let markedLib;
export async function markdownToHtml(md) {
  if (markedLib === undefined) {
    const mod = await tryImport('marked');
    markedLib = mod ? (mod.marked || mod.default?.marked || mod.default) : null;
  }
  if (markedLib && typeof markedLib.parse === 'function') return addHeadingIds(markedLib.parse(md));
  return convert(md);
}

function addHeadingIds(html) {
  const used = new Set();
  return html.replace(/<h([2-6])>([\s\S]*?)<\/h\1>/g, (all, n, inner) => {
    const id = uniqueId(slugify(inner.replace(/<[^>]+>/g, '')), used);
    return `<h${n} id="${id}">${inner}</h${n}>`;
  });
}

function uniqueId(base, used) {
  let id = base || 'section';
  let i = 2;
  while (used.has(id)) id = `${base}-${i++}`;
  used.add(id);
  return id;
}

function inline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, code) => `\u0000${codes.push(escapeHtml(code)) - 1}\u0000`);
  // Escape bare & < > that aren't part of inline HTML tags/entities.
  s = s.replace(/&(?!#?\w+;)/g, '&amp;').replace(/<(?![a-zA-Z/!])/g, '&lt;');
  s = s.replace(/!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"([^"]*)")?\s*\)/g, (_, alt, src, title) =>
    `<img src="${src}" alt="${escapeHtml(alt)}"${title ? ` title="${escapeHtml(title)}"` : ''} loading="lazy" decoding="async">`);
  s = s.replace(/\[([^\]]+)\]\(\s*([^)\s]+)(?:\s+"([^"]*)")?\s*\)/g, (_, text, href, title) => {
    const ext = /^https?:\/\//.test(href);
    return `<a href="${href}"${title ? ` title="${escapeHtml(title)}"` : ''}${ext ? ' rel="noopener"' : ''}>${text}</a>`;
  });
  s = s.replace(/<(https?:\/\/[^>\s]+)>/g, '<a href="$1" rel="noopener">$1</a>');
  s = s.replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_, a, b) => `<strong>${a || b}</strong>`);
  s = s.replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1<em>$2</em>').replace(/(^|[^_\w])_(?!\s)(.+?)_(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/ {2,}\n/g, '<br>\n');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

export function convert(md) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const used = new Set();
  let i = 0;
  const isBlank = (l) => !l || !l.trim();
  const blockStart = (l) => /^(#{1,6}\s|```|~~~|>|\s*([-*+]|\d+[.)])\s|<\/?[a-zA-Z]|(\*\s*){3,}$|(-\s*){3,}$|\|)/.test(l);

  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }

    let m;
    if ((m = /^(```|~~~)\s*([\w-]*)/.exec(line))) {
      const fence = m[1];
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(fence)) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code${m[2] ? ` class="language-${m[2]}"` : ''}>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }
    if ((m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))) {
      const n = m[1].length;
      const text = inline(m[2]);
      out.push(`<h${n} id="${uniqueId(slugify(m[2].replace(/[*_`]/g, '')), used)}">${text}</h${n}>`);
      i++;
      continue;
    }
    if (/^ {0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/.test(line)) { out.push('<hr>'); i++; continue; }
    if (/^<\/?[a-zA-Z!]/.test(line)) {
      const buf = [];
      while (i < lines.length && !isBlank(lines[i])) buf.push(lines[i++]);
      out.push(buf.join('\n'));
      continue;
    }
    if (line.startsWith('>')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('>')) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>\n${convert(buf.join('\n'))}\n</blockquote>`);
      continue;
    }
    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(line);
      const align = cells(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : ''));
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      const st = (j) => (align[j] ? ` style="text-align:${align[j]}"` : '');
      out.push(`<table>\n<thead><tr>${head.map((h, j) => `<th scope="col"${st(j)}>${inline(h)}</th>`).join('')}</tr></thead>\n<tbody>\n${rows
        .map((r) => `<tr>${r.map((c, j) => `<td${st(j)}>${inline(c)}</td>`).join('')}</tr>`).join('\n')}\n</tbody>\n</table>`);
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const [html, next] = list(lines, i);
      out.push(html);
      i = next;
      continue;
    }
    const buf = [];
    while (i < lines.length && !isBlank(lines[i]) && !(buf.length && blockStart(lines[i]))) buf.push(lines[i++]);
    out.push(`<p>${inline(buf.join('\n'))}</p>`);
  }
  return out.join('\n');

  function list(ls, start) {
    const indentOf = (l) => l.match(/^\s*/)[0].length;
    const baseIndent = indentOf(ls[start]);
    const ordered = /^\s*\d+[.)]/.test(ls[start]);
    const items = [];
    let j = start;
    while (j < ls.length) {
      const l = ls[j];
      if (isBlank(l)) {
        const nxt = ls[j + 1];
        const sameKind = nxt && (indentOf(nxt) > baseIndent || /^\s*\d+[.)]/.test(nxt) === ordered);
        if (nxt && /^\s*([-*+]|\d+[.)])\s+/.test(nxt) && indentOf(nxt) >= baseIndent && sameKind) { j++; continue; }
        break;
      }
      const ind = indentOf(l);
      const mm = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(l);
      if (mm && ind === baseIndent) { items.push({ text: [mm[2]], sub: [] }); j++; continue; }
      if (ind > baseIndent && items.length) {
        const cur = items[items.length - 1];
        if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
          const [html, next] = list(ls, j);
          cur.sub.push(html);
          j = next;
        } else { cur.text.push(l.trim()); j++; }
        continue;
      }
      if (ind < baseIndent || mm) break;
      items[items.length - 1]?.text.push(l.trim());
      j++;
    }
    const tag = ordered ? 'ol' : 'ul';
    return [`<${tag}>\n${items.map((it) => `<li>${inline(it.text.join('\n'))}${it.sub.join('')}</li>`).join('\n')}\n</${tag}>`, j];
  }
}

export function plainText(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&[#\w]+;/g, ' ').replace(/\s+/g, ' ').trim();
}
