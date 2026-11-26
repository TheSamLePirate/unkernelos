# Companion dependencies

The companion application code is MIT licensed. Cargo.lock records exact dependencies.

- Rune UI, revision ce1caa8ac79a15d0ea405fdc800a49d1e3351d4f: https://github.com/anomalyco/rune (MIT).
- wisp-mux 5.1.0: https://crates.io/crates/wisp-mux/5.1.0 (LGPL-3.0-only). Source: https://github.com/MercuryWorkshop/epoxy-tls/tree/multiplexed/wisp . Cargo downloads its corresponding source. Its copyright and license are retained in that source. The companion is supplied with its complete build source and lockfile, allowing modification and relinking with a modified wisp-mux.
- rmcp 3.11.0, official MCP Rust SDK: https://github.com/modelcontextprotocol/rust-sdk (MIT).
- Axum, Tokio, tower-http, serde, reqwest and other dependencies retain their respective licenses. `cargo metadata --locked` lists the complete resolved dependency graph and license declarations.

Rebuild and relink: install Rust 1.99.1 and Bun, run `bun install`, `bun run fetch-distros`, then `scripts/build-companion.sh`. To modify wisp-mux, download the exact 5.1.0 crate source and add a local `wisp-mux = { path = "/absolute/path/to/modified/wisp-mux" }` entry under `[patch.crates-io]` in Cargo.toml. Build without `--locked` once to update that local patch's lockfile, then rebuild. There is no signature verification mechanism preventing use of your modified build. macOS bundles here are signed ad hoc, without a Developer ID certificate.
