use axum::{http::StatusCode, Json};
use reqwest::{redirect::Policy, Client};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::net::IpAddr;
use std::time::Duration;
use url::Url;

pub type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

fn err_json(status: StatusCode, msg: impl Into<String>) -> (StatusCode, Json<Value>) {
    (status, Json(json!({ "error": msg.into() })))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiPresetPayload {
    pub protocol: String,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub model: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiModelsRequest {
    pub protocol: Option<String>,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
}

#[derive(Debug, Deserialize)]
pub struct AiChatMessageInput {
    pub role: String,
    #[serde(default)]
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatRequest {
    pub preset: Option<AiPresetPayload>,
    pub messages: Option<Vec<AiChatMessageInput>>,
    pub system_instruction: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStructureRequest {
    pub preset: Option<AiPresetPayload>,
    pub task: Option<String>,
    pub prompt: Option<String>,
    pub system_instruction: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NormalizedModelItem {
    id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    display_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    owned_by: Option<String>,
}

fn validate_target_url(raw_url: &str) -> Result<Url, String> {
    let trimmed = raw_url.trim();
    if trimmed.is_empty() {
        return Err("请先填写 API Base URL".to_string());
    }
    let parsed = Url::parse(trimmed)
        .map_err(|_| "无效的 API 地址格式，请提供完整的 http(s):// URL".to_string())?;

    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return Err("仅支持 http 或 https 协议的接口地址".to_string());
    }

    let host_raw = parsed
        .host_str()
        .ok_or_else(|| "API 地址缺少有效的主机名".to_string())?;
    let host_clean = host_raw.trim_start_matches('[').trim_end_matches(']');

    if let Ok(ip) = host_clean.parse::<IpAddr>() {
        match ip {
            IpAddr::V4(v4) => {
                let octets = v4.octets();
                if (octets[0] == 169 && octets[1] == 254) || v4.is_unspecified() {
                    return Err("不允许请求保留或云元数据网络地址".to_string());
                }
            }
            IpAddr::V6(v6) => {
                if v6.is_unspecified() {
                    return Err("不允许请求未指定的 IPv6 地址".to_string());
                }
            }
        }
    }

    Ok(parsed)
}

fn build_http_client(timeout_secs: u64) -> Result<Client, String> {
    Client::builder()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| format!("初始化 HTTP 客户端失败: {}", e))
}

fn build_openai_chat_endpoint(base_url: &str) -> String {
    let clean = base_url.trim().trim_end_matches('/');
    if clean.ends_with("/chat/completions") {
        clean.to_string()
    } else if clean.ends_with("/v1") {
        format!("{}/chat/completions", clean)
    } else {
        format!("{}/v1/chat/completions", clean)
    }
}

fn build_openai_models_urls(base_url: &str) -> Vec<String> {
    let clean = base_url.trim().trim_end_matches('/');
    if clean.ends_with("/chat/completions") {
        let prefix = &clean[..clean.len() - "/chat/completions".len()];
        vec![format!("{}/models", prefix)]
    } else if clean.ends_with("/models") {
        vec![clean.to_string()]
    } else if clean.ends_with("/v1") {
        vec![format!("{}/models", clean)]
    } else {
        vec![format!("{}/v1/models", clean), format!("{}/models", clean)]
    }
}

fn build_gemini_models_endpoint(base_url: &str) -> String {
    let trimmed = base_url.trim();
    let clean = if trimmed.is_empty() {
        "https://generativelanguage.googleapis.com"
    } else {
        trimmed.trim_end_matches('/')
    };
    if clean.ends_with("/models") {
        clean.to_string()
    } else if clean.contains("/v1beta") {
        format!("{}/models", clean)
    } else {
        format!("{}/v1beta/models", clean)
    }
}

fn encode_uri_component(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for byte in input.as_bytes() {
        let ch = *byte as char;
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.' || ch == '~' {
            out.push(ch);
        } else {
            out.push_str(&format!("%{:02X}", byte));
        }
    }
    out
}

fn build_gemini_generate_endpoint(base_url: &str, model: &str) -> String {
    let trimmed = base_url.trim();
    let clean = if trimmed.is_empty() {
        "https://generativelanguage.googleapis.com"
    } else {
        trimmed.trim_end_matches('/')
    };
    if clean.contains(":generateContent") {
        clean.to_string()
    } else {
        let safe_model = model.trim().trim_start_matches("models/");
        let encoded_model = encode_uri_component(safe_model);
        format!("{}/v1beta/models/{}:generateContent", clean, encoded_model)
    }
}

fn extract_upstream_error_message(data: &Option<Value>, raw_text: &str, status: u16) -> String {
    if let Some(val) = data {
        if let Some(msg) = val
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
        {
            return msg.to_string();
        }
        if let Some(err_str) = val.get("error").and_then(|e| e.as_str()) {
            if !err_str.trim().is_empty() {
                return err_str.to_string();
            }
        }
        if let Some(msg) = val.get("message").and_then(|m| m.as_str()) {
            if !msg.trim().is_empty() {
                return msg.to_string();
            }
        }
    }
    let snippet: String = raw_text.trim().chars().take(180).collect();
    if !snippet.is_empty() {
        format!("HTTP {}: {}", status, snippet)
    } else {
        format!("HTTP {}", status)
    }
}

fn extract_openai_reply_text(data: &Value) -> Option<String> {
    let choice = data.get("choices")?.as_array()?.first()?;
    if let Some(content_val) = choice.get("message").and_then(|m| m.get("content")) {
        if let Some(s) = content_val.as_str() {
            return Some(s.to_string());
        }
        if let Some(arr) = content_val.as_array() {
            let joined: String = arr
                .iter()
                .filter_map(|part| part.get("text").and_then(|t| t.as_str()))
                .collect::<Vec<_>>()
                .join("");
            if !joined.is_empty() {
                return Some(joined);
            }
        }
    }
    if let Some(s) = choice.get("text").and_then(|t| t.as_str()) {
        return Some(s.to_string());
    }
    None
}

fn extract_gemini_reply_text(data: &Value) -> Option<String> {
    let parts = data
        .get("candidates")?
        .as_array()?
        .first()?
        .get("content")?
        .get("parts")?
        .as_array()?;
    let joined: String = parts
        .iter()
        .filter_map(|p| p.get("text").and_then(|t| t.as_str()))
        .collect::<Vec<_>>()
        .join("");
    if joined.is_empty() {
        None
    } else {
        Some(joined)
    }
}

fn normalize_openai_models_response(data: &Value) -> Vec<NormalizedModelItem> {
    let raw_list = data
        .get("data")
        .and_then(|v| v.as_array())
        .or_else(|| data.get("models").and_then(|v| v.as_array()));

    let mut seen = HashSet::new();
    let mut models = Vec::new();
    if let Some(items) = raw_list {
        for item in items {
            let id = item
                .get("id")
                .or_else(|| item.get("name"))
                .or_else(|| item.get("model"))
                .and_then(|v| v.as_str())
                .map(|s| s.trim().to_string())
                .unwrap_or_default();
            if id.is_empty() || !seen.insert(id.clone()) {
                continue;
            }
            let display_name = item
                .get("displayName")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let owned_by = item
                .get("owned_by")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            models.push(NormalizedModelItem {
                id,
                display_name,
                owned_by,
            });
        }
    }
    models.sort_by(|a, b| a.id.cmp(&b.id));
    models
}

fn server_gemini_key() -> Option<String> {
    std::env::var("GEMINI_API_KEY")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

pub async fn ai_status() -> Json<Value> {
    Json(json!({
        "serverGeminiAvailable": server_gemini_key().is_some(),
        "defaultModel": "gemini-4-hydrogen",
        "desktopProxyReady": true
    }))
}

async fn fetch_upstream_openai_models(base_url: &str, api_key: &str) -> Result<Vec<NormalizedModelItem>, String> {
    let candidates = build_openai_models_urls(base_url);
    let client = build_http_client(15)?;
    let mut last_error = "无法获取模型列表".to_string();

    for candidate in candidates {
        let validated = validate_target_url(&candidate)?;
        let mut req = client
            .get(validated)
            .header("Accept", "application/json");
        if !api_key.trim().is_empty() {
            req = req.header("Authorization", format!("Bearer {}", api_key.trim()));
        }

        let resp = match req.send().await {
            Ok(r) => r,
            Err(e) => {
                last_error = format!("网络请求失败: {}", e);
                continue;
            }
        };

        let status = resp.status();
        let raw_text = resp.text().await.unwrap_or_default();
        let parsed: Option<Value> = serde_json::from_str(&raw_text).ok();

        if !status.is_success() {
            last_error = extract_upstream_error_message(&parsed, &raw_text, status.as_u16());
            continue;
        }

        let Some(data) = parsed else {
            last_error = format!("模型列表接口返回非 JSON 响应 ({})", status.as_u16());
            continue;
        };

        let models = normalize_openai_models_response(&data);
        if !models.is_empty() {
            return Ok(models);
        }
        last_error = "服务器返回了空的模型列表".to_string();
    }

    Err(format!("抓取 OpenAI 兼容模型失败: {}", last_error))
}

async fn fetch_upstream_gemini_models(base_url: &str, api_key: &str) -> Result<Vec<NormalizedModelItem>, String> {
    let endpoint = build_gemini_models_endpoint(base_url);
    let validated = validate_target_url(&endpoint)?;
    let client = build_http_client(15)?;

    let mut req = client
        .get(validated)
        .header("Accept", "application/json");
    if !api_key.trim().is_empty() {
        req = req.header("x-goog-api-key", api_key.trim());
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("抓取自定义 Gemini 模型网络失败: {}", e))?;
    let status = resp.status();
    let raw_text = resp.text().await.unwrap_or_default();
    let parsed: Option<Value> = serde_json::from_str(&raw_text).ok();

    if !status.is_success() {
        return Err(format!(
            "抓取自定义 Gemini 模型失败: {}",
            extract_upstream_error_message(&parsed, &raw_text, status.as_u16())
        ));
    }

    let data = parsed.ok_or_else(|| {
        format!("自定义 Gemini 模型列表返回非 JSON 响应 ({})", status.as_u16())
    })?;

    let raw_list = data
        .get("models")
        .and_then(|v| v.as_array())
        .or_else(|| data.get("data").and_then(|v| v.as_array()));

    let mut seen = HashSet::new();
    let mut models = Vec::new();
    if let Some(items) = raw_list {
        for item in items {
            if let Some(methods) = item
                .get("supportedGenerationMethods")
                .and_then(|v| v.as_array())
            {
                let supports_gen = methods
                    .iter()
                    .any(|m| m.as_str() == Some("generateContent"));
                if !supports_gen {
                    continue;
                }
            }
            let raw_id = item
                .get("name")
                .or_else(|| item.get("id"))
                .and_then(|v| v.as_str())
                .map(|s| s.trim().trim_start_matches("models/").to_string())
                .unwrap_or_default();
            if raw_id.is_empty() || !seen.insert(raw_id.clone()) {
                continue;
            }
            let display_name = item
                .get("displayName")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            models.push(NormalizedModelItem {
                id: raw_id,
                display_name,
                owned_by: Some("Gemini API".to_string()),
            });
        }
    }

    Ok(models)
}

async fn post_openai_once(
    client: &Client,
    url: &Url,
    api_key: &str,
    payload: &Value,
) -> Result<reqwest::Response, String> {
    let mut req = client
        .post(url.clone())
        .header("Content-Type", "application/json")
        .header("Accept", "application/json");
    if !api_key.trim().is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key.trim()));
    }
    req.json(payload)
        .send()
        .await
        .map_err(|e| format!("上游模型接口网络请求失败: {}", e))
}

