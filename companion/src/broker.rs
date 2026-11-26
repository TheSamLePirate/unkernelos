use serde::Serialize;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::sync::{mpsc, oneshot};
use uuid::Uuid;

pub type Shared = Arc<Broker>;
struct Session {
    schema: Vec<Value>,
    info: Value,
    tx: mpsc::Sender<Value>,
    seen: u64,
}
struct Pending {
    session: String,
    tx: oneshot::Sender<Result<Value, String>>,
}
struct PendingGuard<'a> {
    broker: &'a Broker,
    id: String,
}
impl Drop for PendingGuard<'_> {
    fn drop(&mut self) {
        self.broker.inner.lock().unwrap().pending.remove(&self.id);
    }
}
#[derive(Default)]
struct Inner {
    sessions: HashMap<String, Session>,
    pending: HashMap<String, Pending>,
    recent: Vec<Activity>,
}
#[derive(Clone, Serialize)]
pub struct Activity {
    pub method: String,
    pub ok: bool,
    pub at: u64,
}
#[derive(Default)]
pub struct Broker {
    inner: Mutex<Inner>,
    pub network: AtomicBool,
    pub streams: AtomicU64,
    pub sent: AtomicU64,
    pub received: AtomicU64,
    pub wisp_clients: AtomicU64,
    pub generation: AtomicU64,
}
pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
impl Broker {
    pub fn new() -> Shared {
        Arc::new(Self {
            network: AtomicBool::new(true),
            ..Self::default()
        })
    }
    pub fn register(&self, tx: mpsc::Sender<Value>) -> String {
        let id = Uuid::new_v4().to_string();
        self.inner.lock().unwrap().sessions.insert(
            id.clone(),
            Session {
                schema: vec![],
                info: json!({"phase":"connecting"}),
                tx,
                seen: now(),
            },
        );
        id
    }
    pub fn update(&self, id: &str, info: Value, schema: Option<Vec<Value>>) {
        if let Some(s) = self.inner.lock().unwrap().sessions.get_mut(id) {
            s.info = info;
            s.seen = now();
            if let Some(schema) = schema {
                s.schema = schema;
            }
        }
    }
    pub fn resolve(&self, session: &str, id: &str, result: Result<Value, String>) {
        let mut inner = self.inner.lock().unwrap();
        if inner.pending.get(id).is_some_and(|p| p.session == session)
            && let Some(p) = inner.pending.remove(id)
        {
            let _ = p.tx.send(result);
        }
    }
    pub fn disconnect(&self, id: &str) {
        let mut inner = self.inner.lock().unwrap();
        inner.sessions.remove(id);
        inner.pending.retain(|_, p| p.session != id); // Dropping senders immediately rejects outstanding calls.
    }
    pub fn revoke(&self) {
        let mut i = self.inner.lock().unwrap();
        i.pending.clear();
        i.sessions.clear();
        self.generation.fetch_add(1, Ordering::SeqCst);
    }
    pub fn sessions(&self) -> Value {
        let i = self.inner.lock().unwrap();
        let mut out: Vec<_> = i
            .sessions
            .iter()
            .map(
                |(id, s)| json!({"id":id,"info":s.info,"lastSeen":s.seen,"methods":s.schema.len()}),
            )
            .collect();
        out.sort_by_key(|v| v["id"].as_str().unwrap_or("").to_owned());
        json!(out)
    }
    fn select<'a>(i: &'a Inner, id: Option<&str>) -> Result<(&'a String, &'a Session), String> {
        if let Some(id) = id {
            return i
                .sessions
                .get_key_value(id)
                .ok_or_else(|| "Browser session disconnected".into());
        }
        match i.sessions.len() {
            0 => Err("No browser session. Open unkernelOS from the companion.".into()),
            1 => Ok(i.sessions.iter().next().unwrap()),
            _ => {
                Err("Multiple browser sessions. Choose a sessionId with companion_sessions.".into())
            }
        }
    }
    pub fn schema(&self, session: Option<&str>) -> Result<Value, String> {
        let i = self.inner.lock().unwrap();
        let (_, s) = Self::select(&i, session)?;
        Ok(json!(s.schema))
    }
    pub async fn call(
        &self,
        session: Option<&str>,
        method: &str,
        params: Value,
    ) -> Result<Value, String> {
        if !params.is_object() {
            return Err("params must be an object".into());
        }
        let id = Uuid::new_v4().to_string();
        let (reply, rx) = oneshot::channel();
        let tx = {
            let mut i = self.inner.lock().unwrap();
            let (sid, s) = Self::select(&i, session)?;
            if !s.schema.iter().any(|m| m["method"] == method) {
                return Err(format!("Unknown method: {method}. Read companion_schema."));
            }
            if now().saturating_sub(s.seen) > 35 {
                return Err("Browser session is unresponsive or suspended".into());
            }
            if i.pending.len() >= 64 {
                return Err("Too many pending agent calls".into());
            }
            let sid = sid.clone();
            let tx = s.tx.clone();
            i.pending.insert(
                id.clone(),
                Pending {
                    session: sid,
                    tx: reply,
                },
            );
            tx
        };
        let _pending_guard = PendingGuard {
            broker: self,
            id: id.clone(),
        };
        // No retries: a mutation may already have executed if its reply is lost.
        let result = if tx
            .try_send(json!({"type":"call","id":id,"method":method,"params":params}))
            .is_err()
        {
            Err("Browser queue unavailable".into())
        } else {
            match tokio::time::timeout(Duration::from_secs(90), rx).await { Ok(Ok(r))=>r, Ok(Err(_))=>Err("Browser disconnected; action outcome may be unknown. Inspect state before retrying.".into()), Err(_)=>Err("Action timed out; outcome may be unknown. Inspect state before retrying.".into()) }
        };
        let mut i = self.inner.lock().unwrap();
        i.pending.remove(&id);
        i.recent.insert(
            0,
            Activity {
                method: method.into(),
                ok: result.is_ok(),
                at: now(),
            },
        );
        i.recent.truncate(8);
        drop(i);
        result
    }
    pub fn snapshot(&self) -> Value {
        let i = self.inner.lock().unwrap();
        json!({"network":self.network.load(Ordering::Relaxed),"streams":self.streams.load(Ordering::Relaxed),"clients":self.wisp_clients.load(Ordering::Relaxed),"sent":self.sent.load(Ordering::Relaxed),"received":self.received.load(Ordering::Relaxed),"activity":i.recent,"sessionCount":i.sessions.len()})
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn calls_are_scoped_and_disconnect_rejects() {
        let b = Broker::new();
        let (tx, mut rx) = mpsc::channel(4);
        let s = b.register(tx);
        b.update(&s, json!({}), Some(vec![json!({"method":"system.info"})]));
        let task = tokio::spawn({
            let b = b.clone();
            async move { b.call(None, "system.info", json!({})).await }
        });
        let msg = rx.recv().await.unwrap();
        b.resolve("wrong-session", msg["id"].as_str().unwrap(), Ok(json!(42)));
        assert!(!task.is_finished());
        b.disconnect(&s);
        assert!(task.await.unwrap().unwrap_err().contains("disconnected"));
    }
    #[tokio::test]
    async fn cancelled_call_releases_pending_slot() {
        let b = Broker::new();
        let (tx, mut rx) = mpsc::channel(1);
        let sid = b.register(tx);
        b.update(&sid, json!({}), Some(vec![json!({"method":"system.info"})]));
        let task = tokio::spawn({
            let b = b.clone();
            async move { b.call(None, "system.info", json!({})).await }
        });
        rx.recv().await.unwrap();
        task.abort();
        let _ = task.await;
        assert!(b.inner.lock().unwrap().pending.is_empty());
    }
    #[tokio::test]
    async fn successful_result_returns_once_and_is_audited() {
        let b = Broker::new();
        let (tx, mut rx) = mpsc::channel(1);
        let sid = b.register(tx);
        b.update(&sid, json!({}), Some(vec![json!({"method":"system.info"})]));
        let task = tokio::spawn({
            let b = b.clone();
            async move { b.call(None, "system.info", json!({})).await }
        });
        let msg = rx.recv().await.unwrap();
        b.resolve(&sid, msg["id"].as_str().unwrap(), Ok(json!({"os":"Linux"})));
        assert_eq!(task.await.unwrap().unwrap()["os"], "Linux");
        assert!(b.inner.lock().unwrap().pending.is_empty());
        assert_eq!(b.snapshot()["activity"][0]["ok"], true);
    }
    #[tokio::test]
    async fn explicit_target_required_for_multiple_sessions() {
        let b = Broker::new();
        for _ in 0..2 {
            let (tx, _) = mpsc::channel(1);
            b.register(tx);
        }
        assert!(b.schema(None).unwrap_err().contains("Multiple"));
        assert!(
            b.call(Some("missing"), "system.info", json!({}))
                .await
                .is_err()
        );
    }
}
