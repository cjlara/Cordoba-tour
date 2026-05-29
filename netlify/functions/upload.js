// netlify/functions/upload.js
// Receives a photo (base64), stores it in Netlify Blobs
// POST { key: "s0-1", data: "<base64>", mime: "image/jpeg" }

const { getStore } = require("@netlify/blobs");

exports.handler = async function (event) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: cors, body: "" };
  if (event.httpMethod !== "POST" && event.httpMethod !== "DELETE") {
    return { statusCode: 405, headers: cors, body: "Method not allowed" };
  }

  // Simple token auth — set ADMIN_TOKEN in Netlify env vars
  const token = event.headers["x-admin-token"] || "";
  const expected = process.env.ADMIN_TOKEN || "cordoba2025";
  if (token !== expected) {
    return { statusCode: 401, headers: cors, body: "Unauthorized" };
  }

  const store = getStore({ name: "photos", consistency: "strong" });

  // DELETE a photo
  if (event.httpMethod === "DELETE") {
    const { key } = JSON.parse(event.body || "{}");
    if (!key) return { statusCode: 400, headers: cors, body: "Missing key" };
    await store.delete(key);
    return { statusCode: 200, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify({ ok: true }) };
  }

  // POST: upload photo
  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, headers: cors, body: "Invalid JSON" }; }

  const { key, data, mime } = body;
  if (!key || !data || !mime) return { statusCode: 400, headers: cors, body: "Missing key, data or mime" };

  // Validate key format: s0-1, s0-2, hero, etc.
  if (!/^[a-z0-9_-]+$/.test(key)) return { statusCode: 400, headers: cors, body: "Invalid key" };

  // Decode base64
  const buf = Buffer.from(data, "base64");
  if (buf.length > 8 * 1024 * 1024) return { statusCode: 413, headers: cors, body: "Image too large (max 8MB)" };

  await store.set(key, buf, { metadata: { mime, uploaded: new Date().toISOString() } });

  return {
    statusCode: 200,
    headers: { ...cors, "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true, key, size: buf.length }),
  };
};
