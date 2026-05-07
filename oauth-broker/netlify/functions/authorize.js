"use strict";

const crypto = require("crypto");

const AUTHORIZE_URL = "https://api.smartthings.com/oauth/authorize";

exports.handler = async function () {
  const clientId = process.env.ST_CLIENT_ID;
  const redirectUri = process.env.ST_REDIRECT_URI;
  const scopes = process.env.ST_SCOPES || "r:devices:* x:devices:*";

  if (!clientId || !redirectUri) {
    return {
      statusCode: 500,
      body: "Server misconfigured: ST_CLIENT_ID or ST_REDIRECT_URI missing.",
    };
  }

  const state = crypto.randomBytes(24).toString("base64url");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes,
    state,
  });

  return {
    statusCode: 302,
    headers: {
      Location: `${AUTHORIZE_URL}?${params.toString()}`,
      "Set-Cookie": `st_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      "Cache-Control": "no-store",
    },
    body: "",
  };
};
