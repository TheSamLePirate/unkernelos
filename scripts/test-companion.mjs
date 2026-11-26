/** Real local service + Chromium VM + Wisp sockets + CLI + MCP. Run with Bun. */
import fs from "node:fs";
import net from "node:net";
import dgram from "node:dgram";
import path from "node:path";
const root = process.cwd(),
  out = path.join(root, ".cache/companion-qa");
fs.mkdirSync(out, { recursive: true });
const binary =
  process.env.COMPANION_BINARY ||
  path.join(root, "companion/target/release/unkernelos-companion");
const base = process.env.COMPANION_URL || "http://127.0.0.1:17891";
const conn = JSON.parse(
  fs.readFileSync(
    path.join(
      process.env.UNKERNELOS_COMPANION_HOME ||
        path.join(
          process.env.HOME,
          "Library/Application Support/unkernelOS Companion",
        ),
      "connection.json",
    ),
    "utf8",
  ),
);
const results = [];
const assert = (name, ok) => {
  if (!ok) throw new Error(name);
  results.push(name);
  console.log("PASS", name);
};
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (route, params = {}) => {
  const r = await fetch(base + "/__companion/" + route, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + conn.token,
      "content-type": "application/json",
    },
    body: JSON.stringify(params),
  });
  const v = await r.json();
  if (!v.ok) throw new Error(v.error);
  return v.result;
};
const call = (method, params = {}, sessionId) =>
  api("call", { method, params, sessionId });
