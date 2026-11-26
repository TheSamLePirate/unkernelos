/** Proof-story vocabulary editing against the real app and guest Poule checker. */
import fs from "node:fs";
const base = process.env.PROOF_BASE_URL || "http://127.0.0.1:17891";
const port = Number(process.env.PROOF_CDP_PORT || 9336);
const out = ".cache/proof-qa";
fs.mkdirSync(out, { recursive: true });
const chrome = Bun.spawn([
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "--headless=new", `--remote-debugging-port=${port}`,
  "--user-data-dir=/tmp/unkernelos-proof-glossary-qa", "--no-first-run",
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
  const fixture = "pred p : ()\n(*@ p : il pleut — la pluie tombe *)\ntheorem identite : p() -> p() = fun (h : p()) => h\n";
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `localStorage.removeItem('unkernelos:horizon:enabled:v1');localStorage.setItem('unkernelos.poule.source.v1',${JSON.stringify(fixture)});localStorage.setItem('unkernelos.poule.welcome.v1','seen');`,
  });
  await send("Emulation.setDeviceMetricsOverride", { width: 1512, height: 982, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: base + "/?app=proof-studio" });
  let ready = false;
  let installing = false;
  for (let i = 0; i < 2400; i++) {
    ready = await evaluate("!!document.querySelector('[data-app-content] button[title^=\"Prouvé\"]')");
    if (ready) break;
    if (!installing && await evaluate(`(() => {const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Installer microML + Poule');if(!b)return false;b.click();return true;})()`)) {
      installing = true;
      console.log("Installing the existing Poule toolchain in the isolated QA VM");
    }
    if (i > 0 && i % 120 === 0) console.log("Waiting for guest Poule", Math.round(i / 4), "seconds");
    await delay(250);
  }
  if (!ready) throw new Error("Poule did not check the fixture: " + await evaluate("document.body.innerText.slice(-2400)"));
  const checks = await evaluate(`(async()=>{
    const call=window.unkernelOS.call;
    const id=(await call('wm.windows')).windows.find(w=>w.appId==='proof-studio').id;
    await call('wm.snap',{windowId:id,zone:'maximize'});
    const root=document.querySelector('[data-app-content="'+id+'"]');
    const wait=ms=>new Promise(r=>setTimeout(r,ms)),out=[];
    const assert=(n,x)=>{if(!x)throw new Error(n);out.push(n)};
    const button=(text,scope=root)=>[...scope.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
    button('Récit').click();await wait(150);
    button('Direct',root.querySelector('[data-proof-glossary]').parentElement).click();await wait(150);
    const editor=root.querySelector('[data-proof-glossary]');
    assert('The checked proof exposes an editable narrative vocabulary',!!editor&&root.querySelector('.font-serif').textContent.includes('il pleut'));
    const input=(label,text)=>{
      const el=editor.querySelector('[aria-label="'+label+'"]');
      Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,text);
      el.dispatchEvent(new Event('input',{bubbles:true}));
    };
    editor.querySelector('[aria-label="Modifier la définition de p"]').click();await wait(50);
    input('Lecture usuelle','le soleil brille');input('Définition rigoureuse','le ciel est lumineux');
    button('Enregistrer',editor).click();await wait(150);
    assert('Editing a definition updates the actual narrative immediately',root.querySelector('.font-serif').textContent.includes('le soleil brille')&&!root.querySelector('.font-serif').textContent.includes('il pleut'));
    assert('Edited definitions are saved in the Poule source',localStorage.getItem('unkernelos.poule.source.v1').includes('le soleil brille — le ciel est lumineux'));
    const code=localStorage.getItem('unkernelos.poule.source.v1');
    assert('The checked theorem is not rewritten',code.includes('theorem identite : p() -> p() = fun (h : p()) => h'));
    button('Ajouter une définition',editor).click();await wait(50);
    input('Symbole et paramètres','pair(n)');input('Lecture usuelle','{n} est pair');input('Définition rigoureuse','{n} est divisible par 2');
    button('Enregistrer',editor).click();await wait(150);
    assert('Users can write a new parameterized definition',!!editor.querySelector('[aria-label="Modifier la définition de pair"]')&&localStorage.getItem('unkernelos.poule.source.v1').includes('(*@ pair(n) : {n} est pair — {n} est divisible par 2 *)'));
    assert('Unused definitions remain available for other narratives',editor.textContent.includes('non utilisé dans ce récit'));
    button('Ajouter une définition',editor).click();await wait(50);
    input('Symbole et paramètres','p');input('Lecture usuelle','duplicate');
    button('Enregistrer',editor).click();await wait(50);
    assert('Duplicate symbols show an error without overwriting existing definitions',!!editor.querySelector('[role="alert"]')&&localStorage.getItem('unkernelos.poule.source.v1').includes('le soleil brille'));
    button('Annuler',editor).click();await wait(50);
    editor.querySelector('[aria-label="Modifier la définition de p"]').click();await wait(50);
    input('Lecture usuelle','unsafe *) theorem injection');
    button('Enregistrer',editor).click();await wait(50);
    assert('Comment delimiters cannot break proof syntax',!!editor.querySelector('[role="alert"]')&&!localStorage.getItem('unkernelos.poule.source.v1').includes('injection'));
    button('Annuler',editor).click();await wait(50);
    editor.querySelector('[aria-label="Modifier la définition de pair"]').click();await wait(50);
    button('Supprimer',editor).click();await wait(50);
    assert('Definition removal updates the source',!localStorage.getItem('unkernelos.poule.source.v1').includes('(*@ pair('));
    button('Rétablir',editor).click();await wait(100);
    assert('Removing a definition can be undone',!!editor.querySelector('[aria-label="Modifier la définition de pair"]'));
    editor.querySelector('[aria-label="Modifier la définition de p"]').click();await wait(50);
    input('Lecture usuelle','unsaved cancelled text');button('Annuler',editor).click();await wait(50);
    assert('Cancelling preserves the saved definition',root.querySelector('.font-serif').textContent.includes('le soleil brille')&&!localStorage.getItem('unkernelos.poule.source.v1').includes('unsaved cancelled text'));
    const saved=localStorage.getItem('unkernelos.poule.source.v1');
    await call('wm.close',{windowId:id});await call('wm.open',{appId:'proof-studio'});await wait(1400);
    const reopened=document.querySelector('[data-app-content]');
    assert('Definitions survive closing and reopening Proof Studio',localStorage.getItem('unkernelos.poule.source.v1')===saved);
    button('Récit',reopened).click();await wait(100);button('Direct',reopened.querySelector('[data-proof-glossary]').parentElement).click();await wait(100);
    assert('Reopened narrative uses the edited definitions',reopened.querySelector('.font-serif').textContent.includes('le soleil brille')&&!!reopened.querySelector('[aria-label="Modifier la définition de pair"]'));
    assert('Poule still proves the annotated theorem',!!reopened.querySelector('button[title^="Prouvé"]'));
    return out;
  })()`);
  for (const name of checks) check(name, true);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(`${out}/glossary.png`, Buffer.from(shot.data,"base64"));
  fs.writeFileSync(`${out}/report.json`, JSON.stringify({ passed: results.length, results }, null, 2));
  console.log(JSON.stringify({ passed: results.length, results }, null, 2));
} finally {
  ws?.close();chrome.kill();await chrome.exited;
}
