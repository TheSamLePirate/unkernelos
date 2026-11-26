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
    // CDP does not infer held buttons for every event. Preserve the real mouse
    // state so Chromium does not implicitly drop pointer capture between moves.
    if (method === "Input.dispatchMouseEvent") {
      params = { ...params };
      if (params.type === "mousePressed")
        params.buttons ??= params.button === "right" ? 2 : 1;
      if (params.type === "mouseReleased") params.buttons ??= 0;
      if (params.type === "mouseMoved" && params.buttons === 1)
        params.button ??= "left";
    }
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
  await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Network.clearBrowserCache");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1512,
    height: 982,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.enable");
  await send("Page.navigate", { url: "about:blank" });
  await delay(100);
  errors.length = 0;
  await send("Page.navigate", { url: base + "/?app=notes" });
  for (let i = 0; i < 100; i++) {
    await delay(200);
    if (
      await evaluate(
        "!!document.querySelector('[data-horizon-window] .horizon-windowbody textarea') && !!window.unkernelOS",
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
  wm.setHorizonDrawer(terminal);await wait(100);assert('Ouvrir un tiroir latéral ne rappelle pas la fenêtre',wm.getSnapshot().windows.find(w=>w.id===terminal).placement!=='center'&&!!document.querySelector('[aria-label="Tiroir contextuel"][data-open="true"]'));wm.setHorizonDrawer(null);
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
  wm.setHorizonDrawer(reopened);await wait(100);const data=new DataTransfer();data.setData('application/x-unkernel-file',JSON.stringify({path:'/home/user/notes/horizon-qa-two.md',name:'horizon-qa-two.md',windowId:explorer}));document.querySelector('[aria-label="Tiroir contextuel"][data-open="true"]').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:data}));assert('Dépôt d’un fichier Linux dans le tiroir',contexts.getSnapshot().entries.some(e=>e.contextId===reopenedWin.contextId&&e.guestPath==='/home/user/notes/horizon-qa-two.md'));wm.setHorizonDrawer(null);
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
  const spatialChecks = await evaluate(`(async()=>{
    const {wm,registry,ids}=window.horizonTest; const wait=ms=>new Promise(r=>setTimeout(r,ms));const out=[];const check=(name,value)=>{if(!value)throw new Error(name);out.push(name)};
    const frame=id=>document.querySelector('[data-horizon-window="'+id+'"]');
    const appEditor=frame(ids.note).querySelector('.horizon-windowbody textarea'); window.horizonTest.originalEditor=appEditor;
    wm.setHorizonDrawer(ids.note);await wait(550);
    let drawer=frame(ids.note).querySelector('[data-window-drawer]');
    check('Le tiroir appartient au plan DOM de sa propre fenêtre',drawer.parentElement===frame(ids.note)&&drawer.dataset.open==='true'&&!document.querySelector('.horizon-panel-dismiss'));
    const editorSetter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
    const draft=drawer.querySelector('.horizon-add-note textarea'); editorSetter.call(draft,'Brouillon local du tiroir'); draft.dispatchEvent(new Event('input',{bubbles:true}));
    wm.setHorizonDrawer(ids.terminal);await wait(550);
    check('Deux tiroirs peuvent rester ouverts simultanément',frame(ids.note).querySelector('[data-window-drawer]').dataset.open==='true'&&frame(ids.terminal).querySelector('[data-window-drawer]').dataset.open==='true');
    wm.toggleHorizonDrawer(ids.note);await wait(280);wm.toggleHorizonDrawer(ids.note);await wait(550);
    check('Le toggle conserve le brouillon de chaque tiroir',frame(ids.note).querySelector('.horizon-add-note textarea').value==='Brouillon local du tiroir');
    check('Le tiroir ne remonte pas l’application',appEditor===frame(ids.note).querySelector('.horizon-windowbody textarea'));
    const r=frame(ids.note).querySelector('[data-window-drawer]').getBoundingClientRect();check('Le tiroir projeté reste lisible et dans le viewport',r.right<=innerWidth+1&&r.left>=0&&r.width>230);
    wm.setHorizonDrawer(null);wm.placeHorizonWindow(ids.terminal,'left',undefined,{depth:.38,y:.05,anchor:.5});wm.placeHorizonWindow(ids.explorer,'left',undefined,{depth:.82,y:.85,anchor:.5});
    wm.placeHorizonWindow(ids.shader,'right',undefined,{depth:1,y:.5,anchor:.5});wm.focusWindow(ids.note);await wait(600);
    check('Deux positions latérales gardent deux profondeurs distinctes',frame(ids.terminal).getBoundingClientRect().width>frame(ids.explorer).getBoundingClientRect().width*2);
    const tile=frame(ids.shader).querySelector('[data-dock-window]');check('L’extrémité produit un élément de dock interactif',!!tile&&tile.getBoundingClientRect().width>=60&&frame(ids.shader).dataset.docked==='true');
    const before=registry.peek(ids.shader).state.paused;tile.querySelector('.horizon-dock-primary').click();await wait(100);
    check('Le bouton du dock pilote le vrai shader sans rappeler sa fenêtre',registry.peek(ids.shader).state.paused!==before&&wm.getSnapshot().windows.find(w=>w.id===ids.shader).placement==='right'&&wm.getSnapshot().activeWindowId===ids.note);
    frame(ids.shader).querySelector('.horizon-dock-primary').click();await wait(100);
    check('Le dock actualise son icône et sa commande après une action',registry.peek(ids.shader).state.paused===before&&frame(ids.shader).querySelector('.horizon-dock-primary').getAttribute('aria-label')===registry.peek(ids.shader).dock.label);
    return out;
  })()`);
  for (const name of spatialChecks) assert(name, true);
  await delay(500);
  await shot("depth-docks");
  const shaderDock = await evaluate(
    `(()=>{const r=document.querySelector('[data-horizon-window="'+window.horizonTest.ids.shader+'"] .horizon-dock-primary').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,paused:window.horizonTest.registry.peek(window.horizonTest.ids.shader).state.paused}})()`,
  );
  for (const type of ["mousePressed", "mouseReleased"])
    await send("Input.dispatchMouseEvent", {
      type,
      x: shaderDock.x,
      y: shaderDock.y,
      button: "left",
      clickCount: 1,
    });
  await delay(120);
  assert(
    "Un vrai clic sur la commande de dock préserve la fenêtre active",
    await evaluate(
      `window.horizonTest.registry.peek(window.horizonTest.ids.shader).state.paused!==${shaderDock.paused}&&window.horizonTest.wm.getSnapshot().activeWindowId===window.horizonTest.ids.note`,
    ),
  );
  for (const type of ["mousePressed", "mouseReleased"])
    await send("Input.dispatchMouseEvent", {
      type,
      x: shaderDock.x,
      y: shaderDock.y,
      button: "left",
      clickCount: 1,
    });
  await delay(100);
  // Real pointer docking, followed by dragging the same live session back from its dock icon.
  await evaluate(
    `window.horizonTest.wm.focusWindow(window.horizonTest.ids.note)`,
  );
  await delay(500);
  const titlePoint = await evaluate(
    `(()=>{const r=document.querySelector('[data-horizon-window="'+window.horizonTest.ids.note+'"] .horizon-windowbar').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+21}})()`,
  );
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: titlePoint.x,
    y: titlePoint.y,
    button: "left",
    clickCount: 1,
  });
  for (let i = 1; i <= 16; i++) {
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: titlePoint.x + ((24 - titlePoint.x) * i) / 16,
      y: 390,
      buttons: 1,
    });
    await delay(12);
  }
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: 24,
    y: 390,
    button: "left",
    clickCount: 1,
  });
  await delay(550);
  assert(
    "Le drag réel à l’extrémité docke la même session",
    await evaluate(
      `document.querySelector('[data-horizon-window="'+window.horizonTest.ids.note+'"]').dataset.docked==='true'&&document.querySelector('[data-horizon-window="'+window.horizonTest.ids.note+'"] .horizon-windowbody textarea')===window.horizonTest.originalEditor`,
    ),
  );
  const tilePoint = await evaluate(
    `(()=>{const r=document.querySelector('[data-horizon-window="'+window.horizonTest.ids.note+'"] .horizon-dock-primary').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`,
  );
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: tilePoint.x,
    y: tilePoint.y,
    button: "left",
    clickCount: 1,
  });
  for (let i = 1; i <= 16; i++) {
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: tilePoint.x + ((756 - tilePoint.x) * i) / 16,
      y: 320,
      buttons: 1,
    });
    await delay(12);
  }
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: 756,
    y: 320,
    button: "left",
    clickCount: 1,
  });
  await delay(550);
  assert(
    "Le drag depuis l’icône rappelle la session sans remonter son DOM",
    await evaluate(
      `window.horizonTest.wm.getSnapshot().windows.find(w=>w.id===window.horizonTest.ids.note).placement==='center'&&document.querySelector('[data-horizon-window="'+window.horizonTest.ids.note+'"] .horizon-windowbody textarea')===window.horizonTest.originalEditor`,
    ),
  );
  await evaluate(
    `window.horizonTest.wm.placeHorizonWindow(window.horizonTest.ids.note,'left',undefined,{depth:1,y:.5,anchor:.5})`,
  );
  await delay(550);
  await evaluate(
    `document.querySelector('[data-horizon-window="'+window.horizonTest.ids.note+'"] .horizon-dock-primary').focus({preventScroll:true})`,
  );
  for (const type of ["keyDown", "keyUp"])
    await send("Input.dispatchKeyEvent", {
      type,
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      text: type === "keyDown" ? "\r" : undefined,
    });
  await delay(550);
  assert(
    "Le rappel au clavier reste disponible après un drag de dock",
    await evaluate(
      `window.horizonTest.wm.getSnapshot().windows.find(w=>w.id===window.horizonTest.ids.note).placement==='center'`,
    ),
  );
  await evaluate(
    `window.horizonTest.wm.setHorizonDrawer(window.horizonTest.ids.note)`,
  );
  await delay(550);
  await shot("attached-drawer");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(550);
  assert(
    "Le tiroir mobile reste attaché et accessible",
    await evaluate(
      `(()=>{const d=document.querySelector('[data-horizon-window="'+window.horizonTest.ids.note+'"] [data-window-drawer]');const r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.height>300&&d.dataset.open==='true'&&document.documentElement.scrollWidth===innerWidth})()`,
    ),
  );
  await shot("mobile-drawer");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1512,
    height: 982,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evaluate(`window.horizonTest.wm.setHorizonDrawer(null)`);
  await delay(500);
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
