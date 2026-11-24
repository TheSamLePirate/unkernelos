import {
  Braces,
  Clock,
  Copy,
  Fingerprint,
  GitCompare,
  KeyRound,
  Palette,
  Regex,
  RefreshCw,
  Wrench,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { wmStore } from "../../wm/wm-store.ts";

type ToolId = "json" | "jwt" | "base64" | "regex" | "crypto" | "color" | "diff" | "cron";

const TOOLS: readonly { id: ToolId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "json", label: "JSON Studio", icon: Braces },
  { id: "jwt", label: "JWT Decoder", icon: KeyRound },
  { id: "base64", label: "Base64 / URL", icon: Wrench },
  { id: "regex", label: "Regex Tester", icon: Regex },
  { id: "crypto", label: "UUID & SHA Hash", icon: Fingerprint },
  { id: "color", label: "Color & Glass", icon: Palette },
  { id: "diff", label: "Text Diff", icon: GitCompare },
  { id: "cron", label: "Cron Explorer", icon: Clock },
];

const copyText = (text: string, label = "Value") => {
  navigator.clipboard.writeText(text).catch(() => {});
  wmStore.pushToast("Copied", `${label} copied to clipboard`, "info");
};

function decodeJwtPart(b64url: string): unknown {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").padEnd(6, "0");
  const n = parseInt(clean.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h /= 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return "Expected 5 fields: minute hour day-of-month month day-of-week";
  const [min, hour, dom, mon, dow] = parts as [string, string, string, string, string];
  if (expr.trim() === "* * * * *") return "Every single minute";
  if (min.startsWith("*/") && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    return `Every ${min.slice(2)} minutes`;
  }
  if (/^\d+$/.test(min) && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    return `Every hour at minute :${min.padStart(2, "0")}`;
  }
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === "*" && mon === "*" && dow === "*") {
    return `Every day at ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
  }
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === "*" && mon === "*" && dow === "1-5") {
    return `Every weekday (Mon–Fri) at ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
  }
  return `At minute "${min}", hour "${hour}", day "${dom}", month "${mon}", weekday "${dow}"`;
}

