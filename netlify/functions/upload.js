// upload.js — saves photos to GitHub repo via API
// Env vars needed: GITHUB_TOKEN, GITHUB_REPO (e.g. "cjlara/cordoba-tour")

const https = require("https");

const REPO   = process.env.GITHUB_REPO  || "";
const GTOKEN = process.env.GITHUB_TOKEN || "";
const BRANCH = process.env.GITHUB_BRANCH || "main";

exports.handler = async function (event) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-admin-token",
    "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  };
  const json = (code, obj) => ({
    statusCode: code,
    headers: { ...cors, "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  });

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: cors, body: "" };

  // Auth
  const token = (event.headers["x-admin-token"] || "").trim();
  const expected = (process.env.ADMIN_TOKEN || "cordoba2025").trim();
  if (token !== expected) return json(401, { error: "Token incorrecto" });

  if (!REPO || !GTOKEN) return json(500, {
    error: "Variables de entorno faltantes: GITHUB_REPO y/o GITHUB_TOKEN no configuradas en Netlify"
  });

  let body;
  try { body = JSON.parse(event.body); }
  catch { return json(400, { error: "JSON inválido" }); }

  const { key, data, mime } = body || {};

  if (event.httpMethod === "DELETE") {
    if (!key || !/^[a-z0-9_-]+$/.test(key)) return json(400, { error: "Key inválida" });
    try {
      const ext = extFromMime(mime || "image/jpeg");
      const path = "photos/" + key + "." + ext;
      // Get current SHA to delete
      const info = await ghRequest("GET", "/repos/" + REPO + "/contents/" + path, null);
      if (info.sha) {
        await ghRequest("DELETE", "/repos/" + REPO + "/contents/" + path, {
          message: "Remove photo: " + key,
          sha: info.sha,
          branch: BRANCH,
        });
      }
      return json(200, { ok: true });
    } catch (err) {
      if (err.status === 404) return json(200, { ok: true }); // already gone
      return json(500, { error: err.message });
    }
  }

  if (event.httpMethod === "POST") {
    if (!key || !data || !mime) return json(400, { error: "Faltan key, data o mime" });
    if (!/^[a-z0-9_-]+$/.test(key)) return json(400, { error: "Key inválida (solo a-z, 0-9, - _)" });

    const buf = Buffer.from(data, "base64");
    if (buf.length > 8 * 1024 * 1024) return json(413, { error: "Foto demasiado grande (máx 8MB)" });

    const ext = extFromMime(mime);
    const path = "photos/" + key + "." + ext;

    try {
      // Check if file already exists (need SHA to update)
      let sha = null;
      try {
        const existing = await ghRequest("GET", "/repos/" + REPO + "/contents/" + path, null);
        sha = existing.sha || null;
      } catch (e) { /* file doesn't exist yet, sha stays null */ }

      const payload = {
        message: (sha ? "Update" : "Add") + " photo: " + key,
        content: data,  // base64
        branch: BRANCH,
      };
      if (sha) payload.sha = sha;

      await ghRequest("PUT", "/repos/" + REPO + "/contents/" + path, payload);
      return json(200, { ok: true, key, path, bytes: buf.length });

    } catch (err) {
      return json(500, { error: err.message });
    }
  }

  return json(405, { error: "Método no permitido" });
};

function extFromMime(mime) {
  const map = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp" };
  return map[mime] || "jpg";
}

function ghRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: "api.github.com",
      path: path,
      method: method,
      headers: {
        "User-Agent": "cordoba-tour-app",
        "Authorization": "Bearer " + GTOKEN,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
    };
    if (payload) opts.headers["Content-Length"] = Buffer.byteLength(payload);

    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            const err = new Error(parsed.message || "GitHub API error " + res.statusCode);
            err.status = res.statusCode;
            return reject(err);
          }
          resolve(parsed);
        } catch (e) {
          if (res.statusCode >= 400) return reject(new Error("HTTP " + res.statusCode));
          resolve({});
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Timeout")); });
    if (payload) req.write(payload);
    req.end();
  });
}