const cli = async (args) => {
  const p = Bun.spawn([binary, ...args], { stdout: "pipe", stderr: "pipe" });
  const stdout = await new Response(p.stdout).text(),
    stderr = await new Response(p.stderr).text();
  if (await p.exited) throw new Error(stderr);
  return JSON.parse(stdout);
};
let chrome, cdp, echo, udp, wisp;
try {
  assert(
    "Agent API rejects missing bearer",
    (await fetch(base + "/__companion/sessions", { method: "POST" })).status ===
      403,
  );
  assert(
    "Bootstrap rejects a foreign website",
    (
      await fetch(base + "/__companion/bootstrap", {
        headers: {
          Origin: "https://evil.example",
          "sec-fetch-site": "cross-site",
        },
      })
    ).status === 403,
  );
  assert(
    "Host allowlist rejects DNS rebinding",
    (await fetch(base + "/", { headers: { Host: "evil.example" } })).status ===
      403,
  );
  const boot = await fetch(base + "/__companion/bootstrap", {
      headers: { "sec-fetch-site": "same-origin" },
    }),
    cookie = boot.headers.get("set-cookie");
  assert(
    "Bootstrap uses a separate HttpOnly cookie",
    boot.ok && cookie.includes("HttpOnly") && !cookie.includes(conn.token),
  );
  const page = await fetch(base + "/");
  assert(
    "Local index enables companion bootstrap",
    (await page.text()).includes('name="unkernelos-companion"'),
  );
  const directEntry = await fetch(base + "/index.html");
  assert(
    "Direct HTML entries cannot bypass local mode",
    (await directEntry.text()).includes('name="unkernelos-companion"'),
  );
  assert(
    "COOP / COEP are served by Rust",
    page.headers.get("cross-origin-opener-policy") === "same-origin" &&
      page.headers.get("cross-origin-embedder-policy") === "require-corp",
  );
  const range = await fetch(base + "/distros/alpine.erofs", {
    headers: { Range: "bytes=0-1023" },
  });
  assert(
    "Distro byte ranges stream correctly",
    range.status === 206 && (await range.arrayBuffer()).byteLength === 1024,
  );
  echo = net.createServer((socket) => socket.pipe(socket));
  await new Promise((r) => echo.listen(0, "127.0.0.1", r));
  udp = dgram.createSocket("udp4");
  udp.on("message", (msg, r) => udp.send(msg, r.port, r.address));
  await new Promise((r) => udp.bind(0, "127.0.0.1", r));
  const packets = [];
  wisp = new WebSocket(base.replace("http:", "ws:") + "/wisp", {
    headers: { Origin: base, Cookie: cookie.split(";")[0] },
  });
  wisp.binaryType = "arraybuffer";
  wisp.onmessage = (e) => packets.push(Buffer.from(e.data));
  await new Promise((resolve, reject) => {
    wisp.onopen = resolve;
    wisp.onerror = reject;
  });
  const waitPacket = async (type, id) => {
    for (let i = 0; i < 200; i++) {
      const index = packets.findIndex(
        (p) => p[0] === type && p.readUInt32LE(1) === id,
      );
      if (index >= 0) return packets.splice(index, 1)[0];
      await delay(25);
    }
    throw new Error(`Wisp packet timeout ${type}/${id}`);
  };
  assert(
    "Wisp handshake announces packet credits",
    (await waitPacket(3, 0)).readUInt32LE(5) === 128,
  );
  const connect = (id, type, port) => {
    const b = Buffer.alloc(8);
    b[0] = 1;
    b.writeUInt32LE(id, 1);
    b[5] = type;
    b.writeUInt16LE(port, 6);
    wisp.send(Buffer.concat([b, Buffer.from("127.0.0.1")]));
  };
  const data = (id, bytes) => {
    const h = Buffer.alloc(5);
    h[0] = 2;
    h.writeUInt32LE(id, 1);
    wisp.send(Buffer.concat([h, bytes]));
  };
  connect(1, 1, echo.address().port);
  data(1, Buffer.from("tcp-through-native-wisp"));
  assert(
    "Local Wisp transports TCP",
    (await waitPacket(2, 1)).subarray(5).toString() ===
      "tcp-through-native-wisp",
  );
  connect(2, 2, udp.address().port);
  data(2, Buffer.from("udp-through-native-wisp"));
  assert(
    "Local Wisp transports UDP",
    (await waitPacket(2, 2)).subarray(5).toString() ===
      "udp-through-native-wisp",
  );
  wisp.close();
  echo.close();
  udp.close();
  echo = udp = undefined;
  chrome = Bun.spawn(
    [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "--headless=new",
      "--remote-debugging-port=9333",
      `--user-data-dir=${out}/chrome-profile`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--autoplay-policy=no-user-gesture-required",
      "about:blank",
    ],
    { stdout: "ignore", stderr: Bun.file(path.join(out, "chrome.log")) },
  );
  let tabs;
  for (let i = 0; i < 100; i++) {
    try {
      tabs = await (await fetch("http://127.0.0.1:9333/json/list")).json();
      if (tabs.length) break;
    } catch {}
    await delay(100);
  }
  const tab = tabs.find((t) => t.type === "page");
  cdp = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r) => (cdp.onopen = r));
  let seq = 0;
  const pending = new Map(),
    errors = [];
  cdp.onmessage = (e) => {
    const m = JSON.parse(e.data);
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
        m.params.exceptionDetails.exception?.description ||
          m.params.exceptionDetails.text,
      );
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      cdp.send(JSON.stringify({ id, method, params }));
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
        r.exceptionDetails.exception?.description || r.exceptionDetails.text,
      );
    return r.result.value;
  };
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1512,
    height: 982,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: base + "/?app=music" });
  let info;
  for (let i = 0; i < 240; i++) {
    await delay(500);
    try {
      info = await call("system.info");
      if (info.phase === "running" && info.wispActiveUrl) break;
    } catch {}
  }
  assert("Real browser Linux VM reaches running", info?.phase === "running");
  assert(
    "Local origin has SharedArrayBuffer isolation",
    info.crossOriginIsolated && (await evaluate("crossOriginIsolated")),
  );
  assert(
    "VM uses only the native Wisp relay",
    info.wispActiveUrl === base.replace("http:", "ws:") + "/wisp",
  );
  const schema = await cli(["schema"]);
  assert(
    "CLI discovers the full live API",
    schema.length > 80 &&
      schema.some((m) => m.method === "guest.exec") &&
      schema.some((m) => m.method === "horizon.session.action"),
  );
  const builtins = await cli(["skills", "list", "--scope", "builtin"]);
  assert(
    "CLI discovers built-in OS skills without instructions",
    builtins.skills.length === 3 &&
      builtins.skills.every((s) => s.source === "builtin" && !("content" in s)),
  );
  const found = await cli(["skills", "search", "reactive"]);
  assert(
    "CLI searches skill names and descriptions",
    found.skills.some((s) => s.name === "unkernelos-reactive-mods"),
  );
  const skill = await cli(["skills", "read", "unkernelos-os-control"]);
  assert(
    "CLI progressively loads a complete skill and transport guide",
    skill.content.startsWith("---") && !!skill.transport.cli,
  );
  await call("guest.fs.mkdir", { path: "/tmp/companion-skills/companion-qa" });
  const skillContent =
    "---\nname: companion-qa\ndescription: Companion QA skill for discovering guest instructions.\n---\n\n# Guest skill\nRead system.info before acting.\n";
  await call("guest.fs.write", {
    path: "/tmp/companion-skills/companion-qa/SKILL.md",
    content: skillContent,
  });
  const guestSkills = await cli([
    "skills",
    "list",
    "--scope",
    "guest",
    "--root",
    "/tmp/companion-skills",
    "--query",
    "companion qa",
  ]);
  assert(
    "CLI discovers skills newly installed inside the VM",
    guestSkills.skills.length === 1 && guestSkills.skills[0].source === "guest",
  );
  const guestSkill = await cli(["skills", "read", guestSkills.skills[0].id]);
  assert(
    "CLI reads discovered guest skills by stable id",
    guestSkill.content === skillContent,
  );
  const invalidScope = Bun.spawn([binary, "skills", "list", "--scope", "mac"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  assert(
    "Mac skills are outside the discovery scope",
    (await invalidScope.exited) === 1,
  );
  const result = await cli([
    "guest.exec",
    "--params",
    JSON.stringify({ script: "printf companion-ok; uname -s" }),
  ]);
  assert(
    "CLI executes in Linux, not macOS",
    result.exitCode === 0 && result.stdout === "companion-okLinux\n",
  );
  await cli([
    "guest.fs.write",
    "--params",
    JSON.stringify({
      path: "/tmp/companion-test.txt",
      content: "from Mac agent: été 🌍",
    }),
  ]);
  const read = await cli([
    "guest.fs.read",
    "--params",
    JSON.stringify({ path: "/tmp/companion-test.txt" }),
  ]);
  assert(
    "CLI writes and reads real guest files",
    read.content === "from Mac agent: été 🌍",
  );
  const quotedPath = "/tmp/companion's file.txt";
  await cli([
    "guest.fs.write",
    "--params",
    JSON.stringify({ path: quotedPath, content: "abcdefghij" }),
  ]);
  const chunk = await cli([
    "guest.fs.read",
    "--params",
    JSON.stringify({
      path: quotedPath,
      offset: 3,
      length: 4,
      encoding: "base64",
    }),
  ]);
  assert(
    "Guest byte ranges handle quoted filenames",
    chunk.content === "ZGVmZw==" && chunk.bytes === 4 && chunk.nextOffset === 7,
  );
  const piped = Bun.spawn([binary, "guest.fs.read", "--stdin"], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  piped.stdin.write(JSON.stringify({ path: quotedPath }));
  piped.stdin.end();
  const pipedValue = JSON.parse(await new Response(piped.stdout).text());
  assert(
    "CLI accepts structured JSON from stdin",
    (await piped.exited) === 0 && pipedValue.content === "abcdefghij",
  );
  const missing = Bun.spawn(
    [
      binary,
      "guest.fs.read",
      "--params",
      '{"path":"/tmp/companion-file-does-not-exist"}',
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  assert("CLI errors have nonzero exit status", (await missing.exited) === 1);
  const beforeNetwork = await cli(["status"]);
  const internet = await call("guest.exec", {
    script: "wget -qO- https://example.com | head -c 100",
    timeoutMs: 30000,
  });
  assert(
    "VM reaches Internet through native relay",
    internet.exitCode === 0 && internet.stdout.includes("<!doctype html>"),
  );
  const afterNetwork = await cli(["status"]);
  assert(
    "Guest traffic is counted by the native relay",
    afterNetwork.service.received > beforeNetwork.service.received &&
      afterNetwork.service.clients >= 1,
  );
  let surfaces = await call("horizon.sessions");
  fs.writeFileSync(
    path.join(out, "surfaces.json"),
    JSON.stringify(surfaces, null, 2),
  );
  const list = Array.isArray(surfaces) ? surfaces : surfaces.sessions;
  const music = list.find(
    (s) => s.appId === "music" || String(s.title).includes("Sonora"),
  );
  assert("External CLI discovers Sonora app context", !!music);
  const context = await cli([
    "horizon.session.read",
    "--params",
    JSON.stringify({ windowId: music.windowId }),
  ]);
  assert(
    "External CLI reads shared app state",
    !!context.state && !!context.revision,
  );
  // Exercise the SDK action path using a harmless volume change.
  const action = await call("horizon.session.action", {
    windowId: music.windowId,
    action: "volume",
    expectedRevision: context.revision,
    requestId: crypto.randomUUID(),
    args: { value: 0.42 },
  });
  assert(
    "External bridge invokes a published app action",
    action !== undefined,
  );
  assert(
    "External calls appear in the OS audit history",
    await evaluate(
      "window.unkernelOS.history().some(x=>x.source==='mcp'&&x.method==='guest.fs.write')",
    ),
  );
  await call("wm.open", { appId: "agent-api" });
  for (let i = 0; i < 60; i++) {
    if (
      await evaluate(
        `!!document.querySelector('[aria-label="Agent Firewall Mode"]')`,
      )
    )
      break;
    await delay(100);
  }
  const setFirewall = (mode) =>
    evaluate(
      `(()=>{const s=document.querySelector('[aria-label="Agent Firewall Mode"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(mode)});s.dispatchEvent(new Event('change',{bubbles:true}))})()`,
    );
  await setFirewall("read-only");
  let blocked = false;
  try {
    await call("guest.fs.write", {
      path: "/tmp/firewall-blocked",
      content: "no",
    });
  } catch (e) {
    blocked = e.message.includes("Read-Only");
  }
  assert("CLI/MCP mutations obey the OS read-only firewall", blocked);
  assert(
    "Read-only firewall still allows guest reads",
    (await call("guest.fs.read", { path: "/tmp/companion-test.txt" })).bytes >
      0,
  );
  await setFirewall("auto");
  const mcp = Bun.spawn([binary, "mcp"], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  let text = "",
    rid = 0;
  const responses = new Map();
  const reader = (async () => {
    for await (const chunk of mcp.stdout) {
      text += new TextDecoder().decode(chunk);
      let index;
      while ((index = text.indexOf("\n")) >= 0) {
        const line = text.slice(0, index);
        text = text.slice(index + 1);
        if (line.trim()) {
          const m = JSON.parse(line);
          if (m.id) responses.set(m.id, m);
        }
      }
    }
  })();
  const request = async (method, params = {}) => {
    const id = ++rid;
    mcp.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
    );
    for (let i = 0; i < 200; i++) {
      if (responses.has(id)) {
        const r = responses.get(id);
        if (r.error) throw new Error(JSON.stringify(r.error));
        return r.result;
      }
      await delay(25);
    }
    throw new Error("MCP timeout " + method);
  };
  const init = await request("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "companion-integration-test", version: "1" },
  });
  assert(
    "Native MCP negotiates protocol",
    init.serverInfo.name === "unkernelOS Companion",
  );
  mcp.stdin.write(
    JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) +
      "\n",
  );
  const tools = await request("tools/list");
  assert(
    "MCP advertises complete API discovery and call tools",
    tools.tools.length === 3,
  );
  const mcpInfo = await request("tools/call", {
    name: "companion_call",
    arguments: { method: "system.info" },
  });
  assert(
    "External stdio MCP reaches the browser OS",
    !mcpInfo.isError && JSON.parse(mcpInfo.content[0].text).os === "unkernelOS",
  );
  mcp.stdin.end();
  await mcp.exited;
  await reader;
  const httpHeaders = {
    Authorization: "Bearer " + conn.token,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": "2025-11-25",
  };
  const httpInit = await fetch(base + "/mcp", {
    method: "POST",
    headers: httpHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "http-test", version: "1" },
      },
    }),
  });
  const rpcBody = async (r) => {
    const text = await r.text();
    if (r.headers.get("content-type")?.includes("text/event-stream"))
      return text
        .split("\n")
        .filter((l) => l.startsWith("data: "))
        .map((l) => l.slice(6))
        .filter(Boolean)
        .map((l) => JSON.parse(l))
        .find((v) => v.id);
    return JSON.parse(text);
  };
  const initValue = await rpcBody(httpInit);
  assert(
    "Authenticated HTTP MCP negotiates protocol",
    initValue.result?.serverInfo?.name === "unkernelOS Companion",
  );
  const sid = httpInit.headers.get("mcp-session-id");
  if (sid) httpHeaders["Mcp-Session-Id"] = sid;
  await fetch(base + "/mcp", {
    method: "POST",
    headers: httpHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }),
  });
  const httpTools = await rpcBody(
    await fetch(base + "/mcp", {
      method: "POST",
      headers: httpHeaders,
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    }),
  );
  assert(
    "Authenticated HTTP MCP lists callable tools",
    httpTools.result?.tools?.length === 3,
  );
  const sessionId = (await cli(["sessions"]))[0].id;
  await evaluate(
    `new Promise(r=>{window.secondBridge=new WebSocket(${JSON.stringify(base.replace("http:", "ws:") + "/__companion/connect")});window.secondBridge.onopen=r})`,
  );
  let ambiguous = false;
  try {
    await call("system.info");
  } catch (e) {
    ambiguous = e.message.includes("Multiple");
  }
  assert("Multiple browser sessions require an explicit target", ambiguous);
  assert(
    "CLI --session selects the intended OS",
    (await cli(["system.info", "--session", sessionId])).os === "unkernelOS",
  );
  await evaluate("window.secondBridge.close()");
  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(
    path.join(out, "browser.png"),
    Buffer.from(shot.data, "base64"),
  );
  assert("Browser raised no uncaught exceptions", errors.length === 0);
  await send("Page.navigate", { url: "about:blank" });
  for (let i = 0; i < 30; i++) {
    if ((await cli(["sessions"])).length === 0) break;
    await delay(100);
  }
  assert(
    "Closing browser OS removes its session",
    (await cli(["sessions"])).length === 0,
  );
  fs.writeFileSync(
    path.join(out, "report.json"),
    JSON.stringify(
      { passed: results.length, methods: schema.length, results, info, errors },
      null,
      2,
    ),
  );
} finally {
  wisp?.close();
  echo?.close();
  udp?.close();
  cdp?.close();
  chrome?.kill();
}
console.log(`${results.length} companion integration checks passed`);