async fn call_upstream_openai(
    base_url: &str,
    api_key: &str,
    model: &str,
    messages: Vec<Value>,
    json_mode: bool,
) -> Result<String, String> {
    let endpoint = build_openai_chat_endpoint(base_url);
    let validated = validate_target_url(&endpoint)?;
    let client = build_http_client(60)?;

    let mut body = json!({
        "model": model,
        "messages": messages
    });
    if json_mode {
        body["response_format"] = json!({ "type": "json_object" });
    }

    let resp = post_openai_once(&client, &validated, api_key, &body).await?;
    let mut status = resp.status();
    let mut raw_text = resp.text().await.unwrap_or_default();
    let mut parsed: Option<Value> = serde_json::from_str(&raw_text).ok();

    // Some third-party OpenAI relays reject response_format: { type: "json_object" }
    if json_mode && status == StatusCode::BAD_REQUEST && raw_text.contains("response_format") {
        let fallback_body = json!({
            "model": model,
            "messages": messages
        });
        let retry_resp = post_openai_once(&client, &validated, api_key, &fallback_body).await?;
        status = retry_resp.status();
        raw_text = retry_resp.text().await.unwrap_or_default();
        parsed = serde_json::from_str(&raw_text).ok();
    }

    if !status.is_success() {
        return Err(format!(
            "自定义模型接口请求失败: {}",
            extract_upstream_error_message(&parsed, &raw_text, status.as_u16())
        ));
    }

    let data = parsed.ok_or_else(|| {
        let snippet: String = raw_text.trim().chars().take(180).collect();
        format!(
            "上游模型接口返回非 JSON 响应 ({}): {}",
            status.as_u16(),
            snippet
        )
    })?;

    extract_openai_reply_text(&data)
        .ok_or_else(|| "上游模型接口未返回标准文本内容".to_string())
}

