// GENERATED from dc-runtime/src/*.ts — do not edit. Rebuild with `cd dc-runtime && bun run build`.
// This is the Claude Design canvas runtime that renders the .dc.html reference
// mockups in this directory. It is NOT part of the condominio-app application
// itself — it only exists so the .dc.html files can be opened directly in a
// browser to preview the design reference. Do not import/use this in the app.
"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  function getReact() {
    const R = window.React;
    if (!R) throw new Error("dc-runtime: window.React is not available yet");
    return R;
  }
  function getReactDOM() {
    const RD = window.ReactDOM;
    if (!RD) throw new Error("dc-runtime: window.ReactDOM is not available yet");
    return RD;
  }
  var h = ((...args) => getReact().createElement(...args));
  function parseDcDocument(doc) {
    const dc = doc.querySelector("x-dc");
    if (!dc) return null;
    const scriptEl = doc.querySelector("script[data-dc-script]");
    const { props, preview } = parseDataProps(scriptEl?.getAttribute("data-props") ?? null);
    return { template: dc.innerHTML, js: scriptEl ? scriptEl.textContent || "" : "", props, preview };
  }
  function parseDcText(src) {
    const openMatch = /<x-dc(?:\s[^>]*)?>/.exec(src);
    if (!openMatch) return null;
    const close = src.lastIndexOf("</x-dc>");
    if (close === -1 || close < openMatch.index) return null;
    const doc = new DOMParser().parseFromString(src, "text/html");
    const scriptEl = doc.querySelector("script[data-dc-script]");
    const { props, preview } = parseDataProps(scriptEl?.getAttribute("data-props") ?? null);
    return { template: src.slice(openMatch.index + openMatch[0].length, close), js: scriptEl ? scriptEl.textContent || "" : "", props, preview };
  }
  function parseDataProps(raw) {
    if (!raw) return { props: null, preview: null };
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return { props: null, preview: null }; }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { props: null, preview: null };
    const preview = parsed.$preview && typeof parsed.$preview === "object" ? parsed.$preview : null;
    const rest = {};
    for (const k of Object.keys(parsed)) if (k[0] !== "$") rest[k] = parsed[k];
    return { props: Object.keys(rest).length ? rest : null, preview };
  }
  function dcNameFromPath(pathname) {
    let p = pathname || "";
    try { p = decodeURIComponent(p); } catch {}
    const base = p.split("/").pop() || "Root";
    return base.replace(/\.dc\.html$/, "").replace(/\.html?$/, "") || "Root";
  }
  var BASE_CSS = `
    .sc-placeholder{background:color-mix(in srgb,currentColor 8%,transparent);border:1px solid color-mix(in srgb,currentColor 50%,transparent);border-radius:2px;box-sizing:border-box;overflow:hidden}
    .sc-placeholder-error{padding:4px 8px;font:11px/1.4 ui-monospace,monospace;color:color-mix(in srgb,currentColor 70%,transparent);word-break:break-word}
    .sc-interp.sc-missing{display:inline-block;width:2em;height:1em;overflow:hidden;vertical-align:text-bottom;background:rgba(255,255,255,.3);border:1px solid rgba(0,0,0,.5);border-radius:2px;box-sizing:border-box;color:transparent;user-select:none}
    .sc-host.sc-has-error{position:relative}
    .sc-logic-error{position:absolute;top:8px;left:8px;z-index:2147483647;max-width:60ch;padding:6px 10px;background:#b00020;color:#fff;font:12px/1.4 ui-monospace,monospace;border-radius:4px;white-space:pre-wrap;pointer-events:none}
  `;
  var FULL_PAGE_CSS = "html,body{height:100%;margin:0}#dc-root,#dc-root>.sc-host{height:100%}";
  function rootNameForDocument(doc, loc) {
    let bootPath = loc.pathname || "";
    if (!/\.dc\.html?$/i.test(bootPath)) { try { bootPath = new URL(doc.baseURI || "/").pathname; } catch {} }
    return dcNameFromPath(bootPath);
  }
  function boot(runtime, doc = document) {
    const parsed = parseDcDocument(doc);
    if (!parsed) return null;
    const React = getReact();
    const rootName = rootNameForDocument(doc, location);
    runtime.markFetched(rootName);
    runtime.setRootName(rootName);
    runtime.adoptParsed(rootName, parsed);
    const dc = doc.querySelector("x-dc");
    const hostEl = doc.createElement("div");
    hostEl.id = "dc-root";
    dc.replaceWith(hostEl);
    if (!parsed.preview) {
      const s = doc.createElement("style");
      s.textContent = FULL_PAGE_CSS;
      doc.head.appendChild(s);
    }
    const Root = runtime.getDC(rootName);
    const entry = runtime.registry.get(rootName);
    function StandaloneRoot() {
      const [, setTick] = React.useState(0);
      React.useEffect(() => {
        const sub = () => setTick((n) => n + 1);
        entry.subs.add(sub);
        return () => entry.subs.delete(sub);
      }, []);
      return h(Root, entry.propOverrides || {});
    }
    const ReactDOM = getReactDOM();
    if (ReactDOM.createRoot) ReactDOM.createRoot(hostEl).render(h(StandaloneRoot));
    else ReactDOM.render(h(StandaloneRoot), hostEl);
    return rootName;
  }
  var IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*/;
  var NUMBER_RE = /^-?\d+(\.\d+)?$/;
  function resolve(vals, src) {
    const expr = String(src).trim();
    if (!expr) return void 0;
    if (expr[0] === "!") return !resolve(vals, expr.slice(1));
    if (expr === "true") return true;
    if (expr === "false") return false;
    if (expr === "null") return null;
    if (expr === "undefined") return void 0;
    if (NUMBER_RE.test(expr)) return Number(expr);
    if (expr.length >= 2 && (expr[0] === '"' || expr[0] === "'") && expr[expr.length - 1] === expr[0]) return expr.slice(1, -1);
    return resolvePath(vals, expr);
  }
  function resolvePath(vals, expr) {
    const head = expr.match(IDENT_RE);
    if (!head) return void 0;
    let cur = vals == null ? void 0 : vals[head[0]];
    let i = head[0].length;
    while (i < expr.length) {
      if (expr[i] === ".") {
        const m = expr.slice(i + 1).match(IDENT_RE) || expr.slice(i + 1).match(/^\d+/);
        if (!m) return void 0;
        cur = cur == null ? void 0 : cur[m[0]];
        i += 1 + m[0].length;
      } else return void 0;
    }
    return cur;
  }
  function cssToObj(css) {
    const o = {};
    for (const decl of css.split(";")) {
      const i = decl.indexOf(":");
      if (i < 0) continue;
      const prop = decl.slice(0, i).trim();
      o[prop.startsWith("--") ? prop : prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = decl.slice(i + 1).trim();
    }
    return o;
  }
  function compileAttr(raw) {
    const whole = raw.match(/^\s*\{\{([\s\S]+?)\}\}\s*$/);
    if (whole) { const path = whole[1]; return (vals) => resolve(vals, path); }
    if (raw.includes("{{")) {
      const parts = raw.split(/\{\{([\s\S]+?)\}\}/g);
      return (vals) => parts.map((s, i) => i & 1 ? resolve(vals, s) ?? "" : s).join("");
    }
    return () => raw;
  }
  function collectProps(node) {
    const propGetters = [];
    for (const { name, value } of [...node.attributes]) {
      if (name === "data-dc-tpl") continue;
      let key = name;
      if (key === "class") key = "className";
      propGetters.push([key, compileAttr(value)]);
    }
    return propGetters;
  }
  function compileTemplate(html, host) {
    const tpl = document.createElement("template");
    tpl.innerHTML = html;
    const builders = walkChildren(tpl.content, host);
    return (vals, ctx) => builders.map((b, i) => b(vals || {}, ctx, i));
  }
  function walkChildren(node, host) { return [...node.childNodes].map((c) => walk(c, host)).filter((b) => b != null); }
  function walk(node, host) {
    if (node.nodeType === Node.TEXT_NODE) return walkText(node);
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const el = node;
    const tag = el.tagName.toLowerCase();
    if (tag === "sc-for") return walkFor(el, host);
    if (tag === "dc-import") return walkComponent(el, host);
    return walkElement(el, host);
  }
  function walkText(node) {
    const txt = node.nodeValue ?? "";
    if (!txt.includes("{{")) return () => txt;
    const parts = txt.split(/\{\{([\s\S]+?)\}\}/g);
    return (vals, ctx, key) => h(getReact().Fragment, { key }, ...parts.map((p, i) => {
      if (!(i & 1)) return p;
      const v = resolve(vals, p);
      if (v === void 0 || v === null) return null;
      return h("span", { key: i }, String(v));
    }));
  }
  function walkFor(el, host) {
    const listGet = compileAttr(el.getAttribute("list") || "");
    const asName = el.getAttribute("as") || "item";
    const kids = walkChildren(el, host);
    return (vals, ctx, key) => {
      let list = listGet(vals);
      if (!Array.isArray(list)) list = [];
      return h(getReact().Fragment, { key }, list.map((item, i) => {
        const sub = { ...vals, [asName]: item, $index: i };
        return h(getReact().Fragment, { key: i }, kids.map((b, j) => b(sub, ctx, j)));
      }));
    };
  }
  function walkComponent(el, host) {
    const name = el.getAttribute("name") || "";
    const propGetters = collectProps(el);
    return (vals, ctx, key) => {
      const props = { key };
      for (const [k, g] of propGetters) props[k] = g(vals);
      return h(host.component(name), props);
    };
  }
  function walkElement(el, host) {
    const propGetters = collectProps(el);
    const kids = walkChildren(el, host);
    return (vals, ctx, key) => {
      const props = { key };
      for (const [k, g] of propGetters) {
        let v = g(vals);
        if (k === "style" && typeof v === "string") v = cssToObj(v);
        props[k] = v;
      }
      return h(el.tagName.toLowerCase(), props, ...kids.map((b, j) => b(vals, ctx, j)));
    };
  }
  var StreamableLogic = class {
    constructor(props) { __publicField(this, "props"); __publicField(this, "state", {}); __publicField(this, "__host"); this.props = props || {}; }
    setState(update, cb) { this.__host && this.__host.__setLogicState(update, cb); }
    componentDidMount() {}
    renderVals() { return {}; }
  };
  function evalDcLogic(src) {
    const fn = new Function("DCLogic", "StreamableLogic", "React", src + '\n;return (typeof Component!=="undefined"&&Component)||undefined;');
    return fn(StreamableLogic, StreamableLogic, getReact());
  }
  function createComponentFactory(registry, ensureFetched) {
    const React = getReact();
    class StreamableComponent extends React.Component {
      constructor(props) {
        super(props);
        __publicField(this, "__name");
        __publicField(this, "__sub");
        __publicField(this, "logic");
        this.__name = props.__name;
        this.state = { __v: 0 };
        this.__sub = () => this.forceUpdate();
        this.logic = new (registry.get(this.__name).Logic || StreamableLogic)(this.__userProps());
        this.logic.__host = this;
        ensureFetched(this.__name);
      }
      __userProps() { const { __name, ...rest } = this.props; return rest; }
      __setLogicState(update, cb) {
        const prev = this.logic.state;
        this.logic.state = { ...prev, ...(typeof update === "function" ? update(prev) : update) };
        this.setState((s) => ({ __v: s.__v + 1 }), cb);
      }
      componentDidMount() { registry.get(this.__name).subs.add(this.__sub); this.logic.componentDidMount(); }
      componentWillUnmount() { registry.get(this.__name).subs.delete(this.__sub); }
      render() {
        const r = registry.get(this.__name);
        if (!r.tpl) return h("div", {});
        const userProps = this.__userProps();
        this.logic.props = userProps;
        const vals = { ...userProps, ...(this.logic.renderVals() || {}) };
        return h("div", { className: "sc-host" }, r.tpl(vals, this));
      }
    }
    const named = /* @__PURE__ */ new Map();
    function getDC(name) {
      const hit = named.get(name);
      if (hit) return hit;
      function Dispatcher(p) { ensureFetched(name); return h(StreamableComponent, { ...p, __name: name }); }
      named.set(name, Dispatcher);
      return Dispatcher;
    }
    return { getDC };
  }
  function createRegistry() {
    const entries = /* @__PURE__ */ Object.create(null);
    function get(name) { return entries[name] || (entries[name] = { html: "", tpl: null, Logic: null, subs: /* @__PURE__ */ new Set(), fetched: false }); }
    function bump(name) { const r = get(name); for (const fn of r.subs) fn(); }
    return { entries, get, bump };
  }
  function createRuntime(doc = document) {
    const registry = createRegistry();
    const factory = createComponentFactory(registry, ensureFetched);
    const host = { component: (name) => factory.getDC(name) };
    function ensureFetched(name) {
      const r = registry.get(name);
      if (r.fetched) return;
      r.fetched = true;
      const url = "./" + encodeURIComponent(name) + ".dc.html";
      fetch(url).then((res) => res.ok ? res.text() : "").then((t) => {
        if (!t) return;
        const parsed = parseDcText(t);
        if (!parsed) return;
        if (parsed.template) updateHtml(name, parsed.template);
        if (parsed.js) updateJs(name, parsed.js);
      }).catch(() => {});
    }
    let rootName = null;
    function updateHtml(name, html) {
      const r = registry.get(name);
      r.html = html;
      try { r.tpl = compileTemplate(html, host); } catch (e) { console.error(e); }
      registry.bump(name);
    }
    function updateJs(name, src) {
      const r = registry.get(name);
      try { const Cls = evalDcLogic(src); if (typeof Cls === "function") r.Logic = Cls; } catch (e) { console.error(e); }
      registry.bump(name);
    }
    function adoptParsed(name, parsed) {
      if (!parsed) return;
      if (parsed.template) updateHtml(name, parsed.template);
      if (parsed.js) updateJs(name, parsed.js);
    }
    return { registry, getDC: factory.getDC, adoptParsed, setRootName: (name) => { rootName = name; }, markFetched: (name) => { registry.get(name).fetched = true; } };
  }
  function hideRawTemplate() {
    const s = document.createElement("style");
    s.textContent = "x-dc{display:none!important}";
    document.head.appendChild(s);
  }
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.async = false;
      s.onload = () => res(); s.onerror = () => rej(new Error("failed to load " + src));
      document.head.appendChild(s);
    });
  }
  function loadReactUmd() {
    if (window.React && window.ReactDOM) return Promise.resolve();
    return Promise.all([
      loadScript("https://unpkg.com/react@18.3.1/umd/react.production.min.js"),
      loadScript("https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js"),
    ]).then(() => void 0);
  }
  function init() {
    const runtime = createRuntime(document);
    const baseCss = document.createElement("style");
    baseCss.textContent = BASE_CSS;
    document.head.prepend(baseCss);
    const api = { __dcBoot: () => { boot(runtime, document); } };
    Object.assign(window, api);
    if (document.readyState !== "loading") api.__dcBoot();
    else document.addEventListener("DOMContentLoaded", () => api.__dcBoot());
  }
  hideRawTemplate();
  loadReactUmd().then(init).catch((err) => console.error("[dc] failed to load React or boot:", err));
})();
