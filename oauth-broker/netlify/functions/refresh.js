"use strict";

const TOKEN_URL = "https://api.smartthings.com/oauth/token";

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const clientId = process.env.ST_CLIENT_ID;
  const clientSecret = process.env.ST_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return { statusCode: 500, body: "Server misconfigured." };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON." };
  }

  const refreshToken = payload.refresh_token;
  if (!refreshToken || typeof refreshToken !== "string") {
    return { statusCode: 400, body: "Missing refresh_token." };
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
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
    return { statusCode: 502, body: `Refresh failed: ${err.message}` };
  }

  return {
    statusCode: resp.status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(json),
  };
};