async fn call_upstream_gemini(
    base_url: &str,
    api_key: &str,
    model: &str,
    system_instruction: Option<&str>,
    contents: &str,
    json_mode: bool,
) -> Result<String, String> {
    let endpoint = build_gemini_generate_endpoint(base_url, model);
    let validated = validate_target_url(&endpoint)?;
    let client = build_http_client(60)?;

    let mut payload = json!({
        "contents": [{ "role": "user", "parts": [{ "text": contents }] }]
    });
    if let Some(sys) = system_instruction {
        if !sys.trim().is_empty() {
            payload["systemInstruction"] = json!({ "parts": [{ "text": sys }] });
        }
    }
    if json_mode {
        payload["generationConfig"] = json!({ "responseMimeType": "application/json" });
    }

    let mut req = client
        .post(validated)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json");
    if !api_key.trim().is_empty() {
        req = req.header("x-goog-api-key", api_key.trim());
    }

    let resp = req
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("自定义 Gemini 接口网络请求失败: {}", e))?;
    let status = resp.status();
    let raw_text = resp.text().await.unwrap_or_default();
    let parsed: Option<Value> = serde_json::from_str(&raw_text).ok();

    if !status.is_success() {
        return Err(format!(
            "自定义 Gemini 接口请求失败: {}",
            extract_upstream_error_message(&parsed, &raw_text, status.as_u16())
        ));
    }

    let data = parsed.ok_or_else(|| {
        let snippet: String = raw_text.trim().chars().take(180).collect();
        format!(
            "自定义 Gemini 接口返回非 JSON 响应 ({}): {}",
            status.as_u16(),
            snippet
        )
    })?;

    extract_gemini_reply_text(&data)
        .ok_or_else(|| "自定义 Gemini 接口未返回有效文本".to_string())
}

