//! Isolated, real Chromium pages. Only typed browser operations cross the local authenticated socket.
use anyhow::{Context, Result, bail, ensure};
use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicU32, AtomicU64, Ordering},
    },
    time::Duration,
};
use tokio::{
    process::{Child, Command},
    sync::{Semaphore, broadcast, mpsc, oneshot},
};

pub struct BrowserEngine {
    running: tokio::sync::Mutex<Option<Process>>,
    slots: Arc<Semaphore>,
    pid: AtomicU32,
}
struct Process {
    child: Child,
    port: u16,
}
impl Default for BrowserEngine {
    fn default() -> Self {
        Self {
            running: tokio::sync::Mutex::new(None),
            slots: Arc::new(Semaphore::new(8)),
            pid: AtomicU32::new(0),
        }
    }
}
impl BrowserEngine {
    pub fn shutdown_now(&self) {
        let pid = self.pid.swap(0, Ordering::SeqCst);
        if pid != 0 {
            let _ = std::process::Command::new("/bin/kill")
                .args(["-TERM", &pid.to_string()])
                .status();
        }
    }
    async fn port(&self) -> Result<u16> {
        let mut running = self.running.lock().await;
        if let Some(p) = running.as_mut()
            && p.child.try_wait()?.is_none()
        {
            return Ok(p.port);
        }
        *running = None;
        self.pid.store(0, Ordering::SeqCst);
        let candidates = [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Arc.app/Contents/MacOS/Arc",
        ];
        let binary = std::env::var_os("UNKERNELOS_BROWSER_BINARY")
            .map(PathBuf::from)
            .or_else(|| candidates.iter().map(PathBuf::from).find(|p| p.is_file()))
            .context(
                "Installez Chrome ou Chromium sur le Mac pour utiliser le navigateur intégré.",
            )?;
        let profile = crate::support_dir().join("browser-profile");
        std::fs::create_dir_all(&profile)?;
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&profile, std::fs::Permissions::from_mode(0o700))?;
        let port_file = profile.join("DevToolsActivePort");
        // A crash can leave our dedicated Chrome process alive. Close only the
        // endpoint recorded inside this private profile before reopening it.
        if let Ok(stale) = tokio::fs::read_to_string(&port_file).await {
            let mut lines = stale.lines();
            if let (Some(port), Some(endpoint)) = (
                lines.next().and_then(|v| v.parse::<u16>().ok()),
                lines.next(),
            ) && endpoint.starts_with("/devtools/browser/")
            {
                let url = format!("ws://127.0.0.1:{port}{endpoint}");
                if let Ok(Ok((cdp, _, task))) =
                    tokio::time::timeout(Duration::from_secs(2), Cdp::connect(&url)).await
                {
                    let _guard = AbortTask(task);
                    let _ = tokio::time::timeout(
                        Duration::from_secs(3),
                        cdp.call("Browser.close", json!({})),
                    )
                    .await;
                    tokio::time::sleep(Duration::from_millis(250)).await;
                }
            }
        }
        let _ = std::fs::remove_file(&port_file);
        let mut child = Command::new(binary)
            .args([
                "--headless=new",
                "--remote-debugging-port=0",
                "--remote-debugging-address=127.0.0.1",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-background-timer-throttling",
                "--disable-renderer-backgrounding",
            ])
            .arg(format!("--user-data-dir={}", profile.display()))
            .arg("about:blank")
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .kill_on_drop(true)
            .spawn()?;
        self.pid.store(child.id().unwrap_or(0), Ordering::SeqCst);
        for _ in 0..100 {
            if let Some(status) = child.try_wait()? {
                bail!("Le moteur Chromium s’est arrêté ({status}).");
            }
            if let Ok(text) = tokio::fs::read_to_string(&port_file).await
                && let Some(port) = text.lines().next().and_then(|s| s.parse::<u16>().ok())
            {
                *running = Some(Process { child, port });
                return Ok(port);
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        bail!("Démarrage de Chromium trop long")
    }
}

type Replies = Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>>;
struct Pending {
    id: u64,
    replies: Replies,
}
impl Drop for Pending {
    fn drop(&mut self) {
        self.replies.lock().unwrap().remove(&self.id);
    }
}
#[derive(Clone)]
struct Cdp {
    tx: mpsc::Sender<Value>,
    replies: Replies,
    seq: Arc<AtomicU64>,
}
impl Cdp {
    async fn connect(
        url: &str,
    ) -> Result<(
        Self,
        broadcast::Receiver<Value>,
        tokio::task::JoinHandle<()>,
    )> {
        let (ws, _) = tokio_tungstenite::connect_async(url).await?;
        let (mut write, mut read) = ws.split();
        let (tx, mut rx) = mpsc::channel::<Value>(128);
        let (reports, events) = broadcast::channel(64);
        let cdp = Self {
            tx,
            replies: Arc::new(Mutex::new(HashMap::new())),
            seq: Arc::new(AtomicU64::new(1)),
        };
        let pending = cdp.replies.clone();
        let task = tokio::spawn(async move {
            loop {
                tokio::select! {
                    value=rx.recv()=>match value {Some(v)=>{if write.send(tokio_tungstenite::tungstenite::Message::Text(v.to_string().into())).await.is_err(){break;}},None=>break},
                    value=read.next()=>match value {
                        Some(Ok(tokio_tungstenite::tungstenite::Message::Text(t)))=>if let Ok(v)=serde_json::from_str::<Value>(&t){if let Some(id)=v["id"].as_u64(){if let Some(reply)=pending.lock().unwrap().remove(&id){let r=if v.get("error").is_some(){Err(v["error"]["message"].as_str().unwrap_or("Browser error").into())}else{Ok(v["result"].clone())};let _=reply.send(r);}}else{let _=reports.send(v);}},
                        Some(Ok(tokio_tungstenite::tungstenite::Message::Ping(b)))=>{if write.send(tokio_tungstenite::tungstenite::Message::Pong(b)).await.is_err(){break;}},
                        Some(Ok(_))=>{},_=>break
                    }
                }
            }
            pending.lock().unwrap().clear();
        });
        Ok((cdp, events, task))
    }
    async fn call(&self, method: &str, params: Value) -> Result<Value> {
        let id = self.seq.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel();
        self.replies.lock().unwrap().insert(id, tx);
        let _guard = Pending {
            id,
            replies: self.replies.clone(),
        };
        self.tx
            .send(json!({"id":id,"method":method,"params":params}))
            .await
            .context("Moteur déconnecté")?;
        tokio::time::timeout(Duration::from_secs(30), rx)
            .await
            .context("Le navigateur ne répond pas")?
            .context("Moteur déconnecté")?
            .map_err(anyhow::Error::msg)
    }
    async fn post(&self, method: &str, params: Value) -> Result<Value> {
        let id = self.seq.fetch_add(1, Ordering::Relaxed);
        self.tx
            .send(json!({"id":id,"method":method,"params":params}))
            .await
            .context("Moteur déconnecté")?;
        Ok(json!({"dispatched":true}))
    }
    async fn eval(&self, expression: String) -> Result<Value> {
        let r=self.call("Runtime.evaluate",json!({"expression":expression,"returnByValue":true,"awaitPromise":true,"userGesture":true})).await?;
        ensure!(
            r.get("exceptionDetails").is_none(),
            "{}",
            r["exceptionDetails"]["text"]
        );
        Ok(r["result"]["value"].clone())
    }
}
fn web_url(raw: &str) -> Result<String> {
    if raw == "about:blank" {
        return Ok(raw.into());
    }
    let url = reqwest::Url::parse(raw).context("Adresse HTTP ou HTTPS requise")?;
    ensure!(
        ["http", "https"].contains(&url.scheme())
            && url.host_str().is_some()
            && url.username().is_empty()
            && url.password().is_none(),
        "Seules les adresses HTTP et HTTPS sans identifiants dans l’URL sont prises en charge."
    );
    Ok(url.to_string())
}
async fn history(c: &Cdp) -> Result<Value> {
    let h = c.call("Page.getNavigationHistory", json!({})).await?;
    let i = h["currentIndex"].as_u64().unwrap_or(0) as usize;
    let entries = h["entries"].as_array().context("Historique indisponible")?;
    Ok(
        json!({"url":entries.get(i).map(|v|v["url"].clone()).unwrap_or(Value::Null),"title":entries.get(i).map(|v|v["title"].clone()).unwrap_or(Value::Null),"canBack":i>0,"canForward":i+1<entries.len()}),
    )
}
const SNAPSHOT: &str = r#"(()=>{const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'};const selector=e=>{if(e.id)return '#'+CSS.escape(e.id);const p=[];while(e&&e!==document.documentElement){const tag=e.localName;const siblings=e.parentElement?Array.from(e.parentElement.children).filter(x=>x.localName===tag):[];p.unshift(tag+':nth-of-type('+(siblings.indexOf(e)+1)+')');e=e.parentElement}return 'html>'+p.join('>')};return {url:location.href,title:document.title,text:(document.body?.innerText??'').slice(0,40000),selection:String(getSelection()??'').slice(0,10000),elements:Array.from(document.querySelectorAll('a,button,input,textarea,select,[role="button"],[contenteditable="true"]')).filter(visible).slice(0,200).map(e=>({selector:selector(e),tag:e.localName,type:e.getAttribute('type'),label:(e.getAttribute('aria-label')||e.getAttribute('placeholder')||e.innerText||e.getAttribute('name')||'').slice(0,200),href:e.localName==='a'?e.href:undefined,disabled:!!e.disabled,rect:(()=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()}))}})()"#;
async fn operation(c: &Cdp, p: &Value) -> Result<Value> {
    match p["action"].as_str().unwrap_or(""){
        "navigate"=>{let url=web_url(p["url"].as_str().context("URL requise")?)?;let r=c.call("Page.navigate",json!({"url":url})).await?;ensure!(r["errorText"].as_str().is_none_or(str::is_empty),"{}",r["errorText"]);Ok(r)},
        "reload"=>c.call("Page.reload",json!({})).await,
        "stop"=>c.call("Page.stopLoading",json!({})).await,
        "back"|"forward"=>{let h=c.call("Page.getNavigationHistory",json!({})).await?;let i=h["currentIndex"].as_i64().unwrap_or(0)+if p["action"]=="back"{-1}else{1};let e=h["entries"].as_array().and_then(|v|usize::try_from(i).ok().and_then(|i|v.get(i))).context("Aucune page dans cette direction")?;c.call("Page.navigateToHistoryEntry",json!({"entryId":e["id"]})).await},
        "resize"=>{let w=p["width"].as_u64().unwrap_or(1000).clamp(320,2560);let h=p["height"].as_u64().unwrap_or(700).clamp(200,1600);let scale=p["scale"].as_f64().unwrap_or(1.0).clamp(1.0,2.0);c.call("Emulation.setDeviceMetricsOverride",json!({"width":w,"height":h,"deviceScaleFactor":scale,"mobile":false})).await},
        "pointer"=>{let kind=p["kind"].as_str().unwrap_or("");ensure!(["mousePressed","mouseReleased","mouseMoved","mouseWheel"].contains(&kind),"Invalid pointer event");let button=p["button"].as_str().unwrap_or("none");ensure!(["none","left","right","middle","back","forward"].contains(&button),"Invalid mouse button");c.call("Input.dispatchMouseEvent",json!({"type":kind,"x":p["x"].as_f64().unwrap_or(0.0).clamp(0.0,2560.0),"y":p["y"].as_f64().unwrap_or(0.0).clamp(0.0,1600.0),"button":button,"buttons":p["buttons"].as_u64().unwrap_or(0).min(31),"clickCount":p["clickCount"].as_u64().unwrap_or(0).min(3),"deltaX":p["deltaX"].as_f64().unwrap_or(0.0).clamp(-10000.0,10000.0),"deltaY":p["deltaY"].as_f64().unwrap_or(0.0).clamp(-10000.0,10000.0),"modifiers":p["modifiers"].as_u64().unwrap_or(0).min(15)})).await},
        "key"=>{let kind=p["kind"].as_str().unwrap_or("");ensure!(["keyDown","keyUp","rawKeyDown"].contains(&kind),"Invalid key event");c.call("Input.dispatchKeyEvent",json!({"type":kind,"key":p["key"].as_str().unwrap_or(""),"code":p["code"].as_str().unwrap_or(""),"text":p["text"].as_str().unwrap_or(""),"windowsVirtualKeyCode":p["keyCode"].as_u64().unwrap_or(0),"modifiers":p["modifiers"].as_u64().unwrap_or(0).min(15),"autoRepeat":p["repeat"].as_bool().unwrap_or(false)})).await},
        "text"=>{let text=p["text"].as_str().context("Texte requis")?;ensure!(text.len()<=262144,"Texte trop long");c.call("Input.insertText",json!({"text":text})).await},
        "snapshot"=>c.eval(SNAPSHOT.into()).await,
        "selection"=>c.eval("(()=>{const e=document.activeElement;return e&&(e.tagName==='INPUT'||e.tagName==='TEXTAREA')&&typeof e.selectionStart==='number'?e.value.slice(e.selectionStart,e.selectionEnd):String(getSelection()??'')})()".into()).await,
        "click"=>{let selector=serde_json::to_string(p["selector"].as_str().context("Sélecteur requis")?)?;let r=c.eval(format!("(()=>{{const e=document.querySelector({selector});if(!e)throw Error('Element introuvable');e.scrollIntoView({{block:'center'}});const r=e.getBoundingClientRect();return {{x:r.x+r.width/2,y:r.y+r.height/2}}}})()")).await?;c.call("Input.dispatchMouseEvent",json!({"type":"mousePressed","button":"left","buttons":1,"clickCount":1,"x":r["x"],"y":r["y"]})).await?;c.post("Input.dispatchMouseEvent",json!({"type":"mouseReleased","button":"left","buttons":0,"clickCount":1,"x":r["x"],"y":r["y"]})).await},
        "fill"=>{let selector=serde_json::to_string(p["selector"].as_str().context("Sélecteur requis")?)?;c.eval(format!("(()=>{{const e=document.querySelector({selector});if(!e)throw Error('Champ introuvable');e.focus();if(e.select)e.select();return true}})()")).await?;let text=p["value"].as_str().context("Valeur requise")?;ensure!(text.len()<=262144,"Texte trop long");c.call("Input.insertText",json!({"text":text})).await},
        "dialog"=>c.call("Page.handleJavaScriptDialog",json!({"accept":p["accept"].as_bool().unwrap_or(false),"promptText":p["text"].as_str().unwrap_or("")})).await,
        "ack"=>c.call("Page.screencastFrameAck",json!({"sessionId":p["sessionId"]})).await,
        _=>bail!("Action navigateur inconnue")
    }
}
struct AbortTask(tokio::task::JoinHandle<()>);
impl Drop for AbortTask {
    fn drop(&mut self) {
        self.0.abort();
    }
}
fn response(p: &Value, r: Result<Value>) -> Option<Value> {
    let id = p.get("id")?;
    Some(match r {
        Ok(result) => json!({"type":"result","id":id,"ok":true,"result":result}),
        Err(e) => json!({"type":"result","id":id,"ok":false,"error":e.to_string()}),
    })
}
pub async fn serve(mut ws: WebSocket, app: Arc<crate::App>) {
    let result=async {
        let _slot=app.browser.slots.clone().try_acquire_owned().context("Huit vues navigateur sont déjà ouvertes")?;
        let port=app.browser.port().await?;
        let http=reqwest::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(10)).build()?;
        let target:Value=http.put(format!("http://127.0.0.1:{port}/json/new?about:blank")).send().await?.error_for_status()?.json().await?;
        let target_id=target["id"].as_str().context("Onglet absent")?.to_owned();
        let connected=Cdp::connect(target["webSocketDebuggerUrl"].as_str().context("Connexion au moteur indisponible")?).await;
        let session=async {
            let(cdp,mut events,task)=connected?;
            let _cdp_task=AbortTask(task);
            cdp.call("Page.enable",json!({})).await?;
            cdp.call("Emulation.setDeviceMetricsOverride",json!({"width":1000,"height":700,"deviceScaleFactor":1,"mobile":false})).await?;
            cdp.call("Page.startScreencast",json!({"format":"jpeg","quality":92,"maxWidth":2560,"maxHeight":1600})).await?;
            ws.send(Message::Text(json!({"type":"ready","engine":"Chromium","profile":"unkernelOS"}).to_string().into())).await?;
            let(commands,mut queue)=mpsc::channel::<Value>(128);
            let(results,mut replies)=mpsc::channel::<Value>(128);
            let worker_cdp=cdp.clone();
            let _worker=AbortTask(tokio::spawn(async move {
                while let Some(p)=queue.recv().await{
                    let r=operation(&worker_cdp,&p).await;
                    if let Some(reply)=response(&p,r) && results.send(reply).await.is_err(){break;}
                }
            }));
            let generation=app.broker.generation.load(Ordering::SeqCst);
            let mut tick=tokio::time::interval(Duration::from_secs(10));
            loop{tokio::select! {
                _=tick.tick()=>{
                    if generation!=app.broker.generation.load(Ordering::SeqCst){break;}
                    ws.send(Message::Ping(vec![].into())).await?;
                },
                Some(reply)=replies.recv()=>ws.send(Message::Text(reply.to_string().into())).await?,
                message=ws.recv()=>match message {
                    Some(Ok(Message::Text(t)))=>{
                        let p:Value=serde_json::from_str(&t)?;
                        if ["ack","dialog","stop"].contains(&p["action"].as_str().unwrap_or("")){
                            if let Some(reply)=response(&p,operation(&cdp,&p).await){ws.send(Message::Text(reply.to_string().into())).await?;}
                        }else if commands.try_send(p.clone()).is_err()
                            && let Some(reply)=response(&p,Err(anyhow::anyhow!("Le navigateur est occupé"))){
                            ws.send(Message::Text(reply.to_string().into())).await?;
                        }
                    },
                    Some(Ok(Message::Pong(_)|Message::Ping(_)))=>{},
                    _=>break
                },
                event=events.recv()=>{
                    let event=match event{Ok(v)=>v,Err(broadcast::error::RecvError::Lagged(_))=>continue,Err(_)=>bail!("Flux navigateur interrompu")};
                    match event["method"].as_str().unwrap_or(""){
                        "Page.screencastFrame"=>ws.send(Message::Text(json!({"type":"frame","data":event["params"]["data"],"sessionId":event["params"]["sessionId"]}).to_string().into())).await?,
                        "Page.frameNavigated"|"Page.navigatedWithinDocument"|"Page.loadEventFired"=>{
                            if (event["method"]!="Page.frameNavigated"||event["params"]["frame"].get("parentId").is_none())
                                && let Ok(state)=history(&cdp).await {
                                ws.send(Message::Text(json!({"type":"state","state":state}).to_string().into())).await?;
                            }
                        },
                        "Page.frameStartedLoading"=>ws.send(Message::Text(json!({"type":"loading","loading":true}).to_string().into())).await?,
                        "Page.frameStoppedLoading"=>ws.send(Message::Text(json!({"type":"loading","loading":false}).to_string().into())).await?,
                        "Page.javascriptDialogOpening"=>ws.send(Message::Text(json!({"type":"dialog","dialog":event["params"]}).to_string().into())).await?,
                        "Page.windowOpen"=>ws.send(Message::Text(json!({"type":"popup","url":event["params"]["url"]}).to_string().into())).await?,
                        _=>{}
                    }
                }
            }}
            Ok::<(),anyhow::Error>(())
        }.await;
        // Close this page and its popups, never another OS window's page.
        if let Ok(response)=http.get(format!("http://127.0.0.1:{port}/json/list")).send().await
            && let Ok(targets)=response.json::<Vec<Value>>().await {
                for child in targets.iter().filter(|v|v["openerId"]==target_id) {
                    if let Some(id)=child["id"].as_str(){let _=http.get(format!("http://127.0.0.1:{port}/json/close/{id}")).send().await;}
                }
        }
        let _=http.get(format!("http://127.0.0.1:{port}/json/close/{target_id}")).send().await;
        session
    }.await;
    if let Err(e) = result {
        let _ = ws
            .send(Message::Text(
                json!({"type":"error","error":e.to_string()})
                    .to_string()
                    .into(),
            ))
            .await;
    }
    let _ = ws.close().await;
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn navigation_keeps_native_security_boundaries() {
        for bad in [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "data:text/html,hi",
            "https://user:pass@example.com/",
        ] {
            assert!(web_url(bad).is_err());
        }
        assert_eq!(
            web_url("https://example.com/a?q=b").unwrap(),
            "https://example.com/a?q=b"
        );
    }
}
