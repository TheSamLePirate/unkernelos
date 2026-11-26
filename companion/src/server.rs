use crate::{
    App,
    mcp::{Backend, Mcp},
};
use axum::{
    Json, Router,
    body::{Body, to_bytes},
    extract::{
        Request, State,
        ws::{Message, WebSocketUpgrade},
    },
    http::{HeaderMap, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use std::{
    sync::{Arc, atomic::Ordering},
    time::Duration,
};
use tower_http::services::ServeDir;
fn forbidden() -> Response {
    (StatusCode::FORBIDDEN, "Forbidden").into_response()
}
fn exact_origin(headers: &HeaderMap, app: &App) -> bool {
    headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()) == Some(app.url().as_str())
}
fn cookie(headers: &HeaderMap, app: &App) -> bool {
    headers
        .get(header::COOKIE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| {
            v.split(';')
                .any(|c| c.trim() == format!("unkernel_companion={}", app.cookie))
        })
}
fn bearer(headers: &HeaderMap, app: &App) -> bool {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| {
            v.strip_prefix("Bearer ") == Some(app.connection.read().unwrap().token.as_str())
        })
}
async fn guard(State(app): State<Arc<App>>, req: Request, next: Next) -> Response {
    let host = app.url().trim_start_matches("http://").to_owned();
    if req
        .headers()
        .get(header::HOST)
        .and_then(|h| h.to_str().ok())
        != Some(host.as_str())
    {
        return forbidden();
    }
    if req.headers().contains_key(header::ORIGIN) && !exact_origin(req.headers(), &app) {
        return forbidden();
    }
    let path = req.uri().path();
    let allowed = if path == "/__companion/bootstrap" {
        req.headers()
            .get("sec-fetch-site")
            .is_some_and(|v| v == "same-origin")
    } else if path == "/wisp" || path == "/__companion/connect" || path == "/__companion/browser" {
        exact_origin(req.headers(), &app) && cookie(req.headers(), &app)
    } else if path.starts_with("/__companion/") || path == "/mcp" || path.starts_with("/mcp/") {
        bearer(req.headers(), &app)
    } else {
        true
    };
    if !allowed {
        return forbidden();
    }
    let control = path.starts_with("/__companion/") || path.starts_with("/mcp");
    let vm_sw = path == "/vm-sw.js";
    let mut response = next.run(req).await;
    // Mark every served HTML entry, including direct /index.html and encoded paths.
    // Otherwise a static entry could boot with the public network defaults.
    if response
        .headers()
        .get(header::CONTENT_TYPE)
        .is_some_and(|v| v.to_str().unwrap_or("").starts_with("text/html"))
    {
        let (mut parts, body) = response.into_parts();
        response = match to_bytes(body, 2 * 1024 * 1024).await {
            Ok(bytes) => {
                let html = String::from_utf8_lossy(&bytes).replacen(
                    "<head>",
                    "<head><meta name=\"unkernelos-companion\" content=\"1\">",
                    1,
                );
                parts.headers.remove(header::CONTENT_LENGTH);
                Response::from_parts(parts, Body::from(html))
            }
            Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "HTML entry unavailable").into_response(),
        };
    }
    let h = response.headers_mut();
    h.insert("Cross-Origin-Opener-Policy", "same-origin".parse().unwrap());
    h.insert(
        "Cross-Origin-Embedder-Policy",
        "require-corp".parse().unwrap(),
    );
    h.insert(
        "Cross-Origin-Resource-Policy",
        "same-origin".parse().unwrap(),
    );
    h.insert("X-Content-Type-Options", "nosniff".parse().unwrap());
    if control {
        h.insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    }
    if vm_sw {
        h.insert("Service-Worker-Allowed", "/vm/".parse().unwrap());
    }
    response
}
async fn index(State(app): State<Arc<App>>) -> Response {
    match tokio::fs::read_to_string(app.web.join("index.html")).await {
        Ok(html) => (
            [
                (header::CONTENT_TYPE, "text/html; charset=utf-8"),
                (header::CACHE_CONTROL, "no-cache"),
            ],
            html,
        )
            .into_response(),
        Err(_) => (StatusCode::SERVICE_UNAVAILABLE, "Web assets unavailable").into_response(),
    }
}
async fn bootstrap(State(app): State<Arc<App>>) -> Response {
    let mut r=Json(json!({"version":env!("CARGO_PKG_VERSION"),"origin":app.url(),"wispUrl":format!("{}/wisp",app.url().replacen("http:","ws:",1)),"bridgeUrl":format!("{}/__companion/connect",app.url().replacen("http:","ws:",1))})).into_response();
    r.headers_mut().insert(
        header::SET_COOKIE,
        format!(
            "unkernel_companion={}; HttpOnly; SameSite=Strict; Path=/",
            app.cookie
        )
        .parse()
        .unwrap(),
    );
    r
}
async fn status(State(app): State<Arc<App>>) -> Json<Value> {
    Json(
        json!({"ok":true,"result":{"url":app.url(),"version":env!("CARGO_PKG_VERSION"),"service":app.broker.snapshot(),"sessions":app.broker.sessions()}}),
    )
}
async fn sessions(State(app): State<Arc<App>>) -> Json<Value> {
    Json(json!({"ok":true,"result":app.broker.sessions()}))
}
async fn schema(State(app): State<Arc<App>>, Json(p): Json<Value>) -> Json<Value> {
    envelope(app.broker.schema(p["sessionId"].as_str()))
}
async fn call(State(app): State<Arc<App>>, Json(p): Json<Value>) -> Json<Value> {
    envelope(
        app.broker
            .call(
                p["sessionId"].as_str(),
                p["method"].as_str().unwrap_or(""),
                p.get("params").cloned().unwrap_or(json!({})),
            )
            .await,
    )
}
fn envelope(r: Result<Value, String>) -> Json<Value> {
    Json(match r {
        Ok(v) => json!({"ok":true,"result":v}),
        Err(e) => json!({"ok":false,"error":e}),
    })
}
async fn wisp(State(app): State<Arc<App>>, ws: WebSocketUpgrade) -> Response {
    if !app.broker.network.load(Ordering::Relaxed)
        || app.broker.wisp_clients.load(Ordering::Relaxed) >= 8
    {
        return (StatusCode::SERVICE_UNAVAILABLE, "Local relay unavailable").into_response();
    }
    ws.max_message_size(1024 * 1024)
        .on_upgrade(move |socket| crate::wisp::serve(socket, app.broker.clone()))
        .into_response()
}
async fn browser(State(app): State<Arc<App>>, ws: WebSocketUpgrade) -> Response {
    ws.max_message_size(1024 * 1024)
        .on_upgrade(move |socket| crate::browser::serve(socket, app))
        .into_response()
}
async fn connect(State(app): State<Arc<App>>, ws: WebSocketUpgrade) -> Response {
    if app
        .broker
        .sessions()
        .as_array()
        .is_some_and(|s| s.len() >= 16)
    {
        return (StatusCode::TOO_MANY_REQUESTS, "Session limit").into_response();
    }
    ws.max_message_size(2*1024*1024).on_upgrade(move|socket|async move {
        let (mut tx,mut rx)=socket.split();let(out,mut input)=tokio::sync::mpsc::channel(64);
        let id=app.broker.register(out); let generation=app.broker.generation.load(Ordering::SeqCst);
        let mut tick=tokio::time::interval(Duration::from_secs(10));let mut last=std::time::Instant::now();
        loop {tokio::select! {
            _=tick.tick()=>{if last.elapsed()>Duration::from_secs(40)||generation!=app.broker.generation.load(Ordering::SeqCst){break;}
                if tx.send(Message::Ping(vec![].into())).await.is_err(){break;}},
            v=input.recv()=>match v {Some(v)=>if tx.send(Message::Text(v.to_string().into())).await.is_err(){break;},None=>break},
            v=rx.next()=>match v {
                Some(Ok(Message::Text(t)))=>{
                    last=std::time::Instant::now();
                    let Ok(v)=serde_json::from_str::<Value>(&t) else {break;};
                    match v["type"].as_str(){
                        Some("hello")|Some("state")=>{let schema=v["schema"].as_array().filter(|s|s.len()<=1000).cloned();app.broker.update(&id,v["info"].clone(),schema);},
                        Some("result")=>if let Some(rid)=v["id"].as_str(){let r=if v["ok"]==true{Ok(v["result"].clone())}else{Err(v["error"].as_str().unwrap_or("Action failed").to_owned())};app.broker.resolve(&id,rid,r);},
                        _=>{}
                    }
                },
                Some(Ok(Message::Pong(_)))=>{last=std::time::Instant::now();},
                Some(Ok(Message::Ping(_)))=>{},_=>break
            }
        }}
        app.broker.disconnect(&id);let _=tx.close().await;
    }).into_response()
}
pub async fn run(listener: tokio::net::TcpListener, app: Arc<App>) -> anyhow::Result<()> {
    use rmcp::transport::streamable_http_server::{
        StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
    };
    let b = app.broker.clone();
    let service: StreamableHttpService<Mcp, LocalSessionManager> = StreamableHttpService::new(
        move || Ok(Mcp(Backend::Local(b.clone()))),
        Default::default(),
        StreamableHttpServerConfig::default().with_json_response(true),
    );
    let shutdown_app = app.clone();
    let router = Router::new()
        .route("/", get(index))
        .route("/__companion/bootstrap", get(bootstrap))
        .route("/__companion/connect", get(connect))
        .route("/__companion/browser", get(browser))
        .route("/wisp", get(wisp))
        .route("/__companion/status", post(status))
        .route("/__companion/sessions", post(sessions))
        .route("/__companion/schema", post(schema))
        .route("/__companion/call", post(call))
        .nest_service("/mcp", service)
        .nest_service("/distros", ServeDir::new(&app.distros))
        .fallback_service(ServeDir::new(&app.web))
        .layer(middleware::from_fn_with_state(app.clone(), guard))
        .with_state(app);
    axum::serve(listener, router)
        .with_graceful_shutdown(async move {
            let _ = tokio::signal::ctrl_c().await;
            shutdown_app.browser.shutdown_now();
            shutdown_app.broker.revoke();
        })
        .await?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn credentials_are_separate_and_exact() {
        let app = App {
            browser: crate::browser::BrowserEngine::default(),
            broker: crate::broker::Broker::new(),
            connection: std::sync::RwLock::new(crate::Connection {
                url: "http://127.0.0.1:17891".into(),
                token: "agent".into(),
            }),
            cookie: "browser".into(),
            web: ".".into(),
            distros: ".".into(),
        };
        let mut h = HeaderMap::new();
        h.insert(header::ORIGIN, "https://evil.example".parse().unwrap());
        assert!(!exact_origin(&h, &app));
        h.insert(header::COOKIE, "unkernel_companion=agent".parse().unwrap());
        assert!(!cookie(&h, &app));
        h.insert(header::AUTHORIZATION, "Bearer agent".parse().unwrap());
        assert!(bearer(&h, &app));
        h.insert(header::AUTHORIZATION, "Bearer agent-extra".parse().unwrap());
        assert!(!bearer(&h, &app));
    }
}