pub async fn ai_models(Json(payload): Json<AiModelsRequest>) -> ApiResult {
    let protocol = payload.protocol.unwrap_or_default();
    if protocol.is_empty() {
        return Err(err_json(StatusCode::BAD_REQUEST, "缺少协议类型参数"));
    }

    println!("[AI_PROXY] Fetching models via desktop kernel (protocol={})", protocol);

    match protocol.as_str() {
        "server-gemini" => {
            let Some(key) = server_gemini_key() else {
                return Err(err_json(
                    StatusCode::BAD_REQUEST,
                    "桌面端本地内核未配置 GEMINI_API_KEY，请切换至自定义 OpenAI 或自定义 Gemini 预设。",
                ));
            };
            let models = fetch_upstream_gemini_models("https://generativelanguage.googleapis.com", &key)
                .await
                .map_err(|e| err_json(StatusCode::BAD_GATEWAY, e))?;
            Ok(Json(json!({ "models": models })))
        }
        "openai" => {
            if payload.base_url.trim().is_empty() {
                return Err(err_json(
                    StatusCode::BAD_REQUEST,
                    "请先填写 API Base URL 再抓取模型",
                ));
            }
            let models = fetch_upstream_openai_models(&payload.base_url, &payload.api_key)
                .await
                .map_err(|e| err_json(StatusCode::BAD_GATEWAY, e))?;
            Ok(Json(json!({ "models": models })))
        }
        "gemini-custom" => {
            let models = fetch_upstream_gemini_models(&payload.base_url, &payload.api_key)
                .await
                .map_err(|e| err_json(StatusCode::BAD_GATEWAY, e))?;
            Ok(Json(json!({ "models": models })))
        }
        _ => Err(err_json(StatusCode::BAD_REQUEST, "不支持的模型协议类型")),
    }
}

