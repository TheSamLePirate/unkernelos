//! Wisp 1.2 relay. Multiplexing and packet flow control are provided by wisp-mux.
use crate::broker::Shared;
use async_trait::async_trait;
use axum::extract::ws::{Message, WebSocket};
use bytes::BytesMut;
use futures_util::{
    SinkExt, StreamExt,
    stream::{SplitSink, SplitStream},
};
use std::{sync::atomic::Ordering, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpStream, UdpSocket},
    task::JoinSet,
};
use wisp_mux::{
    CloseReason, ConnectPacket, MuxStream, ServerMux, StreamType, WispError,
    ws::{Frame, LockedWebSocketWrite, OpCode, Payload, WebSocketRead, WebSocketWrite},
};
struct Reader(SplitStream<WebSocket>);
struct Writer(SplitSink<WebSocket, Message>);
fn err(e: axum::Error) -> WispError {
    WispError::WsImplError(Box::new(e))
}
#[async_trait]
impl WebSocketRead for Reader {
    async fn wisp_read_frame(
        &mut self,
        _tx: &LockedWebSocketWrite,
    ) -> Result<Frame<'static>, WispError> {
        loop {
            match self.0.next().await {
                Some(Ok(Message::Binary(b))) => {
                    return Ok(Frame::binary(Payload::Bytes(BytesMut::from(b.as_ref()))));
                }
                Some(Ok(Message::Close(_))) | None => return Err(WispError::WsImplSocketClosed),
                Some(Ok(Message::Ping(_) | Message::Pong(_))) => continue,
                Some(Ok(_)) => return Err(WispError::WsFrameInvalidType),
                Some(Err(e)) => return Err(err(e)),
            }
        }
    }
}
#[async_trait]
impl WebSocketWrite for Writer {
    async fn wisp_write_frame(&mut self, f: Frame<'_>) -> Result<(), WispError> {
        let b = f.payload.to_vec().into();
        let m = match f.opcode {
            OpCode::Binary => Message::Binary(b),
            OpCode::Close => Message::Close(None),
            OpCode::Ping => Message::Ping(b),
            OpCode::Pong => Message::Pong(b),
            _ => return Err(WispError::WsFrameInvalidType),
        };
        self.0.send(m).await.map_err(err)
    }
    async fn wisp_close(&mut self) -> Result<(), WispError> {
        self.0.close().await.map_err(err)
    }
}
struct Count(Shared);
impl Drop for Count {
    fn drop(&mut self) {
        self.0.streams.fetch_sub(1, Ordering::Relaxed);
    }
}
async fn relay(c: ConnectPacket, stream: MuxStream, b: Shared) {
    b.streams.fetch_add(1, Ordering::Relaxed);
    let _count = Count(b.clone());
    let connect = async {
        anyhow::ensure!(
            c.destination_port != 0 && c.destination_hostname.len() <= 253,
            "Invalid destination"
        );
        let addresses: Vec<_> =
            tokio::net::lookup_host((c.destination_hostname.as_str(), c.destination_port))
                .await?
                .collect();
        anyhow::ensure!(!addresses.is_empty(), "DNS returned no addresses");
        Ok::<_, anyhow::Error>(addresses)
    };
    let addresses = match tokio::time::timeout(Duration::from_secs(15), connect).await {
        Ok(Ok(a)) => a,
        _ => {
            let _ = stream.close(CloseReason::ServerStreamUnreachable).await;
            return;
        }
    };
    let result: anyhow::Result<()>=async {
        match c.stream_type {
            StreamType::Tcp=>{
                let mut socket=tokio::time::timeout(Duration::from_secs(15),TcpStream::connect(addresses.as_slice())).await??;
                socket.set_nodelay(true)?;
                let (mut reader,mut writer)=socket.split();
                let upload=async {while let Some(data)=stream.read().await {writer.write_all(&data).await?;b.sent.fetch_add(data.len() as u64,Ordering::Relaxed);} Ok::<(),anyhow::Error>(())};
                let download=async {let mut buf=vec![0u8;32*1024];loop {let n=reader.read(&mut buf).await?;if n==0{break;}stream.write(&buf[..n]).await?;b.received.fetch_add(n as u64,Ordering::Relaxed);} Ok::<(),anyhow::Error>(())};
                tokio::select! {r=upload=>r?,r=download=>r?};
            },
            StreamType::Udp=>{
                let addr=addresses[0]; let socket=UdpSocket::bind(if addr.is_ipv4(){"0.0.0.0:0"}else{"[::]:0"}).await?;
                socket.connect(addr).await?;let mut buf=vec![0u8;65536];
                loop {tokio::select! {
                    data=stream.read()=>match data {Some(data)=>{socket.send(&data).await?;b.sent.fetch_add(data.len() as u64,Ordering::Relaxed);},None=>break},
                    n=socket.recv(&mut buf)=>{let n=n?;stream.write(&buf[..n]).await?;b.received.fetch_add(n as u64,Ordering::Relaxed);},
                    _=tokio::time::sleep(Duration::from_secs(90))=>break,
                }}
            },
            _=>anyhow::bail!("Unsupported stream"),
        } Ok(())
    }.await;
    let _ = stream
        .close(if result.is_ok() {
            CloseReason::Voluntary
        } else {
            CloseReason::Unexpected
        })
        .await;
}
pub async fn serve(ws: WebSocket, b: Shared) {
    b.wisp_clients.fetch_add(1, Ordering::Relaxed);
    let (write, read) = ws.split();
    if let Ok(result) = ServerMux::create(Reader(read), Writer(write), 128, None).await {
        let (mux, task) = result.with_no_required_extensions();
        let mut task = tokio::spawn(task);
        let mut streams = JoinSet::new();
        let generation = b.generation.load(Ordering::SeqCst);
        let mut tick = tokio::time::interval(Duration::from_secs(1));
        loop {
            tokio::select! {
                _=&mut task=>break,
                _=tick.tick()=>{if !b.network.load(Ordering::Relaxed)||generation!=b.generation.load(Ordering::SeqCst){break;}},
                Some(_)=streams.join_next(),if !streams.is_empty()=>{},
                next=mux.server_new_stream()=>match next {Some((c,s))=>{
                    if streams.len()>=256 {let _=s.close(CloseReason::ServerStreamThrottled).await;}
                    else {streams.spawn(relay(c,s,b.clone()));}
                },None=>break},
            }
        }
        streams.abort_all();
        while streams.join_next().await.is_some() {}
        let _ = mux.close().await;
        task.abort();
    }
    b.wisp_clients.fetch_sub(1, Ordering::Relaxed);
}