export const DevUtilitiesApp: React.FC = () => {
  const [tool, setTool] = useState<ToolId>("json");

  // JSON
  const [jsonIn, setJsonIn] = useState('{"os":"unkernelOS","kernel":"Linux 7.x","gpu":["WebGPU","VirGL"],"ready":true}');
  const [jsonOut, setJsonOut] = useState("");
  const [jsonErr, setJsonErr] = useState<string | null>(null);

  // JWT
  const [jwtIn, setJwtIn] = useState(
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1bmtlcm5lbG9zIiwibmFtZSI6IkFBQSBXZWJPUyIsInJvbGUiOiJkZXZlbG9wZXIiLCJpYXQiOjE3MzAwMDAwMDB9.demo-signature"
  );

  // Base64 / URL
  const [b64Plain, setB64Plain] = useState("Hello unkernelOS WebOS!");
  const [b64Encoded, setB64Encoded] = useState("SGVsbG8gdW5rZXJuZWxPUyBXZWJPUyE=");

  // Regex
  const [regexPat, setRegexPat] = useState("([A-Z0-9]{4}-[A-Z0-9]{4})");
  const [regexFlags, setRegexFlags] = useState("g");
  const [regexSample, setRegexSample] = useState(
    "Device code: AB12-CD34\nBackup code: 9F8E-7D6C\nInvalid: 12-34"
  );

  // Crypto
  const [uuids, setUuids] = useState<string[]>(() => Array.from({ length: 5 }, () => crypto.randomUUID()));
  const [hashInput, setHashInput] = useState("unkernelOS");
  const [sha256, setSha256] = useState("");
  const [sha512, setSha512] = useState("");

  // Color
  const [hexColor, setHexColor] = useState("#8b5cf6");

  // Diff
  const [diffA, setDiffA] = useState("const cpus = 1;\nconst theme = 'dark';\nconst gl = false;");
  const [diffB, setDiffB] = useState("const cpus = 4;\nconst theme = 'liquid-glass';\nconst gl = true;\nconst webgpu = true;");

  // Cron
  const [cronExpr, setCronExpr] = useState("*/15 * * * *");

  useEffect(() => {
    let active = true;
    const enc = new TextEncoder().encode(hashInput);
    void Promise.all([
      crypto.subtle.digest("SHA-256", enc),
      crypto.subtle.digest("SHA-512", enc),
    ]).then(([h256, h512]) => {
      if (!active) return;
      const toHex = (buf: ArrayBuffer) =>
        Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
      setSha256(toHex(h256));
      setSha512(toHex(h512));
    });
    return () => {
      active = false;
    };
  }, [hashInput]);

  const jwtDecoded = useMemo(() => {
    try {
      const parts = jwtIn.trim().split(".");
      if (parts.length < 2) return { error: "JWT must contain at least header.payload" };
      return {
        header: JSON.stringify(decodeJwtPart(parts[0]!), null, 2),
        payload: JSON.stringify(decodeJwtPart(parts[1]!), null, 2),
        signature: parts[2] ?? "",
        error: null,
      };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Invalid JWT" };
    }
  }, [jwtIn]);

  const regexMatches = useMemo(() => {
    try {
      const re = new RegExp(regexPat, regexFlags.includes("g") ? regexFlags : `${regexFlags}g`);
      const list: { match: string; index: number; groups: string[] }[] = [];
      let m: RegExpExecArray | null;
      let guard = 0;
      while ((m = re.exec(regexSample)) !== null && guard++ < 100) {
        list.push({ match: m[0], index: m.index, groups: m.slice(1) });
        if (m[0].length === 0) re.lastIndex++;
      }
      return { list, error: null };
    } catch (e) {
      return { list: [], error: e instanceof Error ? e.message : "Invalid regex" };
    }
  }, [regexPat, regexFlags, regexSample]);

  const diffLines = useMemo(() => {
    const a = diffA.split("\n");
    const b = diffB.split("\n");
    const max = Math.max(a.length, b.length);
    const out: { type: "same" | "del" | "add"; text: string }[] = [];
    for (let i = 0; i < max; i++) {
      if (a[i] === b[i]) {
        if (a[i] !== undefined) out.push({ type: "same", text: a[i]! });
      } else {
        if (a[i] !== undefined) out.push({ type: "del", text: a[i]! });
        if (b[i] !== undefined) out.push({ type: "add", text: b[i]! });
      }
    }
    return out;
  }, [diffA, diffB]);

  const [r, g, b] = hexToRgb(hexColor);
  const [h, s, l] = rgbToHsl(r, g, b);

  return (
    <div className="flex w-full h-full bg-[#090b12]/96 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-48 shrink-0 bg-black/35 border-r border-white/10 p-2.5 space-y-1">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          const active = tool === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTool(t.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition ${
                active
                  ? "bg-violet-500/22 border border-violet-400/35 text-white"
                  : "text-zinc-400 hover:bg-white/6 hover:text-zinc-100"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </aside>

      {/* Main Tool Workspace */}
      <div className="flex-1 min-w-0 overflow-y-auto p-4 space-y-4">
        {tool === "json" && (
          <div className="space-y-3 h-full flex flex-col">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">JSON Formatter &amp; Validator</h2>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    try {
                      setJsonOut(JSON.stringify(JSON.parse(jsonIn), null, 2));
                      setJsonErr(null);
                    } catch (e) {
                      setJsonErr(e instanceof Error ? e.message : String(e));
                    }
                  }}
                  className="px-3 py-1 rounded-lg text-xs bg-violet-600 hover:bg-violet-500 text-white"
                >
                  Prettify
                </button>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      setJsonOut(JSON.stringify(JSON.parse(jsonIn)));
                      setJsonErr(null);
                    } catch (e) {
                      setJsonErr(e instanceof Error ? e.message : String(e));
                    }
                  }}
                  className="px-3 py-1 rounded-lg text-xs bg-white/10 hover:bg-white/15 text-zinc-200"
                >
                  Minify
                </button>
                {jsonOut && (
                  <button
                    type="button"
                    onClick={() => copyText(jsonOut, "JSON")}
                    className="p-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-zinc-300"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            {jsonErr && (
              <div className="p-2.5 rounded-xl bg-rose-500/12 border border-rose-400/30 text-xs font-mono text-rose-200">
                {jsonErr}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 min-h-[300px]">
              <textarea
                value={jsonIn}
                onChange={(e) => setJsonIn(e.target.value)}
                spellCheck={false}
                className="p-3 rounded-2xl bg-black/50 border border-white/10 font-mono text-xs text-zinc-100 outline-none resize-none"
              />
              <pre className="p-3 rounded-2xl bg-black/60 border border-white/10 font-mono text-xs text-emerald-300 overflow-auto whitespace-pre-wrap select-text">
                {jsonOut || "Click Prettify or Minify..."}
              </pre>
            </div>
          </div>
        )}

        {tool === "jwt" && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-white">JWT Inspector</h2>
            <textarea
              value={jwtIn}
              onChange={(e) => setJwtIn(e.target.value)}
              rows={3}
              spellCheck={false}
              className="w-full p-3 rounded-2xl bg-black/50 border border-white/10 font-mono text-xs text-amber-200 outline-none resize-none"
            />
            {jwtDecoded.error ? (
              <div className="p-3 rounded-xl bg-rose-500/12 border border-rose-400/30 text-xs text-rose-200">
                {jwtDecoded.error}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1.5">
                  <div className="text-[10px] font-mono uppercase text-rose-300">Header</div>
                  <pre className="text-xs font-mono text-zinc-200 overflow-auto select-text">{jwtDecoded.header}</pre>
                </div>
                <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1.5">
                  <div className="text-[10px] font-mono uppercase text-violet-300">Payload</div>
                  <pre className="text-xs font-mono text-emerald-300 overflow-auto select-text">{jwtDecoded.payload}</pre>
                </div>
              </div>
            )}
          </div>
        )}

        {tool === "base64" && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-white">Base64 &amp; URL Codec</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400">Plain Text</label>
                <textarea
                  value={b64Plain}
                  onChange={(e) => {
                    const v = e.target.value;
                    setB64Plain(v);
                    try {
                      const bytes = new TextEncoder().encode(v);
                      setB64Encoded(btoa(String.fromCharCode(...bytes)));
                    } catch {
                      // ignore
                    }
                  }}
                  rows={5}
                  className="w-full p-3 rounded-2xl bg-black/50 border border-white/10 font-mono text-xs text-zinc-100 outline-none"
                />
                <div className="text-[11px] font-mono text-cyan-300 break-all p-2 rounded-xl bg-white/[0.03] border border-white/8">
                  URL: {encodeURIComponent(b64Plain)}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400">Base64</label>
                <textarea
                  value={b64Encoded}
                  onChange={(e) => {
                    const v = e.target.value;
                    setB64Encoded(v);
                    try {
                      const bin = atob(v.trim());
                      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
                      setB64Plain(new TextDecoder().decode(bytes));
                    } catch {
                      // ignore invalid b64 while typing
                    }
                  }}
                  rows={5}
                  className="w-full p-3 rounded-2xl bg-black/50 border border-white/10 font-mono text-xs text-emerald-300 outline-none"
                />
                <button
                  type="button"
                  onClick={() => copyText(b64Encoded, "Base64")}
                  className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-zinc-200"
                >
                  Copy Base64
                </button>
              </div>
            </div>
          </div>
        )}

        {tool === "regex" && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-white">Live RegExp Tester</h2>
            <div className="flex gap-2">
              <input
                value={regexPat}
                onChange={(e) => setRegexPat(e.target.value)}
                placeholder="Pattern..."
                className="flex-1 px-3 py-2 rounded-xl bg-black/50 border border-white/12 font-mono text-xs text-cyan-300 outline-none"
              />
              <input
                value={regexFlags}
                onChange={(e) => setRegexFlags(e.target.value)}
                placeholder="gim"
                className="w-20 px-3 py-2 rounded-xl bg-black/50 border border-white/12 font-mono text-xs text-amber-300 outline-none"
              />
            </div>
            <textarea
              value={regexSample}
              onChange={(e) => setRegexSample(e.target.value)}
              rows={5}
              className="w-full p-3 rounded-2xl bg-black/50 border border-white/10 font-mono text-xs text-zinc-100 outline-none"
            />
            {regexMatches.error ? (
              <div className="p-2.5 rounded-xl bg-rose-500/12 border border-rose-400/30 text-xs text-rose-200">
                {regexMatches.error}
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="text-xs text-emerald-300 font-mono">
                  {regexMatches.list.length} match(es)
                </div>
                {regexMatches.list.map((m, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/8 text-xs font-mono"
                  >
                    <span className="text-white">{m.match}</span>
                    <span className="text-zinc-500">
                      idx:{m.index} {m.groups.length > 0 ? `· groups: [${m.groups.join(", ")}]` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tool === "crypto" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">UUID v4 &amp; WebCrypto SHA Hashing</h2>
              <button
                type="button"
                onClick={() => setUuids(Array.from({ length: 5 }, () => crypto.randomUUID()))}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs text-white"
              >
                <RefreshCw className="w-3 h-3" />
                Regenerate
              </button>
            </div>
            <div className="space-y-1.5">
              {uuids.map((u) => (
                <div
                  key={u}
                  className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/8 font-mono text-xs text-cyan-200"
                >
                  <span>{u}</span>
                  <button
                    type="button"
                    onClick={() => copyText(u, "UUID")}
                    className="p-1 text-zinc-400 hover:text-white"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="space-y-2 pt-2 border-t border-white/10">
              <label className="text-xs text-zinc-300">Hash Input</label>
              <input
                value={hashInput}
                onChange={(e) => setHashInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/12 font-mono text-xs text-zinc-100 outline-none"
              />
              <div className="p-3 rounded-xl bg-black/45 border border-white/8 space-y-2 font-mono text-[11px]">
                <div>
                  <span className="text-zinc-500">SHA-256: </span>
                  <span className="text-emerald-300 break-all select-text">{sha256}</span>
                </div>
                <div>
                  <span className="text-zinc-500">SHA-512: </span>
                  <span className="text-violet-300 break-all select-text">{sha512}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {tool === "color" && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-white">Color &amp; Glass Surface Swatch</h2>
            <div className="flex items-center gap-4">
              <input
                type="color"
                value={hexColor}
                onChange={(e) => setHexColor(e.target.value)}
                className="w-20 h-20 rounded-2xl bg-transparent cursor-pointer border-0"
              />
              <div className="space-y-2 font-mono text-xs flex-1">
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10">
                  <span>HEX: {hexColor.toUpperCase()}</span>
                  <button type="button" onClick={() => copyText(hexColor, "HEX")} className="text-zinc-400 hover:text-white"><Copy className="w-3.5 h-3.5" /></button>
                </div>
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10">
                  <span>RGB: rgb({r}, {g}, {b})</span>
                  <button type="button" onClick={() => copyText(`rgb(${r}, ${g}, ${b})`, "RGB")} className="text-zinc-400 hover:text-white"><Copy className="w-3.5 h-3.5" /></button>
                </div>
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10">
                  <span>HSL: hsl({h}, {s}%, {l}%)</span>
                  <button type="button" onClick={() => copyText(`hsl(${h}, ${s}%, ${l}%)`, "HSL")} className="text-zinc-400 hover:text-white"><Copy className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
            <div
              className="p-5 rounded-2xl border text-xs font-medium text-white"
              style={{
                background: `rgba(${r}, ${g}, ${b}, 0.22)`,
                borderColor: `rgba(${r}, ${g}, ${b}, 0.55)`,
                boxShadow: `0 12px 35px rgba(${r}, ${g}, ${b}, 0.28)`,
              }}
            >
              Glass Card Preview · rgba({r}, {g}, {b}, 0.22)
            </div>
          </div>
        )}

        {tool === "diff" && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-white">Line Diff Comparator</h2>
            <div className="grid grid-cols-2 gap-3">
              <textarea
                value={diffA}
                onChange={(e) => setDiffA(e.target.value)}
                rows={5}
                className="p-3 rounded-2xl bg-black/50 border border-white/10 font-mono text-xs text-zinc-200 outline-none"
              />
              <textarea
                value={diffB}
                onChange={(e) => setDiffB(e.target.value)}
                rows={5}
                className="p-3 rounded-2xl bg-black/50 border border-white/10 font-mono text-xs text-zinc-200 outline-none"
              />
            </div>
            <div className="rounded-2xl bg-black/60 border border-white/10 p-3 font-mono text-xs space-y-0.5">
              {diffLines.map((l, i) => (
                <div
                  key={i}
                  className={
                    l.type === "add"
                      ? "bg-emerald-500/15 text-emerald-300 px-2 rounded"
                      : l.type === "del"
                      ? "bg-rose-500/15 text-rose-300 px-2 rounded"
                      : "text-zinc-400 px-2"
                  }
                >
                  {l.type === "add" ? "+ " : l.type === "del" ? "- " : "  "}
                  {l.text}
                </div>
              ))}
            </div>
          </div>
        )}

        {tool === "cron" && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-white">Cron Schedule Explorer</h2>
            <input
              value={cronExpr}
              onChange={(e) => setCronExpr(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/15 font-mono text-sm text-cyan-300 outline-none"
            />
            <div className="p-4 rounded-2xl bg-violet-500/12 border border-violet-400/30 text-xs text-white">
              {describeCron(cronExpr)}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                ["Every 5 min", "*/5 * * * *"],
                ["Hourly", "0 * * * *"],
                ["Daily 09:00", "0 9 * * *"],
                ["Weekdays 08:30", "30 8 * * 1-5"],
                ["Weekly Sun 00:00", "0 0 * * 0"],
              ].map(([label, expr]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setCronExpr(expr!)}
                  className="px-2.5 py-1 rounded-full bg-white/8 hover:bg-white/15 text-[11px] text-zinc-200 transition"
                >
                  {label} <code className="text-zinc-400 ml-1">{expr}</code>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
