use crate::App;
use rune::color::Color;
use rune::{
    App as RuneApp, AppSpec, Cursor, Cx, El, ScrollSpec, TextStyle, Tray, TrayEvent, TrayIcon,
    TrayItem, TraySpec, col, el, row, text,
};
use serde_json::{Value, json};
use std::{
    process::{Command, Stdio},
    sync::{Arc, OnceLock, atomic::Ordering},
    time::Duration,
};
static SERVICE: OnceLock<Arc<App>> = OnceLock::new();
struct State {
    app: Arc<App>,
    tab: usize,
    snapshot: Value,
    sessions: Value,
    note: String,
}
impl Default for State {
    fn default() -> Self {
        let app = SERVICE.get().unwrap().clone();
        Self {
            snapshot: app.broker.snapshot(),
            sessions: app.broker.sessions(),
            app,
            tab: 0,
            note: String::new(),
        }
    }
}
fn c(h: u32) -> Color {
    let ch = |shift: u32| rune::color::srgb_decode(((h >> shift) & 255) as f32 / 255.0);
    Color {
        r: ch(16),
        g: ch(8),
        b: ch(0),
        a: 1.0,
    }
}
fn txt(value: impl Into<String>, size: f32, weight: f32, color: u32) -> El {
    text(value)
        .font(TextStyle::new(size, weight))
        .color(c(color))
}
fn muted(value: impl Into<String>) -> El {
    txt(value, 12.0, 400.0, 0x9ba5b5)
}
fn button(key: &str, label: &str, primary: bool, action: impl Fn(&mut State) + 'static) -> El {
    el().key(key)
        .px(15.0)
        .py(11.0)
        .radius(10.0)
        .fill(c(if primary { 0xe9c78e } else { 0x222b38 }))
        .border(1.0, c(if primary { 0xf6dcae } else { 0x344051 }))
        .hover(c(if primary { 0xf7dbaf } else { 0x2c394b }))
        .cursor(Cursor::Pointer)
        .on_press(action)
        .child(txt(
            label,
            12.0,
            600.0,
            if primary { 0x171b24 } else { 0xe3e9f2 },
        ))
}
fn panel() -> El {
    col()
        .w_full()
        .gap(14.0)
        .padding(22.0)
        .radius(16.0)
        .fill(c(0x161e2a))
        .border(1.0, c(0x2a3544))
}
fn open(app: &App, browser: Option<&str>) -> Result<(), String> {
    let mut cmd = Command::new("/usr/bin/open");
    if let Some(browser) = browser {
        cmd.arg("-a").arg(browser);
    }
    let result = cmd.arg(app.url()).output().map_err(|e| e.to_string())?;
    if result.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&result.stderr).trim().into())
    }
}
fn copy(value: &str) -> Result<(), String> {
    use std::io::Write;
    let mut p = Command::new("/usr/bin/pbcopy")
        .stdin(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    p.stdin
        .take()
        .unwrap()
        .write_all(value.as_bytes())
        .map_err(|e| e.to_string())?;
    if p.wait().map_err(|e| e.to_string())?.success() {
        Ok(())
    } else {
        Err("Copie indisponible".into())
    }
}
fn copied(s: &mut State, value: String) {
    s.note = match copy(&value) {
        Ok(()) => "Copié dans le presse-papiers du Mac.".into(),
        Err(e) => e,
    };
}
fn exe() -> String {
    std::env::current_exe().unwrap().display().to_string()
}
fn shell_quote(v: &str) -> String {
    format!("'{}'", v.replace('\'', "'\\''"))
}
fn overview(s: &State) -> El {
    let n = s.sessions.as_array().map_or(0, Vec::len);
    let status = if n == 0 {
        "Votre desktop, à portée du Mac."
    } else {
        "Le Mac et votre OS sont connectés."
    };
    let mut sessions = col().gap(10.0).w_full();
    if n == 0 {
        sessions = sessions
            .child(txt("Aucune session ouverte", 15.0, 550.0, 0xe4eaf3))
            .child(muted(
                "Ouvrez unkernelOS dans votre navigateur pour démarrer la VM.",
            ));
    }
    for session in s.sessions.as_array().unwrap_or(&vec![]) {
        let id = session["id"].as_str().unwrap_or("");
        let info = &session["info"];
        let ua = info["browser"].as_str().unwrap_or("");
        let browser = if ua.contains("Chrome") {
            "Chromium"
        } else if ua.contains("Safari") {
            "Safari"
        } else {
            "Navigateur"
        };
        sessions = sessions.child(
            row()
                .w_full()
                .center_y()
                .gap(12.0)
                .child(el().size(8.0, 8.0).radius(4.0).fill(c(0x8ee0ba)))
                .child(
                    col()
                        .grow(1.0)
                        .gap(5.0)
                        .child(txt(
                            format!(
                                "{} · {}",
                                browser,
                                info["distro"].as_str().unwrap_or("Linux")
                            ),
                            14.0,
                            600.0,
                            0xe4eaf3,
                        ))
                        .child(muted(format!(
                            "{} · {} méthodes · {}",
                            info["phase"].as_str().unwrap_or("connexion"),
                            session["methods"],
                            &id[..id.len().min(8)]
                        ))),
                ),
        );
    }
    let enabled = s.snapshot["network"] == true;
    col()
        .w_full()
        .gap(18.0)
        .child(txt("VOTRE PASSERELLE LOCALE", 10.0, 650.0, 0xe9c78e))
        .child(txt(status, 29.0, 650.0, 0xf4f5f9))
        .child(muted(
            "Linux dans le navigateur. Réseau et agents sur votre Mac.",
        ))
        .child(
            row()
                .gap(9.0)
                .child(button(
                    "open-default",
                    "Ouvrir unkernelOS  ↗",
                    true,
                    |s| {
                        s.note = open(&s.app, None).err().unwrap_or_default();
                    },
                ))
                .child(button("open-chrome", "Chrome", false, |s| {
                    s.note = open(&s.app, Some("Google Chrome"))
                        .err()
                        .unwrap_or_default();
                }))
                .child(button("open-arc", "Arc", false, |s| {
                    s.note = open(&s.app, Some("Arc")).err().unwrap_or_default();
                }))
                .child(button("open-safari", "Safari", false, |s| {
                    s.note = open(&s.app, Some("Safari")).err().unwrap_or_default();
                })),
        )
        .child(
            panel()
                .child(
                    row()
                        .w_full()
                        .center_y()
                        .child(txt("Sessions du navigateur", 15.0, 600.0, 0xe4eaf3).grow(1.0))
                        .child(txt(format!("{n} CONNECTÉE(S)"), 10.0, 600.0, 0x8ee0ba)),
                )
                .child(sessions),
        )
        .child(
            panel()
                .child(
                    row()
                        .w_full()
                        .center_y()
                        .child(
                            col()
                                .grow(1.0)
                                .gap(5.0)
                                .child(txt("Wisp sur votre Mac", 15.0, 600.0, 0xe4eaf3))
                                .child(muted("TCP + UDP · aucun relais distant en mode companion")),
                        )
                        .child(button(
                            "network",
                            if enabled {
                                "Suspendre Wisp"
                            } else {
                                "Activer Wisp"
                            },
                            false,
                            |s| {
                                let b = &s.app.broker;
                                b.network
                                    .store(!b.network.load(Ordering::Relaxed), Ordering::Relaxed);
                            },
                        )),
                )
                .child(
                    row()
                        .gap(36.0)
                        .child(metric("FLUX OUVERTS", s.snapshot["streams"].to_string()))
                        .child(metric(
                            "ENVOYÉ",
                            bytes(s.snapshot["sent"].as_u64().unwrap_or(0)),
                        ))
                        .child(metric(
                            "REÇU",
                            bytes(s.snapshot["received"].as_u64().unwrap_or(0)),
                        )),
                ),
        )
}
fn metric(label: &str, value: String) -> El {
    col()
        .gap(5.0)
        .child(txt(label, 10.0, 500.0, 0x9ba5b5))
        .child(txt(value, 23.0, 600.0, 0xe4eaf3))
}
fn bytes(n: u64) -> String {
    if n >= 1048576 {
        format!("{:.1} Mo", n as f64 / 1048576.)
    } else {
        format!("{:.1} Ko", n as f64 / 1024.)
    }
}
fn agents(s: &State) -> El {
    let config = json!({"mcpServers":{"unkernelOS":{"command":exe(),"args":["mcp"]}}});
    let mut activity = col().w_full().gap(9.0);
    if s.snapshot["activity"].as_array().is_none_or(Vec::is_empty) {
        activity = activity.child(muted("Les appels réels apparaîtront ici."));
    }
    for a in s.snapshot["activity"].as_array().unwrap_or(&vec![]) {
        activity = activity.child(
            row()
                .w_full()
                .child(txt(a["method"].as_str().unwrap_or(""), 12.0, 500.0, 0xe4eaf3).grow(1.0))
                .child(txt(
                    if a["ok"] == true { "OK" } else { "ERREUR" },
                    10.0,
                    600.0,
                    if a["ok"] == true { 0x8ee0ba } else { 0xf6b3a8 },
                )),
        );
    }
    col().w_full().gap(18.0).child(txt("Des agents qui agissent vraiment.",29.0,650.0,0xf4f5f9))
        .child(muted("Toute l’API OS et les capacités des apps, en MCP et en CLI JSON."))
        .child(panel().child(txt("Connecter un agent sur le Mac",16.0,600.0,0xe4eaf3)).child(muted("Ajoutez ce serveur stdio à la configuration MCP de votre agent."))
            .child(txt("command : unkernelos-companion\nargs : [\"mcp\"]",13.0,500.0,0xe9c78e))
            .child(row().gap(9.0).child(button("copy-mcp","Copier la configuration MCP",true,move|s|copied(s,serde_json::to_string_pretty(&config).unwrap()))).child(button("copy-cli","Copier un appel CLI",false,|s|copied(s,format!("{} call system.info",shell_quote(&exe())))))))
        .child(panel().child(txt("Un seul contrat pour tout piloter",15.0,600.0,0xe4eaf3)).child(muted("companion_sessions → companion_schema → companion_call"))
            .child(muted("En CLI : sessions → skills list → schema → call <méthode> --params '<JSON>'"))
            .child(muted("Permissions et historique de l’OS conservés. Les sessions privées restent privées."))
            .child(button("revoke","Révoquer les connexions et renouveler la clé",false,|s|{s.note=match s.app.rotate(){Ok(())=>"Clé renouvelée. Les adaptateurs CLI et MCP utilisent automatiquement la nouvelle clé.".into(),Err(e)=>e.to_string()};})))
        .child(panel().child(txt("Activité récente des agents",15.0,600.0,0xe4eaf3)).child(activity))
}
fn data(_: &State) -> El {
    col().w_full().gap(18.0).child(txt("Un espace local qui vous appartient.",29.0,650.0,0xf4f5f9))
        .child(panel().child(txt("Vos données restent dans le navigateur",16.0,600.0,0xe4eaf3)).child(muted("La VM et ses disques persistent dans le profil du navigateur choisi."))
            .child(muted("Fermer ou suspendre son onglet rend l’OS indisponible aux agents.")))
        .child(panel().child(txt("Migrer depuis la version en ligne",16.0,600.0,0xe4eaf3))
            .child(muted("1. Dans l’ancien OS : Réglages → Disque & Snapshots VM → exporter le disque de données."))
            .child(muted("2. Dans cet OS local : importer ce disque depuis les mêmes réglages."))
            .child(muted("L’adresse locale a son propre stockage. Réglages, bibliothèque audio et contexte"))
            .child(muted("du bureau restent propres à chaque origine et profil ; ils ne sont pas migrés par le disque.")))
        .child(panel().child(txt("Connexion privée à cette machine",16.0,600.0,0xe4eaf3)).child(muted("Service limité à 127.0.0.1. Origine vérifiée, cookie navigateur et clé agent distincts."))
            .child(muted("Le mode local utilise uniquement le relais Wisp du companion.")))
}
fn view(s: &State, _: &mut Cx<State>) -> El {
    let mut nav = col()
        .w(208.0)
        .h_full()
        .padding(23.0)
        .gap(10.0)
        .fill(c(0x0e151f))
        .child(txt("▰", 32.0, 700.0, 0xe9c78e))
        .child(txt("unkernelOS", 19.0, 650.0, 0xf4f5f9))
        .child(muted("COMPANION / MAC"))
        .child(el().h(28.0));
    for (i, label) in ["Vue d’ensemble", "Agents & CLI", "Données & connexion"]
        .iter()
        .enumerate()
    {
        nav = nav.child(button(&format!("nav-{i}"), label, s.tab == i, move |s| {
            s.tab = i
        }));
    }
    nav = nav
        .child(el().grow(1.0))
        .child(txt("LOCAL PAR DÉFAUT", 10.0, 600.0, 0x8ee0ba))
        .child(muted("Rust · Rune · Metal"));
    let body = match s.tab {
        1 => agents(s),
        2 => data(s),
        _ => overview(s),
    };
    let content = col()
        .w_full()
        .gap(20.0)
        .padding(32.0)
        .child(
            row()
                .w_full()
                .center_y()
                .child(txt("COMPANION", 11.0, 600.0, 0x9ba5b5).grow(1.0))
                .child(txt(s.app.url(), 11.0, 500.0, 0x9ba5b5)),
        )
        .child(body)
        .child(txt(&s.note, 12.0, 500.0, 0xe9c78e));
    row().w_full().h_full().fill(c(0x101824)).child(nav).child(
        col()
            .grow(1.0)
            .h_full()
            .shrink()
            .scroll(ScrollSpec::default())
            .child(content),
    )
}
pub fn run(app: Arc<App>) {
    let _ = SERVICE.set(app.clone());
    let native = RuneApp::new(AppSpec {
        min_size: Some((980.0, 720.0)),
        scenes: &[
            ("agents", |s: &mut State| s.tab = 1),
            ("data", |s: &mut State| s.tab = 2),
        ],
        poll: Some(|s: &mut State, _, tx| {
            tx.wake_after(Duration::from_millis(500));
            let a = s.app.broker.snapshot();
            let b = s.app.broker.sessions();
            let changed = a != s.snapshot || b != s.sessions;
            s.snapshot = a;
            s.sessions = b;
            changed
        }),
        ..AppSpec::new(
            "unkernelOS Companion",
            (1110.0, 790.0),
            State::default,
            view,
        )
    })
    .keep_running()
    .on_quit(|s, _| s.app.browser.shutdown_now());
    let handle = native.handle();
    let mut pixels = vec![0u8; 24 * 24 * 4];
    for y in 4..20 {
        for x in 3..21 {
            if (y < 8) || (y > 10 && y < 14) || (y > 16) {
                let i = (y * 24 + x) * 4;
                pixels[i..i + 4].copy_from_slice(&[255, 255, 255, 255]);
            }
        }
    }
    let _tray = Tray::new(
        TraySpec::new(
            "com.unkernelos.companion",
            "unkernelOS",
            TrayIcon::rgba(24, 24, pixels).template(true),
        )
        .tooltip("unkernelOS Companion")
        .menu(vec![
            TrayItem::action("open", "Ouvrir unkernelOS"),
            TrayItem::action("show", "Afficher le companion"),
            TrayItem::Separator,
            TrayItem::action("quit", "Quitter"),
        ]),
        move |event| match event {
            TrayEvent::Activate { .. } => {
                handle.show();
                handle.focus();
            }
            TrayEvent::Menu(id) => match id.as_str() {
                "open" => {
                    let _ = open(&app, None);
                }
                "show" => {
                    handle.show();
                    handle.focus();
                }
                "quit" => {
                    handle.quit();
                }
                _ => {}
            },
            _ => {}
        },
    );
    native.run();
}
