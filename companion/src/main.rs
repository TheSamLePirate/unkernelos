mod broker;
mod cli;
mod mcp;
mod server;
#[cfg(feature = "gui")]
mod ui;
mod wisp;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::{path::PathBuf, sync::Arc};
use uuid::Uuid;

#[derive(Clone, Serialize, Deserialize)]
pub struct Connection {
    pub url: String,
    pub token: String,
}
pub fn support_dir() -> PathBuf {
    std::env::var_os("UNKERNELOS_COMPANION_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(std::env::var_os("HOME").expect("HOME"))
                .join("Library/Application Support/unkernelOS Companion")
        })
}
pub fn descriptor() -> PathBuf {
    support_dir().join("connection.json")
}
pub fn save_connection(c: &Connection) -> Result<()> {
    use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
    let dir = support_dir();
    std::fs::create_dir_all(&dir)?;
    std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700))?;
    let tmp = dir.join(format!(".connection-{}", Uuid::new_v4()));
    let mut f = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(&tmp)?;
    use std::io::Write;
    f.write_all(&serde_json::to_vec(c)?)?;
    f.sync_all()?;
    std::fs::rename(tmp, descriptor())?;
    Ok(())
}
pub fn read_connection() -> Result<Connection> {
    serde_json::from_slice(
        &std::fs::read(descriptor()).context("Start unkernelOS Companion first")?,
    )
    .context("Invalid companion connection file")
}
pub fn token() -> String {
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}
pub struct App {
    pub broker: broker::Shared,
    pub connection: std::sync::RwLock<Connection>,
    pub cookie: String,
    pub web: PathBuf,
    pub distros: PathBuf,
}
impl App {
    pub fn rotate(&self) -> Result<()> {
        let mut c = self.connection.write().unwrap();
        let next = Connection {
            url: c.url.clone(),
            token: token(),
        };
        save_connection(&next)?;
        *c = next;
        self.broker.revoke();
        Ok(())
    }
    pub fn url(&self) -> String {
        self.connection.read().unwrap().url.clone()
    }
}
fn assets() -> PathBuf {
    let exe = std::env::current_exe().unwrap();
    let bundle = exe.parent().unwrap().join("../Resources/web");
    if bundle.join("index.html").exists() {
        bundle
    } else {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../dist")
    }
}
fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;
    if cli::handles(&args) {
        if let Err(e) = rt.block_on(cli::run(&args)) {
            eprintln!("{}", serde_json::json!({"ok":false,"error":e.to_string()}));
            std::process::exit(1);
        }
        return Ok(());
    }
    if args.get(1).is_some_and(|s| s == "mcp") {
        return rt.block_on(mcp::stdio());
    }
    let port: u16 = std::env::var("UNKERNELOS_COMPANION_PORT")
        .unwrap_or_else(|_| "17891".into())
        .parse()?;
    let web = std::env::var_os("UNKERNELOS_COMPANION_WEB")
        .map(PathBuf::from)
        .unwrap_or_else(assets);
    anyhow::ensure!(
        web.join("index.html").exists(),
        "Web assets missing. Run bun run build or scripts/build-companion.sh"
    );
    let bundled = web.parent().unwrap().join("distros");
    let distros = std::env::var_os("UNKERNELOS_COMPANION_DISTROS")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            if bundled.exists() {
                bundled
            } else {
                PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("../.cache/distros/v0.2.0-261124-c08e977")
            }
        });
    let listener = rt
        .block_on(tokio::net::TcpListener::bind((
            std::net::Ipv4Addr::LOCALHOST,
            port,
        )))
        .context("Companion already running, or local port unavailable")?;
    let app = Arc::new(App {
        broker: broker::Broker::new(),
        connection: std::sync::RwLock::new(Connection {
            url: format!("http://127.0.0.1:{port}"),
            token: token(),
        }),
        cookie: token(),
        web,
        distros,
    });
    save_connection(&app.connection.read().unwrap())?;
    eprintln!("unkernelOS Companion: {}", app.url());
    if args.get(1).is_some_and(|s| s == "serve") {
        rt.block_on(server::run(listener, app))?;
    } else {
        let task = rt.spawn(server::run(listener, app.clone()));
        #[cfg(feature = "gui")]
        ui::run(app);
        #[cfg(not(feature = "gui"))]
        rt.block_on(async {
            task.await??;
            Ok::<(), anyhow::Error>(())
        })?;
        #[cfg(feature = "gui")]
        task.abort();
    }
    Ok(())
}
