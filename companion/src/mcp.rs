use crate::broker::Shared;
use rmcp::{
    RoleServer, ServerHandler, ServiceExt,
    model::{
        CallToolRequestParams, CallToolResponse, CallToolResult, ContentBlock, ErrorData,
        Implementation, ListToolsResult, PaginatedRequestParams, ServerCapabilities, ServerConfig,
        Tool,
    },
    service::RequestContext,
};
use serde_json::{Value, json};
#[derive(Clone)]
pub enum Backend {
    Local(Shared),
    Remote,
}
#[derive(Clone)]
pub struct Mcp(pub Backend);
impl Mcp {
    pub async fn request(&self, path: &str, body: Option<Value>) -> Result<Value, String> {
        match &self.0 {
            Backend::Local(b) => match path {
                "sessions" => Ok(b.sessions()),
                "schema" => b.schema(body.as_ref().and_then(|v| v["sessionId"].as_str())),
                "call" => {
                    let p = body.unwrap_or(json!({}));
                    b.call(
                        p["sessionId"].as_str(),
                        p["method"].as_str().unwrap_or(""),
                        p.get("params").cloned().unwrap_or(json!({})),
                    )
                    .await
                }
                _ => Err("Unknown operation".into()),
            },
            Backend::Remote => {
                let c = crate::read_connection().map_err(|e| e.to_string())?;
                let parsed = reqwest::Url::parse(&c.url).map_err(|e| e.to_string())?;
                if parsed.scheme() != "http"
                    || parsed.host_str() != Some("127.0.0.1")
                    || parsed.port().is_none()
                {
                    return Err("Invalid companion address".into());
                }
                let client = reqwest::Client::builder()
                    .no_proxy()
                    .redirect(reqwest::redirect::Policy::none())
                    .timeout(std::time::Duration::from_secs(100))
                    .build()
                    .map_err(|e| e.to_string())?;
                let r = client
                    .post(format!("{}/__companion/{path}", c.url))
                    .bearer_auth(c.token)
                    .json(&body.unwrap_or(json!({})))
                    .send()
                    .await
                    .map_err(|e| format!("Companion unavailable: {e}"))?;
                if !r.status().is_success() {
                    return Err(format!("Companion rejected request ({})", r.status()));
                }
                let v: Value = r.json().await.map_err(|e| e.to_string())?;
                if v["ok"] == true {
                    Ok(v["result"].clone())
                } else {
                    Err(v["error"].as_str().unwrap_or("Action failed").into())
                }
            }
        }
    }
}
impl ServerHandler for Mcp {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("unkernelOS Companion",env!("CARGO_PKG_VERSION")))
            .with_instructions("Control the Linux OS running in the user's browser. First discover sessions, schema and relevant skills using skills.list and skills.read. All advertised OS/app capabilities are accessible through companion_call. Explicitly choose a sessionId when several browsers are open. The VM's shell/filesystem differ from the Mac's. A disconnected or timed-out mutation may have executed; inspect state before retrying.")
    }
    async fn list_tools(
        &self,
        _: Option<PaginatedRequestParams>,
        _: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, ErrorData> {
        let defs = [
            json!({"name":"companion_sessions","description":"List connected browser OS sessions, state and method count.","inputSchema":{"type":"object","properties":{}}}),
            json!({"name":"companion_schema","description":"Read the complete live OS API schema, including skills.list / skills.read, app discovery, context, actions, guest files and commands.","inputSchema":{"type":"object","properties":{"sessionId":{"type":"string"}}}}),
            json!({"name":"companion_call","description":"Invoke any method advertised by companion_schema. Uses the same OS agent permissions and audit history as internal agents. Never automatically retry an uncertain mutation.","inputSchema":{"type":"object","properties":{"sessionId":{"type":"string"},"method":{"type":"string"},"params":{"type":"object"}},"required":["method"]}}),
        ];
        let tools: Vec<Tool> = defs
            .into_iter()
            .map(|v| serde_json::from_value(v).expect("static tool schema"))
            .collect();
        Ok(ListToolsResult {
            tools,
            ..Default::default()
        })
    }
    async fn call_tool(
        &self,
        p: CallToolRequestParams,
        _: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, ErrorData> {
        let args = Value::Object(p.arguments.unwrap_or_default());
        let path = match p.name.as_ref() {
            "companion_sessions" => "sessions",
            "companion_schema" => "schema",
            "companion_call" => "call",
            _ => return Err(ErrorData::invalid_params("Unknown tool", None)),
        };
        let r = match self.request(path, Some(args)).await {
            Ok(v) => CallToolResult::success(vec![ContentBlock::text(
                serde_json::to_string(&v).unwrap(),
            )]),
            Err(e) => CallToolResult::error(vec![ContentBlock::text(e)]),
        };
        Ok(r.into())
    }
}
pub async fn stdio() -> anyhow::Result<()> {
    Mcp(Backend::Remote)
        .serve(rmcp::transport::stdio())
        .await?
        .waiting()
        .await?;
    Ok(())
}
