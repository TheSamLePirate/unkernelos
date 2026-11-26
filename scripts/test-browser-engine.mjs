/** Native browser integration: use a separate companion test instance/profile. */
import fs from "node:fs";
const base = process.env.COMPANION_URL || "http://127.0.0.1:17892";
const results = [];
const assert = (name, value) => {
  if (!value) throw Error(name);
  results.push(name);
  console.log("PASS", name);
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const fixture = Bun.serve({
  hostname: "127.0.0.1",
  port: 17893,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/socket") {
      if (server.upgrade(req)) return;
      return new Response("upgrade failed", { status: 500 });
    }
    if (url.pathname === "/redirect")
      return Response.redirect("http://host.localhost:17893/form", 302);
    if (url.pathname === "/cookie")
      return new Response("<title>Cookie</title><p>Cookie persisted</p>", {
        headers: {
          "Content-Type": "text/html",
          "Set-Cookie": "os_browser_test=alive; SameSite=Lax; Path=/",
        },
      });
    if (url.pathname === "/check-cookie")
      return new Response(
        "<title>Cookie check</title><p>" +
          String(req.headers.get("cookie")) +
          "</p>",
        { headers: { "Content-Type": "text/html" } },
      );
    return new Response(
      '<!doctype html><title>Protected browser fixture</title><style>body{font:18px system-ui;padding:30px;background:#eff6ff;color:#14253c}input,button{font:inherit;padding:10px}section{height:1400px}</style><h1 id="title">Real Chromium</h1><p>Frame embedding denied. Native navigation works.</p><input id="name" aria-label="Your name" placeholder="Your name"><button id="submit" onclick="document.querySelector(\'#result\').textContent=\'Hello \'+document.querySelector(\'#name\').value+\' · trusted=\'+event.isTrusted">Apply</button><output id="result"></output><p><a id="next" href="/second">Second page</a></p><button id="dialog" onclick="document.querySelector(\'#result\').textContent=prompt(\'Test dialog\')">Dialog</button><button id="socket-test" onclick="const w=new WebSocket(\'ws://host.localhost:17893/socket\');w.onopen=()=>w.send(\'native-socket\');w.onmessage=e=>document.querySelector(\'#result\').textContent=e.data">WebSocket</button><section></section><p id="bottom">Bottom of page</p>',
      {
        headers: {
          "Content-Type": "text/html",
          "X-Frame-Options": "DENY",
          "Content-Security-Policy": "frame-ancestors 'none'",
        },
      },
    );
  },
  websocket: {
    message(ws, message) {
      ws.send("echo:" + message);
    },
  },
});
const response = await fetch(base + "/__companion/bootstrap", {
  headers: { "sec-fetch-site": "same-origin" },
});
const cookie = response.headers.get("set-cookie").split(";")[0];
const ws = new WebSocket(
  base.replace("http:", "ws:") + "/__companion/browser",
  { headers: { Origin: base, Cookie: cookie } },
);
let lastFrameData = "";
let seq = 0,
  frames = 0,
  dialog;
const replies = new Map();
let readyResolve, readyReject;
const ready = new Promise((r, j) => {
  readyResolve = r;
  readyReject = j;
});
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.type === "ready") readyResolve();
  if (m.type === "error") {
    console.error("ENGINE ERROR", m.error);
    readyReject(Error(m.error));
    for (const p of replies.values()) {
      clearTimeout(p.timer);
      p.reject(Error(m.error));
    }
    replies.clear();
  }
  if (m.type === "dialog") dialog = m.dialog;
  if (m.type === "result") {
    const p = replies.get(m.id);
    if (p) {
      clearTimeout(p.timer);
      replies.delete(m.id);
      m.ok ? p.resolve(m.result) : p.reject(Error(m.error));
    }
  }
  if (m.type === "frame") {
    frames++;
    lastFrameData = m.data;
    ws.send(JSON.stringify({ action: "ack", sessionId: m.sessionId }));
  }
};
ws.onclose = () => {
  for (const p of replies.values()) {
    clearTimeout(p.timer);
    p.reject(Error("Browser socket closed"));
  }
  replies.clear();
};
const call = (action, args = {}) =>
  new Promise((resolve, reject) => {
    const id = String(++seq),
      timer = setTimeout(() => reject(Error("Timeout " + action)), 35000);
    replies.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, action, ...args }));
  });
