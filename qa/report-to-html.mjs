#!/usr/bin/env node
// Convierte un reporte QA en Markdown (formato de qa/REPORT_TEMPLATE.md) a un HTML
// autocontenido (sin librerías ni internet). Sin dependencias: solo Node.
//
//   node qa/report-to-html.mjs qa/reports/2026-10-20-agente.md            -> .../2026-10-20-agente.html
//   node qa/report-to-html.mjs reporte.md salida.html
//
// Todo el texto se escapa (el reporte puede citar entradas como <script> que el agente
// probó) y solo se incrustan imágenes locales (png/jpg/gif/webp) de la carpeta del reporte.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';

const [, , input, output] = process.argv;
if (!input) {
  console.error('Uso: node qa/report-to-html.mjs <reporte.md> [salida.html]');
  process.exit(1);
}
// Los comentarios <!-- --> de la plantilla (instrucciones) no son parte del reporte.
const md = readFileSync(input, 'utf-8').replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '');
const baseDir = resolve(dirname(input));

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const SEVERITIES = { critico: 'critico', alto: 'alto', medio: 'medio', bajo: 'bajo', duda: 'duda' };
const sevOf = (text) => SEVERITIES[slug(text).split('-').pop()] ?? SEVERITIES[slug(text).split('-')[0]] ?? null;
const STATUS = { paso: 'pass', 'paso-': 'pass', fallo: 'fail', omitido: 'skip', si: 'pass', no: 'fail' };