pub async fn ai_chat(Json(payload): Json<AiChatRequest>) -> ApiResult {
    let Some(preset) = payload.preset else {
        return Err(err_json(StatusCode::BAD_REQUEST, "请求缺少模型预设"));
    };
    let messages = payload.messages.unwrap_or_default();
    if messages.is_empty() {
        return Err(err_json(StatusCode::BAD_REQUEST, "请求缺少对话消息"));
    }

    println!(
        "[AI_PROXY] Forwarding chat request via desktop kernel (protocol={}, model={})",
        preset.protocol, preset.model
    );

    match preset.protocol.as_str() {
        "server-gemini" => {
            let Some(key) = server_gemini_key() else {
                return Err(err_json(
                    StatusCode::BAD_REQUEST,
                    "桌面端本地内核未配置服务端 Gemini 密钥，请切换至自定义 OpenAI 或自定义 Gemini 预设。",
                ));
            };
            let model = if preset.model.trim().is_empty() {
                "gemini-4-hydrogen"
            } else {
                preset.model.trim()
            };
            let transcript = messages
                .iter()
                .map(|m| {
                    let speaker = if m.role == "user" { "User" } else { "Assistant" };
                    format!("{}: {}", speaker, m.content)
                })
                .collect::<Vec<_>>()
                .join("\n\n");
            let text = call_upstream_gemini(
                "https://generativelanguage.googleapis.com",
                &key,
                model,
                payload.system_instruction.as_deref(),
                &transcript,
                false,
            )
            .await
            .map_err(|e| err_json(StatusCode::BAD_GATEWAY, e))?;
            Ok(Json(json!({ "text": text })))
        }
        "openai" => {
            if preset.base_url.trim().is_empty() || preset.model.trim().is_empty() {
                return Err(err_json(
                    StatusCode::BAD_REQUEST,
                    "自定义 OpenAI 接口缺少 Base URL 或模型名称",
                ));
            }
            let mut openai_messages = Vec::new();
            if let Some(sys) = payload.system_instruction {
                if !sys.trim().is_empty() {
                    openai_messages.push(json!({ "role": "system", "content": sys }));
                }
            }
            for m in messages {
                let role = if m.role == "assistant" {
                    "assistant"
                } else if m.role == "system" {
                    "system"
                } else {
                    "user"
                };
                openai_messages.push(json!({ "role": role, "content": m.content }));
            }
            let text = call_upstream_openai(
                &preset.base_url,
                &preset.api_key,
                preset.model.trim(),
                openai_messages,
                false,
            )
            .await
            .map_err(|e| err_json(StatusCode::BAD_GATEWAY, e))?;
            Ok(Json(json!({ "text": text })))
        }
        "gemini-custom" => {
            if preset.model.trim().is_empty() {
                return Err(err_json(
                    StatusCode::BAD_REQUEST,
                    "自定义 Gemini 接口缺少模型名称",
                ));
            }
            let transcript = messages
                .iter()
                .map(|m| {
                    let speaker = if m.role == "user" { "User" } else { "Assistant" };
                    format!("{}: {}", speaker, m.content)
                })
                .collect::<Vec<_>>()
                .join("\n\n");
            let text = call_upstream_gemini(
                &preset.base_url,
                &preset.api_key,
                preset.model.trim(),
                payload.system_instruction.as_deref(),
                &transcript,
                false,
            )
            .await
            .map_err(|e| err_json(StatusCode::BAD_GATEWAY, e))?;
            Ok(Json(json!({ "text": text })))
        }
        _ => Err(err_json(StatusCode::BAD_REQUEST, "不支持的模型协议类型")),
    }
}

