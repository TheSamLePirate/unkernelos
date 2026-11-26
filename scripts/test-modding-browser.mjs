/** Desktop/theme/mod integration checks using an isolated Chromium and the real Vite app. */
import fs from "node:fs";
const base = process.env.MODDING_BASE_URL || "http://127.0.0.1:3081";
const port = Number(process.env.MODDING_CDP_PORT || 9335);
const out = ".cache/modding-qa";
fs.mkdirSync(out, { recursive: true });
const chrome = Bun.spawn([
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "--headless=new", `--remote-debugging-port=${port}`,
  `--user-data-dir=${process.cwd()}/${out}/profile`, "--no-first-run",
  "--no-default-browser-check", "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding", "about:blank",
], { stdout: "ignore", stderr: Bun.file(`${out}/chrome.log`) });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
let seq = 0;
const pending = new Map();
const results = [];
try {
  let page;
  for (let i = 0; i < 100; i++) {
    try {
      page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === "page");
      if (page) break;
    } catch {}
    await delay(100);
  }
  if (!page) throw new Error("Isolated Chrome did not start");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  ws.addEventListener("message", ({ data }) => {
    const m = JSON.parse(data), p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const check = (name, pass) => {
    if (!pass) throw new Error(name);
    results.push(name);
  };
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: "localStorage.removeItem('unkernelos:horizon:enabled:v1');localStorage.removeItem('unkernelos:mods:v2');localStorage.removeItem('unkernelos:horizon:appearance');",
  });
  await send("Emulation.setDeviceMetricsOverride", { width: 1512, height: 982, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: base + "/?app=notes" });
  for (let i = 0; i < 200; i++) {
    if (await evaluate("!!document.querySelector('[data-horizon-window] textarea') && !!window.unkernelOS")) break;
    await delay(200);
  }
  const checks = await evaluate(`(async () => {
    const moduleUrl=path=>performance.getEntriesByType('resource').filter(r=>new URL(r.name).pathname===path).findLast(r=>r.name.includes('?t='))?.name??path;
    const {wmStore:wm}=await import(moduleUrl('/src/wm/wm-store.ts'));
    const {modStore:mods,BUILTIN_VARIANTS}=await import(moduleUrl('/src/core/mod-store.ts'));
    const {reactiveEngine:reactive}=await import(moduleUrl('/src/core/reactive-mod-engine.ts'));
    const {surfaceRegistry:registry}=await import(moduleUrl('/src/core/app-surface-registry.tsx'));
    const {contextStore:contexts}=await import(moduleUrl('/src/core/context-store.ts'));
    const wait=ms=>new Promise(r=>setTimeout(r,ms)), out=[];
    const assert=(name,value)=>{if(!value)throw new Error(name);out.push(name)};
    assert('Horizon remains the fresh-profile default',wm.getSnapshot().horizonEnabled&&mods.getSnapshot().activeVariantId==='horizon');
    const id=wm.getSnapshot().windows.find(w=>w.appId==='notes').id;
    wm.focusWindow(id);await wait(500);
    const editor=document.querySelector('[data-horizon-window="'+id+'"] textarea');
    const session=wm.getSnapshot().windows.find(w=>w.id===id).sessionId;
    const host=editor.closest('[data-app-content]');
    const sample='Modding QA unsaved '+Date.now();
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(editor,sample);
    editor.dispatchEvent(new Event('input',{bubbles:true}));
    editor.focus();editor.setSelectionRange(2,12);await wait(100);
    const iframe=document.createElement('iframe');
    iframe.style.cssText='position:absolute;width:1px;height:1px;pointer-events:none';
    iframe.srcdoc='<script>window.sessionToken=Math.random();<\\/script><input value="initial">';
    host.appendChild(iframe);await new Promise(r=>iframe.onload=r);
    const token=iframe.contentWindow.sessionToken;
    iframe.contentDocument.querySelector('input').value='keep this iframe';
    for(const variant of BUILTIN_VARIANTS){
      mods.applyVariant(variant.id);await wait(400);
      const state=wm.getSnapshot();
      assert(variant.name+' activates its actual compositor',state.horizonEnabled===(variant.desktopMode==='horizon')&&!!document.querySelector(variant.desktopMode==='horizon'?'.horizon-topbar':'[data-window-surface][data-window-decorator="'+variant.decorator.style+'"]'));
      assert(variant.name+' preserves app, draft and iframe',editor.isConnected&&editor.closest('[data-app-content]')===host&&editor.value===sample&&wm.getSnapshot().windows.find(w=>w.id===id).sessionId===session&&iframe.contentWindow.sessionToken===token&&iframe.contentDocument.querySelector('input').value==='keep this iframe');
      assert(variant.name+' clears Horizon global styling when inactive',variant.desktopMode==='horizon'?document.documentElement.hasAttribute('data-horizon'):!document.documentElement.hasAttribute('data-horizon'));
    }
    mods.applyVariant('horizon');await wait(500);
    await window.unkernelOS.call('wm.desktop.set',{mode:'classic'});await wait(300);
    assert('Agent API switches desktop without closing apps',!wm.getSnapshot().horizonEnabled&&editor.isConnected&&iframe.contentWindow.sessionToken===token);
    await window.unkernelOS.call('wm.desktop.set',{mode:'horizon'});await wait(400);
    assert('Agent API restores Horizon',wm.getSnapshot().horizonEnabled&&editor.isConnected);
    assert('Text selection survives shell swaps',editor.selectionStart===2&&editor.selectionEnd===12);
    // Input events must still follow the live React app after portal relocation.
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(editor,sample+' after switch');
    editor.dispatchEvent(new Event('input',{bubbles:true}));await wait(100);
    assert('App events still reach the React session',registry.peek(id).state.dirty===true&&editor.value.endsWith('after switch'));
    editor.focus();editor.setSelectionRange(0,10);
    editor.dispatchEvent(new ClipboardEvent('copy',{bubbles:true}));await wait(150);
    assert('Copy remains attributed to the owning session',contexts.getSnapshot().entries.some(e=>e.source?.windowId===id&&e.text===editor.value.slice(0,10)));
    mods.setTheme({enabled:true,accentPrimary:'#12abcd',blurPx:8,glassOpacity:.6});await wait(300);
    const title=document.querySelector('[data-horizon-window="'+id+'"] .horizon-windowtitle'); const accent=document.querySelector('.horizon-layouts button[aria-pressed="true"]');
    assert('Custom accent reaches Horizon chrome',getComputedStyle(accent).color==='rgb(18, 171, 205)');
    const lowBlur=getComputedStyle(document.querySelector('.horizon-topbar')).backdropFilter; const lowOpacity=getComputedStyle(document.querySelector('[data-horizon-window="'+id+'"]')).backgroundColor;
    mods.setTheme({blurPx:42,glassOpacity:.9});await wait(200);
    assert('Shared blur control reaches Horizon',lowBlur!==getComputedStyle(document.querySelector('.horizon-topbar')).backdropFilter);
    assert('Shared opacity reaches Horizon',lowOpacity!==getComputedStyle(document.querySelector('[data-horizon-window="'+id+'"]')).backgroundColor);
    await window.unkernelOS.call('theme.set',{osTheme:'cyberpunk-neon'});await wait(300);
    assert('Agent theme.set overrides previous custom tokens',!mods.getSnapshot().theme.enabled&&getComputedStyle(accent).color==='rgb(244, 63, 94)');
    mods.toggleMod('mod-rgb-chroma-borders',true);await wait(200);
    assert('Existing CSS mods animate Horizon windows',getComputedStyle(document.querySelector('[data-horizon-window="'+id+'"]')).animationName.includes('unkernel-chroma-border'));
    mods.toggleMod('mod-rgb-chroma-borders',false);
    mods.setUserCss('.glass-dock { outline: 3px solid rgb(1, 222, 33); } [data-unkernel-titlebar] { letter-spacing: 2px; }');await wait(200);
    assert('Custom CSS uses shared dock and titlebar selectors',getComputedStyle(document.querySelector('.horizon-dock')).outlineWidth==='3px'&&getComputedStyle(title.parentElement).letterSpacing==='2px');
    mods.setUserCss('');
    for(const slot of ['topbar','dock','titlebar'])reactive.upsertSurface({id:'qa-'+slot,name:'QA '+slot,emoji:'',description:'QA',enabled:true,contentType:'html',slot,html:'<span data-qa-slot="'+slot+'">QA</span>'});
    reactive.setEngineEnabled(true);await wait(300);
    assert('Reactive topbar dock and titlebar slots are available in Horizon',['topbar','dock','titlebar'].every(s=>!!document.querySelector('[data-qa-slot="'+s+'"]')));
    mods.upsertWidget({id:'qa-widget',title:'QA custom widget',emoji:'',description:'QA',x:20,y:150,width:160,height:120,enabled:true,transparent:false,html:'<p>Live custom widget</p>'});await wait(300);
    assert('Custom desktop widgets are mounted in Horizon',!!document.querySelector('iframe[title="QA custom widget"]'));
    const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><path fill="teal" d="M0 0h4v4H0z"/></svg>');
    mods.setBackdropImage('custom',image);await wait(300);
    assert('Selected wallpaper replaces the Horizon landscape',!document.querySelector('.horizon-background')&&[...document.images].some(i=>i.src===image));
    await window.unkernelOS.call('theme.set',{wallpaperShader:'solar-ember'});await wait(600);
    assert('Stock wallpaper shader is available in Horizon',mods.getSnapshot().wallpaperMode==='system'&&!mods.getSnapshot().activeBackdropImageId&&!!document.querySelector('canvas.fixed.inset-0'));
    mods.setBackdropImage('custom',image);
    mods.setActiveShaderMod('shader-event-horizon');await wait(600);
    assert('Custom WGSL mod is selected in Horizon',wm.getSnapshot().horizonEnabled&&!mods.getSnapshot().activeBackdropImageId&&mods.getSnapshot().activeShaderModId==='shader-event-horizon'&&!mods.getSnapshot().shaderCompileError);
    mods.setWallpaperMode('horizon');await wait(300);
    assert('Original Horizon landscape can be restored',!!document.querySelector('.horizon-background'));
    // Settings itself must remain mounted when the user clicks its mode control.
    const settings=wm.openApp('settings');await wait(600);
    const settingsHost=document.querySelector('[data-app-content="'+settings+'"]');
    const mode=settingsHost.querySelector('[aria-label="Mode de bureau"]');
    assert('Settings exposes both desktops',!!mode);
    [...mode.querySelectorAll('button')].find(b=>b.textContent.includes('Bureau classique')).click();await wait(400);
    assert('Settings mode button preserves its own app',!wm.getSnapshot().horizonEnabled&&settingsHost.isConnected&&settingsHost.querySelector('[aria-label="Mode de bureau"]')===mode);
    [...mode.querySelectorAll('button')].find(b=>b.textContent.includes('Horizon')).click();await wait(400);
    assert('Settings can return to Horizon',wm.getSnapshot().horizonEnabled&&settingsHost.isConnected);
    await window.unkernelOS.call('theme.set',{osTheme:'cyberpunk-neon',wallpaperShader:'cyber-grid'});await wait(200);
    mods.saveCurrentAsVariant('qa-custom-base','QA custom base','QA');
    mods.applyVariant('unkernel-default');await wait(400);
    assert('Classic variant restores its own base theme after a theme change',document.documentElement.dataset.osTheme==='obsidian-aurora');
    mods.applyVariant('qa-custom-base');await wait(400);
    assert('Custom variant restores its saved base palette and desktop',document.documentElement.dataset.osTheme==='cyberpunk-neon'&&wm.getSnapshot().horizonEnabled);
    wm.focusWindow(id);mods.applyVariant('horizon');await wait(500);
    document.querySelector('[aria-label="Préférences du bureau"]').click();await wait(100);
    [...document.querySelectorAll('.horizon-preferences button')].find(b=>b.textContent.includes('Apparence claire')).click();await wait(300);
    const lightFrame=getComputedStyle(document.querySelector('[data-horizon-window="'+id+'"]'));
    assert('Light Horizon keeps its light surface with shared CSS hooks',lightFrame.backgroundColor.includes('237, 241, 237'));
    [...document.querySelectorAll('.horizon-preferences button')].find(b=>b.textContent.includes('Apparence sombre')).click();await wait(200);
    document.querySelector('[aria-label="Fermer les préférences"]').click();await wait(100);
    window.moddingTest={wm,mods,id,editor,iframe,token};
    return out;
  })()`);
  for (const name of checks) check(name, true);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(`${out}/horizon.png`, Buffer.from(shot.data,"base64"));
  fs.writeFileSync(`${out}/report.json`, JSON.stringify({ passed: results.length, results }, null, 2));
  console.log(JSON.stringify({ passed: results.length, results }, null, 2));
} finally {
  ws?.close();
  chrome.kill();
  await chrome.exited;
}
