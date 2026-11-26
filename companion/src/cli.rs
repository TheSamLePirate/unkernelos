use crate::mcp::{Backend, Mcp};
use anyhow::{Context, Result, bail};
use serde_json::json;
const HELP: &str = r#"unkernelOS Companion — native app, local Wisp, CLI and MCP

unkernelos-companion                         Open native companion
unkernelos-companion serve                   Run service without UI
unkernelos-companion mcp                     MCP over stdio (stdout = protocol only)
unkernelos-companion status                  Local service and browser sessions
unkernelos-companion sessions                List browser sessions as JSON
unkernelos-companion schema [--session ID]   Complete live OS API schema
unkernelos-companion skills [list]           Discover OS and guest skills
unkernelos-companion skills search QUERY     Search names and descriptions
unkernelos-companion skills read ID_OR_NAME  Load one complete SKILL.md
  Skills options: --scope all|builtin|guest, --root /guest/path (repeatable), --session ID
  Skills discovery never scans the Mac's skill directories.
unkernelos-companion call METHOD [--params JSON | --stdin] [--session ID]
unkernelos-companion METHOD [same options]   Shorthand for call

Examples:
  unkernelos-companion call system.info
  unkernelos-companion call guest.exec --params '{"script":"pwd; uname -a"}'
  unkernelos-companion call horizon.sessions
  unkernelos-companion call horizon.session.read --params '{"windowId":"sonora-…"}'
  printf '%s' '{"path":"/tmp/hello.txt","content":"hello"}' | unkernelos-companion call guest.fs.write --stdin

Outputs one JSON value. Errors: JSON on stderr, exit 1. No automatic retries.
Open a browser OS first. Choose --session when multiple sessions are connected.
All advertised methods, including future app capabilities, use this same CLI.
"#;
pub fn handles(args: &[String]) -> bool {
    args.get(1).is_some_and(|a| {
        !["serve", "mcp"].contains(&a.as_str())
            && !a.starts_with("--snap")
            && !a.starts_with("--tree")
            && !a.starts_with("--script")
            && !a.starts_with("--settle")
            && !a.starts_with("--realtime")
    })
}
pub async fn run(args: &[String]) -> Result<()> {
    let command = args.get(1).map(String::as_str).unwrap_or("help");
    if ["help", "--help", "-h"].contains(&command) {
        print!("{HELP}");
        return Ok(());
    }
    if command == "--version" {
        println!("{}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }
    let mut session = None;
    let mut params = json!({});
    let mut stdin = false;
    let mut i = if command == "call" { 3 } else { 2 };
    let mut skill_read = false;
    if command == "skills" {
        let action = args
            .get(2)
            .filter(|v| !v.starts_with("--"))
            .map(String::as_str)
            .unwrap_or("list");
        if args.get(2).is_some_and(|v| !v.starts_with("--")) {
            i = 3;
        }
        match action {
            "list" => {}
            "search" => {
                params["query"] = json!(args.get(3).context("skills search requires a query")?);
                i = 4;
            }
            "read" => {
                params["id"] = json!(args.get(3).context("skills read requires an id or name")?);
                i = 4;
                skill_read = true;
            }
            _ => bail!("Use skills list, skills search QUERY, or skills read ID"),
        }
    }
    while i < args.len() {
        match args[i].as_str() {
            "--session" => {
                i += 1;
                session = Some(args.get(i).context("--session requires an ID")?.clone());
            }
            "--params" => {
                i += 1;
                params = serde_json::from_str(args.get(i).context("--params requires JSON")?)
                    .context("Invalid JSON params")?;
                anyhow::ensure!(params.is_object(), "params must be a JSON object");
            }
            "--stdin" => stdin = true,
            "--query" | "--scope" if command == "skills" => {
                let key = args[i].trim_start_matches("--");
                i += 1;
                params[key] = json!(args.get(i).context("Skills option needs a value")?);
            }
            "--root" if command == "skills" => {
                i += 1;
                let root = args
                    .get(i)
                    .context("--root requires an absolute guest path")?;
                if params.get("roots").is_none() {
                    params["roots"] = json!([]);
                }
                params["roots"]
                    .as_array_mut()
                    .context("roots must be an array")?
                    .push(json!(root));
            }
            flag => bail!("Unknown option: {flag}"),
        }
        i += 1;
    }
    if stdin {
        use std::io::Read;
        let mut data = String::new();
        std::io::stdin()
            .take(1024 * 1024 + 1)
            .read_to_string(&mut data)?;
        anyhow::ensure!(data.len() <= 1024 * 1024, "Input exceeds 1 MiB");
        params = serde_json::from_str(&data).context("Invalid stdin JSON")?;
        anyhow::ensure!(params.is_object(), "params must be a JSON object");
    }
    let mcp = Mcp(Backend::Remote);
    let result = match command {
        "sessions" => mcp.request("sessions", None).await,
        "status" => mcp.request("status", None).await,
        "skills" => {
            let method = if skill_read {
                "skills.read"
            } else {
                "skills.list"
            };
            mcp.request(
                "call",
                Some(json!({"sessionId":session,"method":method,"params":params})),
            )
            .await
        }
        "schema" => {
            mcp.request("schema", Some(json!({"sessionId":session})))
                .await
        }
        method => {
            let method = if method == "call" {
                args.get(2).context("call requires a method")?.as_str()
            } else {
                method
            };
            mcp.request(
                "call",
                Some(json!({"sessionId":session,"method":method,"params":params})),
            )
            .await
        }
    }
    .map_err(anyhow::Error::msg)?;
    println!("{}", serde_json::to_string_pretty(&result)?);
    Ok(())
}