pub async fn ai_structure(Json(payload): Json<AiStructureRequest>) -> ApiResult {
    let Some(preset) = payload.preset else {
        return Err(err_json(StatusCode::BAD_REQUEST, "缺少结构化生成所需预设参数"));
    };
    let task = payload.task.unwrap_or_default();
    let prompt = payload.prompt.unwrap_or_default();
    if task.trim().is_empty() || prompt.trim().is_empty() {
        return Err(err_json(StatusCode::BAD_REQUEST, "缺少结构化生成所需参数"));
    }

    println!(
        "[AI_PROXY] Forwarding structure request via desktop kernel (protocol={}, task={})",
        preset.protocol, task
    );

    match preset.protocol.as_str() {
        "server-gemini" => {
            let Some(key) = server_gemini_key() else {
                return Err(err_json(
                    StatusCode::BAD_REQUEST,
                    "桌面端本地内核未配置服务端 Gemini 密钥，请切换至自定义 OpenAI 或自定义 Gemini 预设。",
                ));
            };
            let model = if preset.model.trim().is_empty() {
                "gemini-4-hydrogen"
            } else {
                preset.model.trim()
            };
            let text = call_upstream_gemini(
                "https://generativelanguage.googleapis.com",
                &key,
                model,
                payload.system_instruction.as_deref(),
                &prompt,
                true,
            )
            .await
            .map_err(|e| err_json(StatusCode::BAD_GATEWAY, e))?;
            Ok(Json(json!({ "text": text })))
        }
        "openai" => {
            if preset.base_url.trim().is_empty() || preset.model.trim().is_empty() {
                return Err(err_json(
                    StatusCode::BAD_REQUEST,
                    "自定义 OpenAI 接口缺少 Base URL 或模型名称",
                ));
            }
            let mut openai_messages = Vec::new();
            if let Some(sys) = payload.system_instruction {
                if !sys.trim().is_empty() {
                    openai_messages.push(json!({ "role": "system", "content": sys }));
                }
            }
            openai_messages.push(json!({ "role": "user", "content": prompt }));
            let text = call_upstream_openai(
                &preset.base_url,
                &preset.api_key,
                preset.model.trim(),
                openai_messages,
                true,
            )
            .await
            .map_err(|e| err_json(StatusCode::BAD_GATEWAY, e))?;
            Ok(Json(json!({ "text": text })))
        }
        "gemini-custom" => {
            let model = if preset.model.trim().is_empty() {
                "gemini-4-hydrogen"
            } else {
                preset.model.trim()
            };
            let text = call_upstream_gemini(
                &preset.base_url,
                &preset.api_key,
                model,
                payload.system_instruction.as_deref(),
                &prompt,
                true,
            )
            .await
            .map_err(|e| err_json(StatusCode::BAD_GATEWAY, e))?;
            Ok(Json(json!({ "text": text })))
        }
        _ => Err(err_json(StatusCode::BAD_REQUEST, "不支持的模型协议类型")),
    }
}
