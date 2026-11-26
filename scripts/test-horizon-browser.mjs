/** Real-app Chromium smoke. Start `bun run dev` and a separate headless Chrome with --remote-debugging-port=9333. No production debug hooks or dependencies. */
import fs from "node:fs";
const port = Number(process.env.HORIZON_CDP_PORT || 9333),
  base = process.env.HORIZON_BASE_URL || "http://localhost:3080";
const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target = pages.find((p) => p.type === "page" && p.url.startsWith(base));
if (!target)
  throw new Error(
    "Open the real app in the isolated Chromium test profile first.",
  );
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) =>
  ws.addEventListener("open", resolve, { once: true }),
);
let seq = 0;
const pending = new Map(),
  errors = [];
ws.addEventListener("message", (event) => {
  const m = JSON.parse(event.data);
  if (m.id) {
    const p = pending.get(m.id);
    if (p) {
      pending.delete(m.id);
      m.error
        ? p.reject(new Error(JSON.stringify(m.error)))
        : p.resolve(m.result);
    }
  }
  if (m.method === "Runtime.exceptionThrown")
    errors.push(
      m.params.exceptionDetails.exception?.description ??
        m.params.exceptionDetails.text,
    );
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (r.exceptionDetails)
    throw new Error(
      r.exceptionDetails.exception?.description ?? r.exceptionDetails.text,
    );
  return r.result.value;
};
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => {
  const r = await send("Page.captureScreenshot", { format: "png" });
  fs.mkdirSync(".cache/horizon-qa", { recursive: true });
  fs.writeFileSync(
    ".cache/horizon-qa/" + name + ".png",
    Buffer.from(r.data, "base64"),
  );
};
const results = [];
function assert(name, value) {
  if (!value) throw new Error(name);
  results.push(name);
  console.log("PASS", name);
}
try {
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1512,
    height: 982,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.enable");
  await send("Page.reload", { ignoreCache: true });
  for (let i = 0; i < 100; i++) {
    await delay(200);
    if (
      await evaluate(
        "!!document.querySelector('[data-horizon-window] textarea') && !!window.unkernelOS",
      )
    )
      break;
  }
  const core = await evaluate(`(async()=>{
  const moduleUrl=path=>{const resources=performance.getEntriesByType('resource').filter(r=>new URL(r.name).pathname===path);return resources.find(r=>r.name.includes('?t='))?.name??path};
  const {wmStore:wm}=await import(moduleUrl('/src/wm/wm-store.ts'));const {surfaceRegistry:registry}=await import(moduleUrl('/src/core/app-surface-registry.tsx'));const {contextStore:contexts}=await import(moduleUrl('/src/core/context-store.ts'));
  window.horizonTest={wm,registry,contexts};const wait=ms=>new Promise(r=>setTimeout(r,ms));const out=[];const assert=(n,x)=>{if(!x)throw new Error(n);out.push(n)};
  assert('Horizon est le shell principal',wm.getSnapshot().horizonEnabled&&!!document.querySelector('.horizon-topbar'));
  const note=wm.openApp('notes'),terminal=wm.openApp('terminal'),explorer=wm.openApp('explorer'),shader=wm.openApp('shader-synth');window.horizonTest.ids={note,terminal,explorer,shader};wm.focusWindow(note);await wait(700);
  const selector='[data-horizon-window="'+note+'"]';const node=document.querySelector(selector),editor=node.querySelector('textarea');assert('Notes réelle chargée depuis Linux',!!editor&&editor.value.includes('unkernelOS'));
  editor.focus();editor.setSelectionRange(8,36);const value=editor.value,start=editor.selectionStart,end=editor.selectionEnd;wm.placeHorizonWindow(note,'left');wm.focusWindow(note);await wait(500);
  assert('Session et DOM conservés centre/aile',node===document.querySelector(selector)&&editor===node.querySelector('textarea')&&editor.value===value);
  assert('Sélection de texte conservée',editor.selectionStart===start&&editor.selectionEnd===end);
  wm.setHorizonLayout('split');await wait(350);assert('Deux vraies fenêtres partagent le centre',wm.getSnapshot().windows.filter(w=>w.workspace===1&&!w.minimized&&w.placement==='center').length===2);wm.setHorizonLayout('focus');wm.focusWindow(note);
  await contexts.initialize();const win=wm.getSnapshot().windows.find(w=>w.id===note);contexts.add({contextId:win.contextId,kind:'text',text:'Horizon smoke '+Date.now(),source:{windowId:note,appId:'notes',title:'Notes QA',confidence:'explicit'}});await contexts.flush();
  const stored=await new Promise((resolve,reject)=>{const req=indexedDB.open('unkernelos-horizon');req.onsuccess=()=>{const db=req.result,read=db.transaction('state').objectStore('state').get('v1');read.onsuccess=()=>{resolve(read.result);db.close()};read.onerror=()=>reject(read.error)}});assert('Tiroir écrit dans IndexedDB',stored.entries.some(e=>e.contextId===win.contextId&&e.text.startsWith('Horizon smoke')));
  const other=wm.getSnapshot().windows.find(w=>w.id===explorer);contexts.add({contextId:other.contextId,kind:'text',text:'Explorateur seulement',source:{windowId:explorer,appId:'explorer',title:'Explorer QA',confidence:'explicit'}});assert('Deux tiroirs indépendants',win.contextId!==other.contextId);
  wm.setHorizonDrawer(terminal);await wait(100);assert('Ouvrir un tiroir latéral ne rappelle pas la fenêtre',wm.getSnapshot().windows.find(w=>w.id===terminal).placement!=='center'&&!!document.querySelector('[aria-label="Tiroir contextuel"]'));wm.setHorizonDrawer(null);
  await wait(300);const a=registry.peek(shader);assert('Shader réel intégré au registre',!!a?.actions?.pause);const shaderWin=wm.getSnapshot().windows.find(w=>w.id===shader);const grant=registry.grant({windowId:shader,contextId:shaderWin.contextId,itemIds:[],actions:['pause','resume'],readState:true});
  let denied=false;try{registry.read(note,grant.id)}catch{denied=true}assert('Grant refuse une autre session',denied);
  denied=false;try{await registry.act({windowId:shader,grantId:grant.id,action:'pause',expectedRevision:'stale',requestId:'stale-'+Date.now(),args:{}})}catch{denied=true}assert('Révision périmée refusée',denied);
  const request={windowId:shader,grantId:grant.id,action:'pause',expectedRevision:a.revision,requestId:'pause-'+Date.now(),args:{}};await registry.act(request);await wait(150);assert('Action agent met le vrai shader en pause',registry.peek(shader).state.paused===true);await registry.act(request);assert('Rejeu idempotent après changement de révision',registry.peek(shader).state.paused===true);
  await registry.act({...request,action:'resume',expectedRevision:registry.peek(shader).revision,requestId:'resume-'+Date.now()});await wait(100);assert('Reprise du vrai shader',registry.peek(shader).state.paused===false);registry.revoke(grant.id);denied=false;try{registry.read(shader,grant.id)}catch{denied=true}assert('Révocation effective',denied);
  const space=contexts.saveSpace('Horizon QA',wm.getSnapshot().windows,wm.getSnapshot().horizonLayout);wm.placeHorizonWindow(note,'right');wm.restoreHorizonWindows(space.windows);assert('Disposition mémorisée puis restaurée',wm.getSnapshot().windows.find(w=>w.id===note).placement===space.windows.find(w=>w.id===note).placement);
  wm.focusWindow(note);wm.placeHorizonWindow(terminal,'left');wm.placeHorizonWindow(shader,'right');wm.placeHorizonWindow(explorer,'left');await wait(400);

  const {screenToElement}=await import(moduleUrl('/src/core/spatial-pointer.ts'));
  const terminalRoot=document.querySelector('[data-horizon-window="'+terminal+'"]'),canvas=terminalRoot.querySelector('canvas');
  const probe=document.createElement('i');Object.assign(probe.style,{position:'absolute',left:'125px',top:'80px',width:'0',height:'0',pointerEvents:'none'});canvas.parentElement.append(probe);const point=probe.getBoundingClientRect(),local=screenToElement(canvas,point.left,point.top);probe.remove();assert('Pointeur projeté exact sur le vrai terminal',Math.abs(local.x-125)<.25&&Math.abs(local.y-80)<.25);
  const runtime=await import(moduleUrl('/src/core/runtime.ts'));const effectUrl=performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname.endsWith('/effect.js'))?.name;const {Effect}=await import(effectUrl);const fsAction=f=>runtime.appRuntime.runPromise(Effect.flatMap(runtime.GuestFsService,f));
  await fsAction(fs=>fs.writeFileText('/home/user/notes/horizon-qa-two.md','# Deuxième document Horizon\\n\\nCette session a son propre tiroir.'));
  const second=wm.openApp('notes',{documentPath:'/home/user/notes/horizon-qa-two.md'},true);await wait(600);
  const secondWin=wm.getSnapshot().windows.find(w=>w.id===second);assert('Deux documents de Notes gardent des sessions distinctes',secondWin.contextId!==win.contextId&&document.querySelector('[data-horizon-window="'+second+'"] textarea').value.includes('Deuxième document'));
  const durable=contexts.add({contextId:win.contextId,kind:'text',text:'Extrait durable de welcome',source:{windowId:note,appId:'notes',title:'welcome.md',document:'/home/user/notes/welcome.md',confidence:'explicit'}});
  const file=contexts.add({contextId:secondWin.contextId,kind:'file',text:'qa.txt',name:'qa.txt',blob:new Blob(['Horizon blob persisted']),source:{windowId:second,appId:'notes',title:'Deuxième note',confidence:'explicit'}});await contexts.flush();
  const {ContextStore}=await import(moduleUrl('/src/core/context-store.ts'));const fresh=new ContextStore();await fresh.initialize();assert('Fichier du tiroir restauré depuis le stockage séparé',await fresh.getSnapshot().entries.find(e=>e.id===file.id).blob.text()==='Horizon blob persisted');
  wm.closeWindow(note);const reopened=wm.openApp('notes',{documentPath:'/home/user/notes/welcome.md'},true);await wait(650);const reopenedWin=wm.getSnapshot().windows.find(w=>w.id===reopened);assert('Réouverture du document retrouve son tiroir',reopenedWin.contextId===durable.contextId);window.horizonTest.ids.note=reopened;wm.closeWindow(second);
  wm.setHorizonDrawer(reopened);await wait(100);const data=new DataTransfer();data.setData('application/x-unkernel-file',JSON.stringify({path:'/home/user/notes/horizon-qa-two.md',name:'horizon-qa-two.md',windowId:explorer}));document.querySelector('[aria-label="Tiroir contextuel"]').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:data}));assert('Dépôt d’un fichier Linux dans le tiroir',contexts.getSnapshot().entries.some(e=>e.contextId===reopenedWin.contextId&&e.guestPath==='/home/user/notes/horizon-qa-two.md'));wm.setHorizonDrawer(null);
  await fsAction(fs=>fs.mkdir('/home/user/horizon-qa-target'));wm.openApp('explorer',{directory:'/home/user/horizon-qa-target'});await wait(500);const drop=new DataTransfer();drop.setData('application/x-unkernel-file',JSON.stringify({path:'/home/user/notes/horizon-qa-two.md',name:'horizon-qa-two.md',isDir:false,windowId:reopened}));document.querySelector('[data-horizon-window="'+explorer+'"] .horizon-windowbody>div').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:drop}));await wait(500);const copied=await fsAction(fs=>fs.readFileText('/home/user/horizon-qa-target/horizon-qa-two.md'));assert('Dépôt Explorer copie réellement le fichier dans Linux',copied.includes('Deuxième document'));
  const ide=wm.openApp('ide',{documentPath:'/home/user/notes/horizon-qa-two.md'});await wait(650);assert('Le terminal embarqué ne remplace pas les capacités de l’éditeur',!!registry.peek(ide)?.actions?.save&&registry.peek(ide).document==='/home/user/notes/horizon-qa-two.md');wm.closeWindow(ide);
  const agent=wm.openApp('agent-studio',{horizonContext:'HORIZON_EXPLICIT_CONTEXT_QA'});await wait(700);assert('Contexte préparé reçu par Agent Studio même au chargement initial',[...document.querySelectorAll('[data-horizon-window="'+agent+'"] textarea')].some(t=>t.value.split('HORIZON_EXPLICIT_CONTEXT_QA').length===2));wm.closeWindow(agent);wm.focusWindow(reopened);wm.placeHorizonWindow(shader,'right');wm.placeHorizonWindow(explorer,'left');
  return out;
 })()`);
  for (const name of core) assert(name, true);
  await delay(650);
  await shot("desktop");
  const rect = await evaluate(
    `(()=>{const n=document.querySelector('[data-horizon-window="'+window.horizonTest.ids.note+'"] .horizon-windowbar');const r=n.getBoundingClientRect();return {x:r.left+r.width*.5,y:r.top+21}})()`,
  );
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: rect.x,
    y: rect.y,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: rect.x,
    y: rect.y,
    button: "left",
    clickCount: 1,
  });
  for (let i = 1; i <= 10; i++) {
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: rect.x + ((85 - rect.x) * i) / 10,
      y: rect.y + 50,
      buttons: 1,
    });
    await delay(12);
  }
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: 85,
    y: rect.y + 50,
    button: "left",
    clickCount: 1,
  });
  await delay(120);
  assert(
    "Échap annule le drag réel sans dépôt",
    await evaluate(
      `window.horizonTest.wm.getSnapshot().windows.find(w=>w.id===window.horizonTest.ids.note).placement==='center'`,
    ),
  );
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: rect.x,
    y: rect.y,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: rect.x,
    y: rect.y,
    button: "left",
    clickCount: 1,
  });
  for (let i = 1; i <= 10; i++)
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: rect.x + ((85 - rect.x) * i) / 10,
      y: rect.y + 50,
      buttons: 1,
    });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: 85,
    y: rect.y + 50,
    button: "left",
    clickCount: 1,
  });
  await delay(120);
  assert(
    "Drag réel dépose la fenêtre dans l’aile",
    await evaluate(
      `window.horizonTest.wm.getSnapshot().windows.find(w=>w.id===window.horizonTest.ids.note).placement==='left'`,
    ),
  );
  await evaluate(
    `window.horizonTest.wm.focusWindow(window.horizonTest.ids.note)`,
  );
  await delay(550);
  const resize = await evaluate(
    `(()=>{const r=document.querySelector('[data-horizon-window="'+window.horizonTest.ids.note+'"] .horizon-resize-se').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,before:document.querySelector('[data-horizon-window="'+window.horizonTest.ids.note+'"]').offsetWidth}})()`,
  );
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: resize.x,
    y: resize.y,
    button: "left",
    clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: resize.x - 90,
    y: resize.y - 45,
    buttons: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: resize.x - 90,
    y: resize.y - 45,
    button: "left",
    clickCount: 1,
  });
  await delay(350);
  assert(
    "Poignée réelle redimensionne la fenêtre",
    await evaluate(
      `document.querySelector('[data-horizon-window="'+window.horizonTest.ids.note+'"]').offsetWidth<${resize.before}`,
    ),
  );
  await evaluate(`window.horizonTest.wm.setMissionControl(true)`);
  await delay(500);
  await shot("expose");
  assert(
    "Exposé expose les vraies sessions et une liste accessible",
    await evaluate(
      `!!document.querySelector('[aria-label="Exposé des sessions"]')&&document.querySelectorAll('[data-session-choice]').length>=4`,
    ),
  );
  await evaluate(
    `window.horizonTest.wm.setMissionControl(false);window.horizonTest.wm.setHorizonDrawer(window.horizonTest.ids.note)`,
  );
  await delay(200);
  await shot("context");
  await evaluate(`window.horizonTest.wm.setHorizonDrawer(null)`);
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(500);
  await shot("mobile");
  assert(
    "Shell mobile sans débordement horizontal",
    await evaluate(
      `document.documentElement.scrollWidth===innerWidth&&document.querySelector('.horizon-dock').getBoundingClientRect().right<=innerWidth+1`,
    ),
  );
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1512,
    height: 982,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await delay(400);
  const perf = await evaluate(
    `new Promise(resolve=>{const samples=[];let last=performance.now();function frame(t){samples.push(t-last);last=t;if(samples.length<120)requestAnimationFrame(frame);else{samples.shift();samples.sort((a,b)=>a-b);resolve({median:samples[Math.floor(samples.length*.5)],p95:samples[Math.floor(samples.length*.95)],samples:samples.length,viewport:innerWidth+'×'+innerHeight,gpu:!!navigator.gpu,windows:window.horizonTest.wm.getSnapshot().windows.length})}}requestAnimationFrame(frame)})`,
  );
  console.log("FRAME TIMING", JSON.stringify(perf));
  assert(
    "Aucune exception JavaScript pendant les parcours",
    errors.length === 0,
  );
  fs.mkdirSync(".cache/horizon-qa", { recursive: true });
  fs.writeFileSync(
    ".cache/horizon-qa/report.json",
    JSON.stringify(
      {
        passed: results.length,
        results,
        perf,
        errors,
        at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log("DONE", results.length, "scenarios");
} catch (e) {
  console.error(e);
  await shot("failure");
  console.error("Runtime errors", errors);
  process.exitCode = 1;
} finally {
  ws.close();
}