const until = async (test) => {
  for (let i = 0; i < 100; i++) {
    const v = await call("snapshot");
    if (test(v)) return v;
    await pause(100);
  }
  throw Error("Page state timeout");
};
try {
  await ready;
  assert("Authenticated native engine starts with its own profile", true);
  let denied = false;
  try {
    await call("navigate", { url: "file:///etc/passwd" });
  } catch {
    denied = true;
  }
  assert("Native bridge rejects local file and executable schemes", denied);
  await call("navigate", { url: "http://host.localhost:17893/form" });
  let page = await until((p) => p.title === "Protected browser fixture");
  assert(
    "A real site denying iframe embedding loads inside the engine",
    page.text.includes("Frame embedding denied"),
  );
  assert(
    "Page controls are available to agents without form values",
    page.elements.some((e) => e.selector === "#name") &&
      !page.elements.some((e) => "value" in e),
  );
  await call("fill", { selector: "#name", value: "unkernelOS 🌍" });
  await call("click", { selector: "#submit" });
  page = await until((p) => p.text.includes("Hello unkernelOS"));
  assert(
    "Agent fill/click runs JavaScript and dispatches trusted pointer events",
    page.text.includes("trusted=true"),
  );
  await call("click", { selector: "#next" });
  await until((p) => p.url.endsWith("/second"));
  await call("back");
  page = await until((p) => p.url.endsWith("/form"));
  assert(
    "Back navigation preserves real browser history",
    page.url.endsWith("/form"),
  );
  await call("forward");
  page = await until((p) => p.url.endsWith("/second"));
  assert("Forward navigation works", page.url.endsWith("/second"));
  await call("navigate", { url: "http://host.localhost:17893/redirect" });
  page = await until((p) => p.url.endsWith("/form"));
  assert("HTTP redirects update the real page URL", page.url.endsWith("/form"));
  await call("navigate", { url: "http://host.localhost:17893/cookie" });
  await until((p) => p.title === "Cookie");
  await call("navigate", { url: "http://host.localhost:17893/check-cookie" });
  page = await until((p) => p.title === "Cookie check");
  assert(
    "Website cookies persist within the isolated browser profile",
    page.text.includes("os_browser_test=alive"),
  );
  await call("navigate", { url: "http://host.localhost:17893/form" });
  await until((p) => p.title === "Protected browser fixture");
  await call("click", { selector: "#socket-test" });
  page = await until((p) => p.text.includes("echo:native-socket"));
  assert(
    "Website WebSockets work without URL rewriting",
    page.text.includes("echo:native-socket"),
  );
  await call("click", { selector: "#dialog" });
  for (let i = 0; i < 30 && !dialog; i++) await pause(100);
  assert(
    "JavaScript dialogs are surfaced to the OS",
    dialog?.type === "prompt",
  );
  await call("dialog", { accept: true, text: "OS response" });
  page = await until((p) => p.text.includes("OS response"));
  assert(
    "Dialog responses return to the real site",
    page.text.includes("OS response"),
  );
  await call("resize", { width: 390, height: 600, scale: 2 });
  await call("pointer", { kind: "mouseWheel", x: 100, y: 100, deltaY: 500 });
  assert("Rendered frames stream with acknowledgements", frames > 5);
  let viewportWidth = 640;
  for (const [url, match] of [
    ["https://www.wikipedia.org/", (p) => p.title.includes("Wikipedia")],
    ["https://github.com/", (p) => p.title.includes("GitHub")],
    ["https://developer.mozilla.org/en-US/", (p) => p.title.includes("MDN")],
  ]) {
    await call("navigate", { url });
    const page = await until((p) => match(p) && p.text.length > 10);
    assert("Internet navigation: " + new URL(url).hostname, !!page.text);
    const before = frames;
    await call("resize", { width: viewportWidth++, height: 700, scale: 1 });
    for (let i = 0; i < 60 && frames === before; i++) await pause(50);
    assert("Live rendered page: " + new URL(url).hostname, frames > before);
    fs.mkdirSync(".cache/browser-qa", { recursive: true });
    fs.writeFileSync(
      ".cache/browser-qa/" + new URL(url).hostname + ".jpg",
      Buffer.from(lastFrameData, "base64"),
    );
  }
  fs.mkdirSync(".cache/browser-qa", { recursive: true });
  fs.writeFileSync(
    ".cache/browser-qa/engine-report.json",
    JSON.stringify({ passed: results.length, frames, results }, null, 2),
  );
} finally {
  ws.close();
  fixture.stop(true);
}
console.log(results.length + " native browser checks passed");
