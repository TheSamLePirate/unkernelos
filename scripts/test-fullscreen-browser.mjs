/** Isolated real-browser checks against the Vite app. No production test hooks. */
import fs from "node:fs";
const base = process.env.FULLSCREEN_BASE_URL || "http://127.0.0.1:3081";
const port = Number(process.env.FULLSCREEN_CDP_PORT || 9334);
const out = ".cache/fullscreen-qa";
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
  await send("Emulation.setDeviceMetricsOverride", { width: 1512, height: 982, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: base + "/?app=notes" });
  for (let i = 0; i < 150; i++) {
    if (await evaluate("!!document.querySelector('[data-horizon-window]')")) break;
    await delay(200);
  }
  await evaluate(`(async () => {
    const {wmStore:wm}=await import('/src/wm/wm-store.ts');
    const {modStore:mods}=await import('/src/core/mod-store.ts');
    const id=wm.openApp('notes'), other=wm.openApp('explorer');
    wm.setHorizonLayout('split'); wm.focusWindow(id);
    window.fullscreenTest={wm,mods,id,other};
  })()`);
  await delay(600);
  await evaluate(`(() => {
    const t=window.fullscreenTest;
    t.node=document.querySelector('[data-horizon-window="'+t.id+'"]');
    t.body=t.node.querySelector('.horizon-windowbody');
    t.before=t.node.getBoundingClientRect().toJSON();
    t.session=t.wm.getSnapshot().windows.find(w=>w.id===t.id).sessionId;
    t.node.querySelector('[aria-label="Plein écran"]').click();
  })()`);
  await delay(650);
  const geometry = () => evaluate(`(() => {
    const t=window.fullscreenTest, n=document.querySelector('[data-horizon-window="'+t.id+'"]'), r=n.getBoundingClientRect();
    return {x:r.x,y:r.y,width:r.width,height:r.height,vw:innerWidth,vh:visualViewport.height,
      radius:getComputedStyle(n).borderRadius,top:document.elementFromPoint(20,20)?.closest('[data-horizon-window]')===n,
      bottom:document.elementFromPoint(20,innerHeight-2)?.closest('[data-horizon-window]')===n,
      same:n===t.node&&n.querySelector('.horizon-windowbody')===t.body};
  })()`);
  const assertFull = async (name) => {
    const g = await geometry();
    check(name, Math.abs(g.x)<.1 && Math.abs(g.y)<.1 && Math.abs(g.width-g.vw)<.1 && Math.abs(g.height-g.vh)<.1 && g.radius==="0px" && g.top && g.bottom && g.same);
  };
  await assertFull("Green control fills viewport and covers desktop chrome without remounting");
  await evaluate("fullscreenTest.wm.toggleHorizonDrawer(fullscreenTest.id)");
  await delay(400);
  await assertFull("Opening attached drawer does not shrink fullscreen window");
  check("Drawer is reachable inside fullscreen viewport", await evaluate(`(() => {
    const d=fullscreenTest.node.querySelector('[data-window-drawer]'),r=d.getBoundingClientRect();
    return r.left>=0&&r.right<=innerWidth+.1&&r.bottom<=innerHeight+.1&&getComputedStyle(d).visibility==='visible'&&d.contains(document.elementFromPoint(r.left+30,r.top+r.height*.6));
  })()`));
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await delay(650);
  await assertFull("Fullscreen follows phone viewport resizing");
  await send("Emulation.setDeviceMetricsOverride", { width: 1512, height: 982, deviceScaleFactor: 1, mobile: false });
  await delay(650);
  await evaluate("fullscreenTest.node.querySelector('[aria-label=\"Restaurer la fenêtre\"]').click(); fullscreenTest.wm.toggleHorizonDrawer(fullscreenTest.id)");
  await delay(650);
  check("Restore returns original split geometry and session", await evaluate(`(() => {
    const t=fullscreenTest,r=t.node.getBoundingClientRect(),w=t.wm.getSnapshot().windows.find(w=>w.id===t.id);
    return ['x','y','width','height'].every(k=>Math.abs(r[k]-t.before[k])<.1)&&w.sessionId===t.session&&!w.maximized;
  })()`));
  await evaluate(`fullscreenTest.node.querySelector('header').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
  await delay(650);
  await assertFull("Double-click title enters fullscreen");
  await evaluate("fullscreenTest.wm.setMissionControl(true)");
  await delay(650);
  check("Exposé reveals the other live windows", await evaluate("document.querySelector('[data-horizon-window=\"'+fullscreenTest.other+'\"]').getAttribute('aria-hidden')==='false' && fullscreenTest.node.getBoundingClientRect().width<innerWidth"));
  await evaluate("fullscreenTest.wm.setMissionControl(false)");
  await delay(650);
  await assertFull("Leaving Exposé returns to fullscreen");
  await evaluate("fullscreenTest.wm.minimizeWindow(fullscreenTest.id)");
  await delay(400);
  check("Minimize reveals desktop and other window", await evaluate("getComputedStyle(document.querySelector('main')).zIndex==='10' && document.querySelector('[data-horizon-window=\"'+fullscreenTest.other+'\"]').getAttribute('aria-hidden')==='false'"));
  await evaluate("fullscreenTest.wm.focusWindow(fullscreenTest.id)");
  await delay(650);
  await assertFull("Recall preserves fullscreen state");
  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(`${out}/fullscreen.png`, Buffer.from(shot.data,"base64"));
  // Legacy shells use the same state/API, with their own frame renderer.
  await evaluate(`(() => {
    const t=fullscreenTest;
    for(const w of [...t.wm.getSnapshot().windows])t.wm.closeWindow(w.id,false);
    t.wm.setHorizonEnabled(false); t.mods.setDesktop3d({enabled:false});
    t.id=t.wm.openApp('notes');t.wm.snapWindow(t.id,'maximize');
  })()`);
  await delay(650);
  const legacyFull = () => evaluate(`(() => {const n=document.querySelector('[data-window-surface="true"][data-maximized="true"]'),r=n?.getBoundingClientRect();return !fullscreenTest.wm.getSnapshot().horizonEnabled&&!!r&&Math.abs(r.x)<.1&&Math.abs(r.y)<.1&&Math.abs(r.width-innerWidth)<.1&&Math.abs(r.height-visualViewport.height)<.1&&n.contains(document.elementFromPoint(20,20));})()`);
  check("Classic shell fullscreen fills viewport", await legacyFull());
  await evaluate("fullscreenTest.mods.setDesktop3d({enabled:true})");
  await delay(3000);
  check("Classic spatial camera does not transform fullscreen", await legacyFull());
  fs.writeFileSync(`${out}/report.json`, JSON.stringify({ passed: results.length, results }, null, 2));
  console.log(JSON.stringify({ passed: results.length, results }, null, 2));
} finally {
  ws?.close();
  chrome.kill();
  await chrome.exited;
}