// ---------- inline: **negrita**, *cursiva*, `código`, [texto](url), ![alt](imagen)
function inline(text) {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => image(alt, src));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) =>
    /^(https?:\/\/|mailto:)/i.test(href) ? `<a href="${href}" rel="noopener noreferrer">${label}</a>` : label);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[Number(i)])}</code>`);
}
function image(alt, src) {
  const decoded = src.replace(/&amp;/g, '&');
  if (/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(decoded)) return `<img class="shot" alt="${alt}" src="${decoded}">`;
  const file = resolve(baseDir, decoded);
  const ok = file.startsWith(baseDir + sep) && ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(extname(file).toLowerCase()) && existsSync(file);
  if (!ok) return `<span class="muted">[imagen no incluida: ${esc(decoded)}]</span>`;
  const ext = extname(file).toLowerCase().slice(1).replace('jpg', 'jpeg');
  return `<img class="shot" alt="${alt}" src="data:image/${ext};base64,${readFileSync(file).toString('base64')}">`;
}

// ---------- bloques
const lines = md.split('\n');
const html = [];
let i = 0;
let finding = null; // severidad del hallazgo abierto
const closeFinding = () => { if (finding) { html.push('</article>'); finding = null; } };

function cell(c) {
  const t = c.trim();
  const key = slug(t.replace(/[*_`]/g, ''));
  const status = STATUS[key];
  const sev = SEVERITIES[key];
  if (status) return `<span class="badge ${status}">${esc(t.replace(/[*_`]/g, ''))}</span>`;
  if (sev) return `<span class="badge ${sev}">${esc(t.replace(/[*_`]/g, ''))}</span>`;
  return inline(t);
}
const splitRow = (l) => l.trim().replace(/^\||\|$/g, '').split('|');

function table(rows) {
  const head = splitRow(rows[0]).map((h) => h.trim());
  const body = rows.slice(2).map(splitRow);
  // Tabla Severidad | Cantidad -> fichas de resumen
  if (head.length === 2 && slug(head[0]) === 'severidad' && slug(head[1]) === 'cantidad') {
    return '<div class="grid">' + body.map((r) => {
      const label = r[0].trim();
      return `<div class="stat ${sevOf(label) ?? 'bajo'}"><b>${esc(r[1].trim())}</b>${esc(label)}</div>`;
    }).join('') + '</div>';
  }
  return '<div class="tablewrap"><table><thead><tr>' + head.map((h) => `<th>${inline(h)}</th>`).join('') + '</tr></thead><tbody>' +
    body.map((r) => '<tr>' + head.map((_, k) => `<td>${cell(r[k] ?? '')}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>';
}

function list(startIdx) {
  // Lista (con anidado simple por sangría). Devuelve [html, siguienteIndice].
  const out = [];
  let k = startIdx;
  const items = [];
  while (k < lines.length && (/^\s*([-*]|\d+\.)\s+/.test(lines[k]) || (/^\s+\S/.test(lines[k]) && items.length))) {
    const m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[k]);
    if (m) items.push({ indent: m[1].length, ordered: /\d/.test(m[2]), text: m[3] });
    else items[items.length - 1].text += ' ' + lines[k].trim();
    k++;
  }
  const render = (from, base) => {
    let r = '';
    let n = from;
    const ordered = items[from].ordered;
    r += ordered ? '<ol>' : '<ul>';
    while (n < items.length && items[n].indent >= base) {
      if (items[n].indent > base) { n++; continue; }
      let inner = '';
      const comment = /^\*\*Comentarios del agente:?\*\*:?\s*(.*)$/i.exec(items[n].text);
      let body = comment ? `<div class="comment"><b>Comentarios del agente</b>${inline(comment[1])}</div>` : inline(items[n].text);
      let c = n + 1;
      if (c < items.length && items[c].indent > base) {
        const [sub, next] = render(c, items[c].indent);
        inner = sub; c = next;
      }
      r += `<li${comment ? ' class="nobullet"' : ''}>${body}${inner}</li>`;
      n = c;
    }
    r += ordered ? '</ol>' : '</ul>';
    return [r, n];
  };
  if (items.length) out.push(render(0, items[0].indent)[0]);
  return [out.join(''), k];
}

let title = 'Reporte QA';
while (i < lines.length) {
  const line = lines[i];
  if (/^\s*$/.test(line)) { i++; continue; }
  const fence = /^```/.exec(line);
  if (fence) {
    const buf = [];
    i++;
    while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
    i++;
    html.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
    continue;
  }
  const h = /^(#{1,4})\s+(.*)$/.exec(line);
  if (h) {
    const level = h[1].length;
    const text = h[2].trim();
    if (level === 1) { title = text; closeFinding(); html.push(`<h1>${inline(text)}</h1>`); }
    else if (level === 2) { closeFinding(); html.push(`<h2 id="${slug(text)}">${inline(text)}</h2>`); }
    else if (level === 3 && /^H-\d+/i.test(text)) {
      closeFinding();
      const sev = sevOf(text.split(/\s[—–-]\s/).pop() ?? '') ?? 'medio';
      finding = sev;
      const parts = text.split(/\s[—–]\s/);
      const label = parts.length > 1 ? parts.slice(0, -1).join(' — ') : text;
      const badge = parts.length > 1 ? ` <span class="badge ${sev}">${esc(parts[parts.length - 1])}</span>` : '';
      html.push(`<article class="card finding ${sev}"><h3>${inline(label)}${badge}</h3>`);
    } else html.push(`<h${level}>${inline(text)}</h${level}>`);
    i++;
    continue;
  }
  if (/^\|/.test(line) && i + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[i + 1])) {
    const rows = [];
    while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
    html.push(table(rows));
    continue;
  }
  if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
    const [out, next] = list(i);
    html.push(out);
    i = next;
    continue;
  }
  if (/^>\s?/.test(line)) {
    const buf = [];
    while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
    html.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`);
    continue;
  }
  if (/^(-{3,}|\*{3,})\s*$/.test(line)) { html.push('<hr>'); i++; continue; }
  const para = [];
  while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,4}\s|```|\||\s*([-*]|\d+\.)\s|>)/.test(lines[i])) para.push(lines[i++]);
  html.push(`<p>${inline(para.join(' '))}</p>`);
}
closeFinding();

const css = `
:root{--bg:#fbf9f4;--card:#fff;--text:#1c2a44;--muted:#64708a;--line:#e3dfd3;--ok:#1a7f4b;--okbg:#e6f4ec;--warn:#a15c00;--warnbg:#fdf0dc;--bad:#b3261e;--badbg:#fbe7e5;--crit:#7a0f0f;--critbg:#f6d3d0;--skip:#64708a;--skipbg:#eceff4;--code:#f3f0e8}
@media (prefers-color-scheme:dark){:root{--bg:#10172a;--card:#18213a;--text:#e8ecf5;--muted:#9aa6c0;--line:#2b3656;--ok:#58d08b;--okbg:#143524;--warn:#f0b35a;--warnbg:#3a2a10;--bad:#ff8a80;--badbg:#3d1a18;--crit:#ffb4ab;--critbg:#4a1713;--skip:#9aa6c0;--skipbg:#222c47;--code:#222c47}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:960px;margin:0 auto;padding:24px 16px 64px}h1{font-size:24px;margin:0 0 8px}h2{font-size:18px;margin:32px 0 12px}h3{font-size:16px;margin:0 0 8px}h4{font-size:14px}
.muted{color:var(--muted);font-size:13px}p{margin:8px 0}a{color:var(--ok)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin:12px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin:12px 0}
.stat{text-align:center;padding:12px 8px;border-radius:10px;border:1px solid var(--line)}.stat b{display:block;font-size:26px;line-height:1.1}
.badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:600;vertical-align:middle}
.badge.critico,.stat.critico{background:var(--critbg);color:var(--crit)}.badge.alto,.stat.alto{background:var(--badbg);color:var(--bad)}.badge.medio,.stat.medio{background:var(--warnbg);color:var(--warn)}.badge.bajo,.stat.bajo{background:var(--skipbg);color:var(--skip)}
.badge.duda,.stat.duda{background:var(--skipbg);color:var(--skip);border:1px dashed var(--skip)}.pass{background:var(--okbg);color:var(--ok)}.fail{background:var(--badbg);color:var(--bad)}.skip{background:var(--skipbg);color:var(--skip)}
.tablewrap{overflow-x:auto;margin:12px 0;background:var(--card);border:1px solid var(--line);border-radius:12px}table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}tr:last-child td{border-bottom:0}
.finding{border-left:5px solid var(--line)}.finding.critico{border-left-color:var(--crit)}.finding.alto{border-left-color:var(--bad)}.finding.medio{border-left-color:var(--warn)}.finding.bajo,.finding.duda{border-left-color:var(--skip)}
.finding>ul{list-style:none;padding-left:0;margin:8px 0}.finding>ul>li{margin:6px 0}.finding>ul>li.nobullet{margin-top:12px}
ul,ol{padding-left:22px;margin:6px 0}li{margin:3px 0}
.comment{background:var(--code);border-radius:8px;padding:10px 12px;font-size:14px}.comment b{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:2px}
img.shot{max-width:100%;border:1px solid var(--line);border-radius:8px;margin-top:8px}
code{background:var(--code);padding:1px 5px;border-radius:4px;font-size:13px}pre{background:var(--code);padding:12px;border-radius:8px;overflow-x:auto}pre code{padding:0;background:none}
blockquote{margin:8px 0;padding:6px 14px;border-left:4px solid var(--line);color:var(--muted)}hr{border:0;border-top:1px solid var(--line);margin:24px 0}`;

const out = output ?? input.replace(/\.md$/i, '') + '.html';
writeFileSync(out, `<!doctype html>\n<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>${css}</style></head><body><main>\n${html.join('\n')}\n</main></body></html>\n`);
console.log(`Reporte HTML generado: ${out}`);
