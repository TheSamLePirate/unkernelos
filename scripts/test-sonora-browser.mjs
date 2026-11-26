/** Real-app Chromium smoke. Start `bun run dev` and a separate headless Chrome with --remote-debugging-port=9333. No production debug hooks or dependencies. */
import fs from "node:fs";
const port = Number(process.env.HORIZON_CDP_PORT || 9333),
  base = process.env.HORIZON_BASE_URL || "http://localhost:3080";
const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target = pages.find(
  (p) =>
    p.type === "page" && (p.url.startsWith(base) || p.url === "about:blank"),
);
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
  fs.mkdirSync(".cache/sonora-qa", { recursive: true });
  fs.writeFileSync(
    ".cache/sonora-qa/" + name + ".png",
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
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1512,
    height: 982,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: "about:blank" });
  await delay(100);
  errors.length = 0;
  await send("Page.navigate", { url: base + "/?app=music" });
  for (let i = 0; i < 150; i++) {
    await delay(200);
    if (
      await evaluate(
        '!!document.querySelector("[data-music-player]")&&!!window.unkernelOS',
      )
    )
      break;
  }
  const ready = await evaluate(`(async()=>{
  const moduleUrl=path=>{const r=performance.getEntriesByType('resource').filter(r=>new URL(r.name).pathname===path);return r.find(r=>r.name.includes('?t='))?.name??path};
  const {wmStore:wm}=await import(moduleUrl('/src/wm/wm-store.ts'));const {surfaceRegistry:registry}=await import(moduleUrl('/src/core/app-surface-registry.tsx'));const {contextStore:contexts}=await import(moduleUrl('/src/core/context-store.ts'));const {executeOsAction:call}=await import(moduleUrl('/src/core/agent-os-api.ts'));
  const id=wm.getSnapshot().windows.find(w=>w.appId==='music').id;window.sonoraTest={wm,registry,contexts,call,id,audio:document.querySelector('[data-sonora-audio]')};
  const read=()=>call('horizon.session.read',{windowId:id},{source:'mcp'});window.sonoraTest.read=read;
  window.sonoraTest.act=async(action,args={})=>{const state=await read();return call('horizon.session.action',{windowId:id,action,args,expectedRevision:state.revision,requestId:crypto.randomUUID()},{source:'mcp'})};
  const state=await read();return {shared:registry.list().find(w=>w.windowId===id).shared,actions:registry.list().find(w=>w.windowId===id).actions.length,state:!!state.state};
 })()`);
  assert(
    "Sonora publie son contexte et ses actions par défaut",
    ready.shared && ready.actions >= 14 && ready.state,
  );
  // Run only in the isolated Sonora QA profile: reset this test library between runs.
  await evaluate(
    `(async()=>{for(let i=0;i<100;i++){if((await window.sonoraTest.read()).state.ready)break;await new Promise(r=>setTimeout(r,50))}await window.sonoraTest.act('clear')})()`,
  );
  for (const [file, name] of [
    ["signal-one.mp3", "Signal One.mp3"],
    ["signal-two.mp3", "Signal Two.mp3"],
  ]) {
    const data = fs.readFileSync(".cache/sonora-qa/" + file).toString("base64");
    await evaluate(
      `(()=>{const bytes=Uint8Array.from(atob(${JSON.stringify(data)}),c=>c.charCodeAt(0));const dt=new DataTransfer();dt.items.add(new File([bytes],${JSON.stringify(name)},{type:'audio/mpeg'}));document.querySelector('[data-music-player]').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:dt}))})()`,
    );
    for (let i = 0; i < 70; i++) {
      await delay(100);
      if (
        await evaluate(
          `document.querySelectorAll('.sonora-track').length>=${file === "signal-one.mp3" ? 1 : 2}`,
        )
      )
        break;
    }
  }
  assert(
    "Les vrais MP3 sont importés et leurs tags ID3 sont lus",
    await evaluate(
      `document.querySelectorAll('.sonora-track').length===2&&document.querySelector('.sonora-track-info h1').textContent==='Signal Study No. 1'`,
    ),
  );
  const click = async (selector) => {
    const r = await evaluate(
      `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`,
    );
    for (const type of ["mousePressed", "mouseReleased"])
      await send("Input.dispatchMouseEvent", {
        type,
        ...r,
        button: "left",
        clickCount: 1,
      });
  };
  await click(".sonora-play");
  await delay(1000);
  assert(
    "Lecture MP3 réelle : le temps audio avance",
    await evaluate(
      "!window.sonoraTest.audio.paused&&window.sonoraTest.audio.currentTime>.4",
    ),
  );
  await evaluate(
    `for(const t of window.sonoraTest.wm.getSnapshot().toasts)window.sonoraTest.wm.dismissToast(t.id)`,
  );
  await shot("player");
  await evaluate(
    `window.sonoraTest.wm.placeHorizonWindow(window.sonoraTest.id,'left',undefined,{depth:1,y:.5,anchor:.5})`,
  );
  await delay(500);
  assert(
    "Dock gauche : le même élément audio continue de jouer",
    await evaluate(
      `document.querySelector('[data-sonora-audio]')===window.sonoraTest.audio&&!window.sonoraTest.audio.paused&&document.querySelector('[data-dock-window="'+window.sonoraTest.id+'"] [aria-label="Mettre la musique en pause"]')!==null`,
    ),
  );
  await click("[data-dock-window] .horizon-dock-primary");
  await delay(100);
  assert(
    "Le clic sur le dock met réellement en pause",
    await evaluate("window.sonoraTest.audio.paused"),
  );
  await click("[data-dock-window] .horizon-dock-primary");
  await delay(200);
  assert(
    "Le dock relance réellement le même audio",
    await evaluate("!window.sonoraTest.audio.paused"),
  );
  await evaluate(
    `window.sonoraTest.wm.placeHorizonWindow(window.sonoraTest.id,'right',undefined,{depth:1,y:.5,anchor:.5})`,
  );
  await delay(500);
  assert(
    "Dock droit : play/pause reste la commande de la session",
    await evaluate(
      `document.querySelector('[data-horizon-window="'+window.sonoraTest.id+'"]').dataset.docked==='true'&&!window.sonoraTest.audio.paused`,
    ),
  );
  await shot("dock");
  const semantic =
    await evaluate(`(async()=>{const {act,read,call,id,registry,wm,contexts}=window.sonoraTest;const a=(name,value)=>{if(!value)throw Error(name)};const out=[];const check=(name,value)=>{a(name,value);out.push(name)};
  await act('pause');await new Promise(r=>setTimeout(r,100));check('L’agent pilote la pause sans grant manuel',window.sonoraTest.audio.paused);
  await act('seek',{seconds:5});await act('volume',{value:.35});await act('mute',{muted:true});await act('repeat',{mode:'all'});await act('shuffle',{enabled:true});
  check('Seek, volume, mute, répétition et aléatoire sont pilotables',Math.abs(window.sonoraTest.audio.currentTime-5)<.2&&window.sonoraTest.audio.volume===.35&&window.sonoraTest.audio.muted&&(await read()).state.repeat==='all'&&(await read()).state.shuffle);
  await act('next');await new Promise(r=>setTimeout(r,100));check('L’agent sélectionne la piste suivante',(await read()).state.current.title==='Signal Study No. 2');
  let denied=false;try{await call('horizon.session.action',{windowId:id,action:'play',expectedRevision:'stale',requestId:'stale-qa'},{source:'mcp'})}catch{denied=true}check('Les révisions périmées restent refusées',denied);
  await contexts.initialize();const win=wm.getSnapshot().windows.find(w=>w.id===id);contexts.add({contextId:win.contextId,kind:'text',text:'Contexte musical Sonora QA',source:{windowId:id,appId:'music',title:'Sonora QA',confidence:'explicit'}});check('Le tiroir de l’app est lisible par défaut',(await read()).items.some(x=>x.text==='Contexte musical Sonora QA'));
  registry.setSharing(id,false);denied=false;try{await read()}catch{denied=true}check('La session privée coupe l’accès par défaut',denied);registry.setSharing(id,true);
  wm.focusWindow(id);await new Promise(r=>setTimeout(r,550));const state=await read(),search=state.state.ui.controls.find(c=>c.label==='Rechercher une piste');await act('ui.input',{id:search.id,value:'Signal Study No. 2'});await new Promise(r=>setTimeout(r,150));check('Les contrôles d’interface sont aussi accessibles par l’agent',document.querySelectorAll('.sonora-track').length===1);await act('ui.input',{id:search.id,value:''});
  const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('unkernelos-sonora');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});const persisted=await new Promise(resolve=>{const req=db.transaction('tracks').objectStore('tracks').count();req.onsuccess=()=>resolve(req.result)});db.close();check('Les fichiers et la collection sont conservés dans IndexedDB',persisted===2);
  return out;
 })()`);
  for (const name of semantic) assert(name, true);
  const extra = await evaluate(`(async()=>{
    const {wm,registry,call,id}=window.sonoraTest,out=[],check=(n,x)=>{if(!x)throw Error(n);out.push(n)};
    const body=document.querySelector('[data-horizon-window="'+id+'"] .horizon-windowbody'),secret=document.createElement('span');secret.dataset.private='true';secret.textContent='SONORA_PRIVATE_SENTINEL';body.append(secret);const snapshot=await window.sonoraTest.read();check('Les zones data-private sont exclues du contexte de l’interface',!snapshot.state.ui.text.includes('SONORA_PRIVATE_SENTINEL'));secret.remove();
    const reopened=wm.openApp('music',undefined,true);for(let i=0;i<80;i++){await new Promise(r=>setTimeout(r,100));const a=registry.peek(reopened);if(a?.state.ready&&a.state.duration>0)break}
    const state=registry.peek(reopened).state,audio=document.querySelector('[data-horizon-window="'+reopened+'"] audio');check('Une nouvelle session retrouve les MP3 et leurs blobs persistés',state.tracks.length===2&&state.current.title==='Signal Study No. 1'&&audio.readyState>=1&&!state.playing);wm.closeWindow(reopened);wm.focusWindow(id);
    return out;
  })()`);
  for (const name of extra) assert(name, true);
  const tone = fs
    .readFileSync(".cache/sonora-qa/signal-one.mp3")
    .toString("base64");
  const linuxImport = await evaluate(`(async()=>{
    const moduleUrl=path=>{const r=performance.getEntriesByType('resource').filter(r=>new URL(r.name).pathname===path);return r.find(r=>r.name.includes('?t='))?.name??path};
    const runtime=await import(moduleUrl('/src/core/runtime.ts'));const effectUrl=performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname.endsWith('/effect.js'))?.name;const {Effect}=await import(effectUrl);
    await runtime.appRuntime.runPromise(Effect.flatMap(runtime.GuestFsService,fs=>fs.writeFileBytes('/tmp/sonora-agent.mp3',Uint8Array.from(atob(${JSON.stringify(tone)}),c=>c.charCodeAt(0)))));
    const result=await window.sonoraTest.act('import',{path:'/tmp/sonora-agent.mp3'});const state=await window.sonoraTest.read();const valid=state.state.tracks.some(t=>t.guestPath==='/tmp/sonora-agent.mp3');await window.sonoraTest.act('remove',{id:result.result.id});return valid;
  })()`);
  assert("Un agent importe un vrai MP3 depuis le système Linux", linuxImport);
  // The same source emitted by all three language examples is installed through the real OS API.
  for (const [language, path] of [
    ["Bun", "/tmp/sonora-example-bun.html"],
    ["Node", "/tmp/sonora-example-node.html"],
    ["Rust", "/tmp/sonora-example-rust.html"],
  ]) {
    const html = fs.readFileSync(path, "utf8");
    const result =
      await evaluate(`(async()=>{const {wm,call,registry}=window.sonoraTest;await call('app.install',{id:${JSON.stringify("sdk-" + language.toLowerCase())},title:${JSON.stringify("Compteur " + language)},html:${JSON.stringify(html)},open:true},{source:'mcp'});const win=wm.getSnapshot().windows.find(w=>w.props?.dynamicAppId===${JSON.stringify("sdk-" + language.toLowerCase())});
   for(let i=0;i<70;i++){await new Promise(r=>setTimeout(r,100));if(registry.peek(win.id)?.actions?.increment)break}
   const read=()=>call('horizon.session.read',{windowId:win.id},{source:'mcp'});const initial=await read();await call('horizon.session.action',{windowId:win.id,action:'increment',expectedRevision:initial.revision,requestId:crypto.randomUUID()},{source:'mcp'});await new Promise(r=>setTimeout(r,200));const value=(await read()).state.value;
   window.sonoraTest.sdkId=win.id;wm.placeHorizonWindow(win.id,'left',undefined,{depth:1,y:.5,anchor:.5});return {value,dock:registry.peek(win.id).dock?.primaryAction};})()`);
    assert(
      language + " : app générée, installée, contexte et action agent via SDK",
      result.value === 1 && result.dock === "increment",
    );
    if (language !== "Rust")
      await evaluate(
        "window.sonoraTest.wm.closeWindow(window.sonoraTest.sdkId)",
      );
  }
  await delay(550);
  await click("[data-dock-window] .horizon-dock-primary");
  await delay(200);
  assert(
    "Le dock d’une app SDK appelle sa vraie fonction dans l’iframe",
    await evaluate(
      `window.sonoraTest.registry.peek(window.sonoraTest.sdkId).state.value===2`,
    ),
  );
  const reload = await evaluate(
    `(async()=>{const {wm,call,registry,sdkId}=window.sonoraTest;const previous=registry.peek(sdkId).revision;document.querySelector('[data-horizon-window="'+sdkId+'"] button[title="Reload App"]').click();for(let i=0;i<70;i++){await new Promise(r=>setTimeout(r,100));const a=registry.peek(sdkId);if(a?.actions?.increment&&a.revision!==previous&&a.state.value===0)break}let rejected=false;try{await call('horizon.session.action',{windowId:sdkId,action:'increment',expectedRevision:previous,requestId:crypto.randomUUID()},{source:'mcp'})}catch{rejected=true}return rejected&&registry.peek(sdkId).state.value===0})()`,
  );
  assert(
    "Un rechargement SDK invalide les anciennes révisions et commandes",
    reload,
  );
  assert(
    "Le contrat SDK est découvrable par les agents via app.sdk",
    await evaluate(
      `window.sonoraTest.call('app.sdk',{}, {source:'mcp'}).then(s=>s.version===1&&s.sharedByDefault&&s.contract.define.includes('unkernelOS.app.define'))`,
    ),
  );
  await evaluate(
    "window.sonoraTest.wm.closeWindow(window.sonoraTest.sdkId);window.sonoraTest.wm.focusWindow(window.sonoraTest.id)",
  );
  await delay(550);
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(550);
  await evaluate(
    `for(const t of window.sonoraTest.wm.getSnapshot().toasts)window.sonoraTest.wm.dismissToast(t.id)`,
  );
  await shot("mobile");
  assert(
    "Sonora reste utilisable sur petit écran",
    await evaluate(
      'document.documentElement.scrollWidth===innerWidth&&document.querySelector(".sonora-play").getBoundingClientRect().width>=40',
    ),
  );
  const classic = await evaluate(
    `(async()=>{const {wm,registry}=window.sonoraTest;for(const w of [...wm.getSnapshot().windows])wm.closeWindow(w.id);wm.setHorizonEnabled(false);const id=wm.openApp('music');for(let i=0;i<70;i++){await new Promise(r=>setTimeout(r,100));if(registry.peek(id)?.actions?.play)break}const valid=!!registry.peek(id)?.actions?.play;wm.closeWindow(id);wm.setHorizonEnabled(true);wm.openApp('music');return valid})()`,
  );
  assert(
    "Le shell classique conserve aussi le contrat agent du lecteur",
    classic,
  );
  assert(
    "Aucune exception JavaScript pendant les parcours",
    errors.length === 0,
  );
  fs.writeFileSync(
    ".cache/sonora-qa/report.json",
    JSON.stringify(
      { passed: results.length, results, errors, at: new Date().toISOString() },
      null,
      2,
    ),
  );
  console.log("DONE", results.length);
} catch (error) {
  console.error(error);
  await shot("failure");
  console.error("Runtime errors", errors);
  process.exitCode = 1;
} finally {
  ws.close();
}
