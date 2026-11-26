// rustc examples/horizon-app/build.rs -o /tmp/horizon-counter
// /tmp/horizon-counter /tmp/unkernel-counter-rust.html
use std::{env,fs};
fn main() {
 let path=env::args().nth(1).unwrap_or_else(||"/tmp/unkernel-counter-rust.html".into());
 fs::write(&path,include_str!("counter.html")).expect("write app HTML");
 println!("App Rust créée : {}",path);
 println!("Installer dans Linux avec osctl call app.install et guestPath vers ce fichier.");
}
