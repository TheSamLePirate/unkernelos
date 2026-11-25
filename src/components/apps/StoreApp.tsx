import { Effect } from "effect";
import {
  CheckCircle2,
  Code2,
  Download,
  FolderPlus,
  Loader2,
  Package,
  Play,
  Search,
  Sparkles,
  Store,
  Terminal,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { dynamicAppsStore, useDynamicApps } from "../../core/dynamic-apps-store.ts";
import {
  appRuntime,
  GuestFsService,
  ToolchainService,
  useSubscriptionRef,
} from "../../core/runtime.ts";
import {
  TOOLCHAIN_SPECS,
  type ToolId,
  type ToolchainSnapshot,
} from "../../core/toolchain-service.ts";
import { wmStore } from "../../wm/wm-store.ts";
import runeCargoToml from "../../../rune-apps/liquid-metal-settings/Cargo.toml?raw";
import runeToolchainToml from "../../../rune-apps/liquid-metal-settings/rust-toolchain.toml?raw";
import runeGfxRs from "../../../rune-apps/liquid-metal-settings/src/gfx.rs?raw";
import runeLibRs from "../../../rune-apps/liquid-metal-settings/src/lib.rs?raw";
import runeMainRs from "../../../rune-apps/liquid-metal-settings/src/main.rs?raw";

interface StoreWebApp {
  readonly id: string;
  readonly title: string;
  readonly shortTitle: string;
  readonly emoji: string;
  readonly accent: string;
  readonly category: string;
  readonly description: string;
  readonly html: string;
}

interface ProjectStarter {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly lang: "Rust" | "OCaml" | "Python" | "Bun / TS";
  readonly badgeClass: string;
  readonly description: string;
  readonly runCmd: string;
  readonly entryFile: string;
  readonly files: Record<string, string>;
}

const BASE_DARK_CSS = `*{box-sizing:border-box}body{margin:0;background:#0a0d16;color:#e4e4e7;font-family:system-ui,-apple-system,sans-serif;padding:16px}button{cursor:pointer;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.08);color:#fff;border-radius:10px;padding:6px 12px;font-size:12px}button:hover{background:rgba(255,255,255,.16)}input,textarea{background:#05070e;color:#f4f4f5;border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:8px 10px;font-size:12px;outline:none}input:focus,textarea:focus{border-color:#22d3ee}`;

const STORE_WEB_APPS: readonly StoreWebApp[] = [
  {
    id: "store-kanban",
    title: "Kanban Sprint Board",
    shortTitle: "Kanban",
    emoji: "🗂️",
    accent: "from-violet-500 to-fuchsia-600",
    category: "Productivity",
    description: "Interactive 3-column task board (Todo · Doing · Done) saved persistently in browser storage.",
    html: `<!doctype html><html><head><style>${BASE_DARK_CSS}.cols{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:12px}.col{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:10px;min-height:360px}.card{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:8px 10px;margin-top:8px;font-size:12px}.row{display:flex;gap:6px;margin-top:6px}</style></head><body>
<div style="display:flex;gap:8px;align-items:center"><input id="inp" placeholder="Add new task..." style="flex:1"/><button id="add" style="background:linear-gradient(90deg,#7c3aed,#06b6d4);border:0">+ Add Task</button></div>
<div class="cols" id="board"></div>
<script>
const KEY='unkernelos:kanban:v1';
const COLS=[['todo','To Do'],['doing','In Progress'],['done','Done']];
let tasks=JSON.parse(localStorage.getItem(KEY)||'null')||[
  {id:1,text:'Compile Rust aarch64 service',col:'todo'},
  {id:2,text:'Build OCaml AST evaluator',col:'doing'},
  {id:3,text:'Run Matplotlib FFT notebook',col:'done'}
];
function save(){localStorage.setItem(KEY,JSON.stringify(tasks));render();}
function render(){
  const b=document.getElementById('board');b.innerHTML='';
  for(const [cid,label] of COLS){
    const div=document.createElement('div');div.className='col';
    const items=tasks.filter(t=>t.col===cid);
    div.innerHTML='<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#a1a1aa">'+label+' ('+items.length+')</div>';
    for(const t of items){
      const c=document.createElement('div');c.className='card';
      c.innerHTML='<div>'+t.text.replace(/</g,'&lt;')+'</div><div class="row">'+(cid!=='todo'?'<button data-m="prev">←</button>':'')+(cid!=='done'?'<button data-m="next">→</button>':'')+'<button data-m="del" style="margin-left:auto;color:#fda4af">×</button></div>';
      c.onclick=(e)=>{const m=e.target.dataset.m;if(!m)return;const order=['todo','doing','done'];const i=order.indexOf(t.col);if(m==='prev')t.col=order[i-1];if(m==='next')t.col=order[i+1];if(m==='del')tasks=tasks.filter(x=>x.id!==t.id);save();};
      div.appendChild(c);
    }
    b.appendChild(div);
  }
}
document.getElementById('add').onclick=()=>{const v=document.getElementById('inp').value.trim();if(!v)return;tasks.unshift({id:Date.now(),text:v,col:'todo'});document.getElementById('inp').value='';save();};
document.getElementById('inp').onkeydown=(e)=>{if(e.key==='Enter')document.getElementById('add').click();};
render();
</script></body></html>`,
  },
  {
    id: "store-slides",
    title: "Markdown Slide Deck",
    shortTitle: "Slides",
    emoji: "🎞️",
    accent: "from-cyan-500 to-blue-600",
    category: "Creative",
    description: "Write slides separated by --- in Markdown and present with keyboard arrow navigation.",
    html: `<!doctype html><html><head><style>${BASE_DARK_CSS}.wrap{display:grid;grid-template-columns:1fr 1.4fr;gap:12px;height:calc(100vh - 32px)}textarea{width:100%;height:100%;font-family:ui-monospace,monospace;resize:none}.stage{display:flex;flex-direction:column;background:radial-gradient(circle at top right,#1e1b4b,#090d16);border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:24px}.content{flex:1;display:flex;flex-direction:column;justify-content:center;gap:10px}h1{margin:0;font-size:28px;background:linear-gradient(90deg,#67e8f9,#c084fc);-webkit-background-clip:text;color:transparent}p,li{font-size:15px;color:#d4d4d8;line-height:1.5}</style></head><body>
<div class="wrap"><textarea id="src"># unkernelOS
The Agent-Native Linux WebOS in your browser

---
# Rust + OCaml + Science
- Native aarch64 rustc & cargo
- OCaml + Dune functional toolchain
- Python NumPy & Matplotlib notebooks

---
# Live Preview & Agent API
Everything controllable via osctl & MCP.</textarea>
<div class="stage"><div class="content" id="out"></div><div style="display:flex;justify-content:space-between;align-items:center"><button id="prev">← Prev</button><span id="idx" style="font-size:12px;color:#94a3b8"></span><button id="next">Next →</button></div></div></div>
<script>
let i=0;const src=document.getElementById('src'),out=document.getElementById('out'),idx=document.getElementById('idx');
function slides(){return src.value.split(/^---$/m).map(s=>s.trim()).filter(Boolean);}
function render(){const s=slides();i=Math.max(0,Math.min(i,s.length-1));const html=(s[i]||'').split('\\n').map(l=>{if(l.startsWith('# '))return '<h1>'+l.slice(2)+'</h1>';if(l.startsWith('- '))return '<li>'+l.slice(2)+'</li>';return '<p>'+l+'</p>';}).join('');out.innerHTML=html;idx.textContent=(i+1)+' / '+s.length;}
src.oninput=render;document.getElementById('prev').onclick=()=>{i--;render();};document.getElementById('next').onclick=()=>{i++;render();};
window.onkeydown=(e)=>{if(document.activeElement===src)return;if(e.key==='ArrowRight'){i++;render();}if(e.key==='ArrowLeft'){i--;render();}};render();
</script></body></html>`,
  },
  {
    id: "store-csv-viz",
    title: "CSV & Data Visualizer",
    shortTitle: "CSV Lab",
    emoji: "📊",
    accent: "from-emerald-400 to-teal-600",
    category: "Science",
    description: "Paste CSV datasets to compute live stats (min/max/mean) and render instant bar charts.",
    html: `<!doctype html><html><head><style>${BASE_DARK_CSS}textarea{width:100%;height:110px;font-family:ui-monospace,monospace}.bars{display:flex;align-items:flex-end;gap:8px;height:160px;padding:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);border-radius:14px;margin-top:12px}.bar{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end}.fill{width:100%;border-radius:8px 8px 2px 2px;background:linear-gradient(180deg,#22d3ee,#8b5cf6)}table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}th,td{padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left}</style></head><body>
<textarea id="csv">language,speed_score,safety_score
Rust,99,98
OCaml,91,96
Bun,88,82
Python,74,85
SQLite,95,92</textarea>
<div id="stats" style="margin-top:8px;font-size:12px;color:#67e8f9"></div>
<div class="bars" id="bars"></div><div id="tbl"></div>
<script>
const ta=document.getElementById('csv');
function render(){
  const lines=ta.value.trim().split(/\\r?\\n/).map(l=>l.split(',').map(x=>x.trim()));
  if(lines.length<2)return;
  const hdr=lines[0],rows=lines.slice(1);
  const nums=rows.map(r=>parseFloat(r[1])).filter(n=>!isNaN(n));
  const max=Math.max(1,...nums),avg=(nums.reduce((a,b)=>a+b,0)/(nums.length||1)).toFixed(2);
  document.getElementById('stats').textContent='Rows: '+rows.length+' · Column ['+hdr[1]+'] Min: '+Math.min(...nums)+' · Max: '+max+' · Mean: '+avg;
  document.getElementById('bars').innerHTML=rows.map(r=>{const v=parseFloat(r[1])||0;const h=Math.max(4,Math.round((v/max)*100));return '<div class="bar"><div style="font-size:10px;color:#a1a1aa">'+v+'</div><div class="fill" style="height:'+h+'%"></div><div style="font-size:10px;color:#e4e4e7">'+r[0]+'</div></div>';}).join('');
  document.getElementById('tbl').innerHTML='<table><thead><tr>'+hdr.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
}
ta.oninput=render;render();
</script></body></html>`,
  },
  {
    id: "store-diff-viewer",
    title: "Side-by-Side Diff Studio",
    shortTitle: "Diff",
    emoji: "⚖️",
    accent: "from-amber-400 to-orange-600",
    category: "Developer",
    description: "Compare two code snippets or configs line-by-line with live additions/removals highlight.",
    html: `<!doctype html><html><head><style>${BASE_DARK_CSS}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}textarea{width:100%;height:150px;font-family:ui-monospace,monospace}.out{margin-top:12px;background:#05070e;border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:10px;font-family:ui-monospace,monospace;font-size:12px;max-height:260px;overflow:auto}.add{background:rgba(16,185,129,.18);color:#6ee7b7}.del{background:rgba(244,63,94,.18);color:#fda4af}.eq{color:#a1a1aa}</style></head><body>
<div class="grid"><textarea id="a">fn main() {
    println!("v1");
    let x = 41;
}</textarea><textarea id="b">fn main() {
    println!("v2 — unkernelOS");
    let x = 42;
    println!("{x}");
}</textarea></div><div class="out" id="out"></div>
<script>
const a=document.getElementById('a'),b=document.getElementById('b'),out=document.getElementById('out');
function render(){
  const la=a.value.split('\\n'),lb=b.value.split('\\n'),n=Math.max(la.length,lb.length);let html='';
  for(let i=0;i<n;i++){
    if(la[i]===lb[i])html+='<div class="eq">  '+(la[i]||'').replace(/</g,'&lt;')+'</div>';
    else{if(la[i]!==undefined)html+='<div class="del">- '+la[i].replace(/</g,'&lt;')+'</div>';if(lb[i]!==undefined)html+='<div class="add">+ '+lb[i].replace(/</g,'&lt;')+'</div>';}
  }
  out.innerHTML=html;
}
a.oninput=b.oninput=render;render();
</script></body></html>`,
  },
  {
    id: "store-regex-lab",
    title: "Regex & Capture Lab",
    shortTitle: "Regex",
    emoji: "🔍",
    accent: "from-pink-500 to-rose-600",
    category: "Developer",
    description: "Live regular expression tester with match highlighting & capture group inspection.",
    html: `<!doctype html><html><head><style>${BASE_DARK_CSS}mark{background:rgba(34,211,238,.32);color:#fff;border-radius:4px;padding:0 2px}.box{background:#05070e;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:12px;margin-top:10px;font-family:ui-monospace,monospace;font-size:12px;white-space:pre-wrap}</style></head><body>
<div style="display:flex;gap:8px"><input id="pat" value="([a-z]+):(\\d+)" style="flex:1;font-family:ui-monospace,monospace"/><input id="flg" value="g" style="width:64px;font-family:ui-monospace,monospace"/></div>
<textarea id="txt" style="width:100%;height:110px;margin-top:10px;font-family:ui-monospace,monospace">services: rust:8080, bun:3000, python:8000, ocaml:9000</textarea>
<div class="box" id="hi"></div><div class="box" id="grp" style="color:#a5f3fc"></div>
<script>
const pat=document.getElementById('pat'),flg=document.getElementById('flg'),txt=document.getElementById('txt'),hi=document.getElementById('hi'),grp=document.getElementById('grp');
function run(){try{const r=new RegExp(pat.value,flg.value);const s=txt.value;hi.innerHTML=s.replace(r,m=>'<mark>'+m.replace(/</g,'&lt;')+'</mark>');const all=[...s.matchAll(new RegExp(pat.value,flg.value.includes('g')?flg.value:flg.value+'g'))];grp.textContent=all.length+' match(es)\\n'+all.map((m,i)=>'#'+(i+1)+' '+JSON.stringify(Array.from(m))).join('\\n');}catch(e){grp.textContent='Error: '+e.message;}}
pat.oninput=flg.oninput=txt.oninput=run;run();
</script></body></html>`,
  },
];

const PROJECT_STARTERS: readonly ProjectStarter[] = [
  {
    id: "starter-rust-rune-liquid",
    slug: "rune-liquid-settings",
    title: "Rust Rune — Liquid Metal GPU App",
    lang: "Rust",
    badgeClass: "bg-cyan-500/20 text-cyan-200 border-cyan-400/35",
    description: "App GUI Rust native propulsée par anomalyco/rune + rune-fx (Liquid Metal shaders, WebGPU/WebGL2 & Wayland).",
    runCmd: "rune-web-build . ./dist",
    entryFile: "src/lib.rs",
    files: {
      "Cargo.toml": runeCargoToml,
      "rust-toolchain.toml": runeToolchainToml,
      "src/gfx.rs": runeGfxRs,
      "src/lib.rs": runeLibRs,
      "src/main.rs": runeMainRs,
    },
  },
  {
    id: "starter-rust-cli",
    slug: "rust-systems-lab",
    title: "Rust Cargo CLI & Benchmark",
    lang: "Rust",
    badgeClass: "bg-orange-500/20 text-orange-300 border-orange-400/35",
    description: "Full Cargo project with unit tests, prime sieve benchmark & release profile.",
    runCmd: "cargo test && cargo run",
    entryFile: "src/main.rs",
    files: {
      "Cargo.toml": `[package]
name = "rust-systems-lab"
version = "0.1.0"
edition = "2021"
`,
      "src/main.rs": `use std::time::Instant;

fn fibonacci(n: u64) -> u128 {
    let (mut a, mut b) = (0u128, 1u128);
    for _ in 0..n {
        let next = a + b;
        a = b;
        b = next;
    }
    a
}

fn main() {
    let t0 = Instant::now();
    println!("🦀 Rust native aarch64 running inside unkernelOS!");
    for n in [10, 25, 50, 80] {
        println!("  fib({n:2}) = {}", fibonacci(n));
    }
    println!("Completed in {:.2?}", t0.elapsed());
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_fib() {
        assert_eq!(fibonacci(10), 55);
        assert_eq!(fibonacci(20), 6765);
    }
}
`,
      "README.md": "# Rust Systems Lab\nRun with `cargo run` or `cargo test`.\n",
    },
  },
  {
    id: "starter-rust-http",
    slug: "rust-http-api",
    title: "Rust Zero-Dep HTTP JSON Server",
    lang: "Rust",
    badgeClass: "bg-orange-500/20 text-orange-300 border-orange-400/35",
    description: "Pure std::net::TcpListener JSON API on :8080 — zero crate downloads, instant live preview!",
    runCmd: "cargo run",
    entryFile: "src/main.rs",
    files: {
      "Cargo.toml": `[package]
name = "rust-http-api"
version = "0.1.0"
edition = "2021"
`,
      "src/main.rs": `use std::io::{Read, Write};
use std::net::TcpListener;

fn main() {
    let addr = "0.0.0.0:8080";
    let listener = TcpListener::bind(addr).expect("bind :8080");
    println!("🦀 Rust HTTP JSON Server listening on http://{addr}");
    for stream in listener.incoming().flatten() {
        let mut s = stream;
        let mut buf = [0u8; 1024];
        let n = s.read(&mut buf).unwrap_or(0);
        let req = String::from_utf8_lossy(&buf[..n]);
        let path = req.lines().next().and_then(|l| l.split_whitespace().nth(1)).unwrap_or("/");
        let body = format!(
            "{{\\"ok\\":true,\\"runtime\\":\\"Rust std::net (aarch64)\\",\\"path\\":\\"{path}\\"}}"
        );
        let resp = format!(
            "HTTP/1.1 200 OK\\r\\nContent-Type: application/json\\r\\nAccess-Control-Allow-Origin: *\\r\\nContent-Length: {}\\r\\nConnection: close\\r\\n\\r\\n{}",
            body.len(),
            body
        );
        let _ = s.write_all(resp.as_bytes());
    }
}
`,
    },
  },
  {
    id: "starter-ocaml-dune",
    slug: "ocaml-dune-lab",
    title: "OCaml + Dune Functional Project",
    lang: "OCaml",
    badgeClass: "bg-amber-500/20 text-amber-300 border-amber-400/35",
    description: "Structured Dune library + executable with algebraic data types & expression evaluator.",
    runCmd: "dune build && dune exec ./bin/main.exe",
    entryFile: "bin/main.ml",
    files: {
      "dune-project": `(lang dune 3.0)
(name ocaml_dune_lab)
`,
      "lib/dune": `(library
 (name eval_lib))
`,
      "lib/eval.ml": `type expr =
  | Num of float
  | Add of expr * expr
  | Mul of expr * expr
  | Pow of expr * int

let rec eval = function
  | Num x -> x
  | Add (a, b) -> eval a +. eval b
  | Mul (a, b) -> eval a *. eval b
  | Pow (a, n) -> Float.pow (eval a) (float_of_int n)

let rec format = function
  | Num x -> Printf.sprintf "%g" x
  | Add (a, b) -> Printf.sprintf "(%s + %s)" (format a) (format b)
  | Mul (a, b) -> Printf.sprintf "(%s * %s)" (format a) (format b)
  | Pow (a, n) -> Printf.sprintf "(%s^%d)" (format a) n
`,
      "bin/dune": `(executable
 (name main)
 (libraries eval_lib))
`,
      "bin/main.ml": `open Eval_lib.Eval

let () =
  let formula = Add (Mul (Num 3., Pow (Num 4., 2)), Num 7.) in
  Printf.printf "🐫 OCaml + Dune native project on unkernelOS!\\n";
  Printf.printf "Formula: %s = %g\\n" (format formula) (eval formula)
`,
    },
  },
  {
    id: "starter-py-science",
    slug: "python-science-lab",
    title: "Python Data Science & Charts",
    lang: "Python",
    badgeClass: "bg-emerald-500/20 text-emerald-300 border-emerald-400/35",
    description: "NumPy + Matplotlib script generating a dark-theme PNG chart + summary report.",
    runCmd: "python3 analyze.py",
    entryFile: "analyze.py",
    files: {
      "analyze.py": `import math
try:
    import numpy as np
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    x = np.linspace(0, 10, 300)
    y = np.sin(x) * np.exp(-0.15 * x)
    print(f"Samples: {len(x)} | Mean: {y.mean():.4f} | Max: {y.max():.4f}")

    plt.style.use("dark_background")
    fig, ax = plt.subplots(figsize=(7, 3.5), dpi=140)
    ax.plot(x, y, color="#22d3ee", lw=2)
    ax.fill_between(x, y, alpha=0.18, color="#22d3ee")
    ax.set_title("unkernelOS Scientific Analysis")
    ax.grid(alpha=0.2)
    fig.savefig("chart.png", bbox_inches="tight")
    print("Saved chart.png — open it in File Explorer or Media Studio!")
except ImportError as e:
    print("Install Python Science in Store/Toolchain for Matplotlib:", e)
    print("Pure Python sin(1.0) =", math.sin(1.0))
`,
    },
  },
  {
    id: "starter-bun-glass",
    slug: "bun-glass-api",
    title: "Bun + TypeScript Web Server",
    lang: "Bun / TS",
    badgeClass: "bg-sky-500/20 text-sky-300 border-sky-400/35",
    description: "Instant Bun HTTP server serving a futuristic dark UI + JSON API on :3000.",
    runCmd: "bun run server.ts",
    entryFile: "server.ts",
    files: {
      "package.json": JSON.stringify(
        {
          name: "bun-glass-api",
          scripts: { dev: "bun run server.ts" },
        },
        null,
        2
      ),
      "server.ts": `const server = Bun.serve({
  port: 3000,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/api/status") {
      return Response.json({ ok: true, bun: Bun.version, time: new Date().toISOString() });
    }
    return new Response(
      \`<!doctype html><html><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#080b14;color:#fff;font-family:system-ui"><div style="padding:32px;border-radius:20px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.04);text-align:center"><h1 style="margin:0;color:#67e8f9">Bun Glass App</h1><p style="color:#a1a1aa">Running natively inside unkernelOS on port 3000</p><a href="/api/status" style="color:#c084fc">/api/status →</a></div></body></html>\`,
      { headers: { "content-type": "text/html; charset=utf-8" } }
    );
  },
});
console.log(\`🚀 Bun Glass App running on http://127.0.0.1:\${server.port}\`);
`,
    },
  },
];

const EMPTY_TC: ToolchainSnapshot = {
  tools: Object.fromEntries(
    TOOLCHAIN_SPECS.map((t) => [t.id, { id: t.id, status: "unknown", version: null, error: null }])
  ) as ToolchainSnapshot["tools"],
  logs: [],
  busy: false,
};

export const StoreApp: React.FC = () => {
  const installedDynamicApps = useDynamicApps();
  const tc = useSubscriptionRef(
    Effect.map(ToolchainService, (t) => t.stateRef),
    EMPTY_TC
  );
  const [tab, setTab] = useState<"starters" | "apps" | "toolchains">("starters");
  const [query, setQuery] = useState("");
  const [scaffoldingId, setScaffoldingId] = useState<string | null>(null);

  useEffect(() => {
    appRuntime.runFork(Effect.flatMap(ToolchainService, (t) => t.refreshAll()));
  }, []);

  const installWebApp = (app: StoreWebApp) => {
    const def = dynamicAppsStore.install({
      id: app.id,
      title: app.title,
      shortTitle: app.shortTitle,
      description: app.description,
      emoji: app.emoji,
      accent: app.accent,
      html: app.html,
      createdBy: "user",
    });
    wmStore.pushToast("App Installed", `${app.emoji} ${app.title} added to Launcher & ⌘K`, "success");
    wmStore.openDynamicApp(def);
  };

  const scaffoldProject = async (starter: ProjectStarter, openTerminal = false) => {
    setScaffoldingId(starter.id);
    const dir = `/home/user/workspace/${starter.slug}`;
    try {
      const res = await appRuntime.runPromise(
        Effect.either(
          Effect.gen(function* () {
            const fs = yield* GuestFsService;
            yield* fs.mkdir(dir);
            for (const [relPath, content] of Object.entries(starter.files)) {
              const full = `${dir}/${relPath}`;
              const parent = full.split("/").slice(0, -1).join("/");
              yield* fs.mkdir(parent);
              yield* fs.writeFileText(full, content);
            }
          })
        )
      );
      if (res._tag === "Right") {
        wmStore.setWorkspaceDir(dir);
        wmStore.pushToast("Project Created", `${starter.title} → ${dir}`, "success");
        if (openTerminal) {
          wmStore.openTerminalInDir(dir, starter.runCmd, starter.title);
        } else {
          wmStore.openFileInIde(`${dir}/${starter.entryFile}`);
        }
      } else {
        wmStore.pushToast("Scaffold Failed", res.left.message, "error");
      }
    } finally {
      setScaffoldingId(null);
    }
  };

  const installTool = (id: ToolId) => {
    appRuntime.runFork(
      Effect.flatMap(ToolchainService, (t) => t.installTool(id)).pipe(Effect.ignore)
    );
  };

  const q = query.trim().toLowerCase();
  const visibleStarters = PROJECT_STARTERS.filter(
    (s) =>
      !q ||
      s.title.toLowerCase().includes(q) ||
      s.lang.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q)
  );
  const visibleApps = STORE_WEB_APPS.filter(
    (a) =>
      !q ||
      a.title.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q)
  );
  const visibleTools = TOOLCHAIN_SPECS.filter(
    (t) =>
      !q ||
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.id.includes(q)
  );

  return (
    <div className="flex flex-col w-full h-full bg-[#080a11]/96 overflow-hidden">
      {/* Store Hero Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-gradient-to-r from-fuchsia-500/15 via-violet-500/12 to-cyan-500/15 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-fuchsia-500 to-sky-500 flex items-center justify-center shadow">
            <Store className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">unkernelOS Store &amp; Starters</div>
            <div className="text-[11px] text-zinc-400">
              1-click Rust, OCaml, Python Science &amp; Bun starters · WebOS Apps · Linux Toolchains
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-black/50 border border-white/12 w-52">
            <Search className="w-3.5 h-3.5 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Rust, OCaml, apps..."
              className="flex-1 bg-transparent text-xs text-white placeholder:text-zinc-500 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-1.5 px-4 py-2 bg-black/30 border-b border-white/8 shrink-0">
        {(
          [
            ["starters", `Project Starters (${PROJECT_STARTERS.length})`, FolderPlus],
            ["apps", `WebOS Apps (${STORE_WEB_APPS.length})`, Sparkles],
            ["toolchains", `Linux Toolchains (${TOOLCHAIN_SPECS.length})`, Package],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
              tab === id
                ? "bg-white/14 border-white/30 text-white shadow"
                : "bg-white/[0.03] border-white/8 text-zinc-400 hover:text-white"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Catalog Grid */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {tab === "starters" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {visibleStarters.map((s) => {
              const busy = scaffoldingId === s.id;
              return (
                <div
                  key={s.id}
                  className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/20 flex flex-col justify-between gap-3 transition"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-white">{s.title}</span>
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-mono ${s.badgeClass}`}>
                        {s.lang}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">{s.description}</p>
                    <div className="text-[10px] font-mono text-zinc-500">
                      /home/user/workspace/{s.slug} · <span className="text-cyan-400">{s.runCmd}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void scaffoldProject(s, false)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-violet-600 to-cyan-500 text-white hover:brightness-110 disabled:opacity-50 transition"
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Code2 className="w-3.5 h-3.5" />}
                      Create &amp; Open IDE
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void scaffoldProject(s, true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-emerald-500/18 hover:bg-emerald-500/28 border border-emerald-400/35 text-emerald-200 disabled:opacity-50 transition"
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      Create &amp; Run
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "apps" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {visibleApps.map((app) => {
              const existing = installedDynamicApps.find((d) => d.id === app.id);
              return (
                <div
                  key={app.id}
                  className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/20 flex flex-col justify-between gap-3 transition"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${app.accent} flex items-center justify-center text-2xl shadow-lg shrink-0`}
                    >
                      {app.emoji}
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="text-sm font-semibold text-white truncate">{app.title}</div>
                      <span className="inline-block text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/8 text-zinc-300">
                        {app.category}
                      </span>
                      <p className="text-xs text-zinc-400 pt-1 leading-snug">{app.description}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => (existing ? wmStore.openDynamicApp(existing) : installWebApp(app))}
                    className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                      existing
                        ? "bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/35 text-emerald-200"
                        : "bg-gradient-to-r from-fuchsia-600 to-violet-600 text-white hover:brightness-110"
                    }`}
                  >
                    {existing ? <Play className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
                    {existing ? "Open Installed App" : "Install & Launch"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {tab === "toolchains" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {visibleTools.map((spec) => {
              const st = tc.tools[spec.id];
              return (
                <div
                  key={spec.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/10"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white">{spec.name}</span>
                      <span className="text-[10px] font-mono text-zinc-500">{spec.approxSize}</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 truncate">{spec.description}</p>
                    {st?.version && (
                      <p className="text-[10px] font-mono text-emerald-300 truncate">{st.version}</p>
                    )}
                  </div>
                  <div className="shrink-0">
                    {st?.status === "installed" ? (
                      <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-emerald-500/15 border border-emerald-400/30 text-emerald-300">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Ready
                      </span>
                    ) : st?.status === "installing" ? (
                      <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-violet-500/20 border border-violet-400/35 text-violet-200">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Installing
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={tc.busy}
                        onClick={() => installTool(spec.id)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/18 border border-white/15 text-white disabled:opacity-40 transition"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Install
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
