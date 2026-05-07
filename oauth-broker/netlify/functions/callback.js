"use strict";

const TOKEN_URL = "https://api.smartthings.com/oauth/token";

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function htmlPage(refreshToken) {
  const safe = escapeHtml(refreshToken);
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Refresh Token 발급 완료</title>
<style>
:root{color-scheme:light dark}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:640px;margin:3rem auto;padding:0 1.5rem;line-height:1.6}
h1{font-size:1.3rem}
.token{display:block;background:rgba(127,127,127,.15);padding:1rem;border-radius:.5rem;word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9rem;margin:1rem 0}
button{padding:.6rem 1rem;border:0;border-radius:.4rem;background:#2563eb;color:#fff;font-weight:600;cursor:pointer}
button:hover{background:#1d4ed8}
.note{font-size:.9rem;color:#6b7280}
</style></head><body>
<h1>Refresh Token 발급 완료</h1>
<p>아래 값을 복사해 SmartThings 앱의 <code>Refresh Token</code> preference에 붙여 넣으세요.</p>
<code class="token" id="t">${safe}</code>
<button id="c">복사</button>
<p class="note">이 페이지를 닫으면 토큰을 다시 볼 수 없습니다. 토큰은 본 서버에 저장되지 않습니다.</p>
<script>
document.getElementById('c').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(document.getElementById('t').textContent); document.getElementById('c').textContent = '복사됨'; }
  catch(e) { alert('복사 실패: ' + e.message); }
});
</script>
</body></html>`;
}

exports.handler = async function (event) {
  const clientId = process.env.ST_CLIENT_ID;
  const clientSecret = process.env.ST_CLIENT_SECRET;
  const redirectUri = process.env.ST_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return { statusCode: 500, body: "Server misconfigured." };
  }

  const params = event.queryStringParameters || {};
  const code = params.code;
  const stateQuery = params.state;
  const cookies = parseCookies(event.headers && (event.headers.cookie || event.headers.Cookie));
  const stateCookie = cookies.st_oauth_state;

  if (!code) return { statusCode: 400, body: "Missing 'code'." };
  if (!stateQuery || !stateCookie || stateQuery !== stateCookie) {
    return { statusCode: 400, body: "Invalid state." };
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  let resp, json;
  try {
    resp = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
        Accept: "application/json",
      },
      body: body.toString(),
    });
    json = await resp.json();
  } catch (err) {
    return { statusCode: 502, body: `Token exchange failed: ${err.message}` };
  }

  if (!resp.ok || !json.refresh_token) {
    return {
      statusCode: resp.status || 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: json.error || "token_exchange_failed", description: json.error_description }),
    };
  }

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": "st_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    },
    body: htmlPage(json.refresh_token),
  };
};
