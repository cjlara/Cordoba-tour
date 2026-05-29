// upload.js — saves/deletes photos in GitHub repo /photos/ folder
const https = require("https");

const REPO   = process.env.GITHUB_REPO   || "";
const GTOKEN = process.env.GITHUB_TOKEN  || "";
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

  const token = (event.headers["x-admin-token"] || "").trim();
  const expected = (process.env.ADMIN_TOKEN || "cordoba2025").trim();
  if (token !== expected) return json(401, { error: "Token incorrecto" });

  if (!REPO || !GTOKEN) return json(500, {
    error: "Falta GITHUB_TOKEN o GITHUB_REPO en las variables de entorno de Netlify"
  });

  let body;
  try { body = JSON.parse(event.body); } catch { return json(400, { error: "JSON inválido" }); }

  const { key, data, mime } = body || {};

  // ── FIND existing file for a key (any extension) ───────────────────────────
  async function findExisting(key) {
    try {
      const files = await ghRequest("GET", "/repos/" + REPO + "/contents/photos?ref=" + BRANCH, null);
      if (!Array.isArray(files)) return null;
      const match = files.find(f => f.name.replace(/\.[^.]+$/, "") === key);
      return match || null; // { name, sha, path, download_url }
    } catch (e) {
      return null; // folder doesn't exist yet
    }
  }

  // ── DELETE ─────────────────────────────────────────────────────────────────
  if (event.httpMethod === "DELETE") {
    if (!key || !/^[a-z0-9_-]+$/.test(key)) return json(400, { error: "Key inválida" });
    try {
      const existing = await findExisting(key);
      if (!existing) return json(200, { ok: true, note: "Fichero no encontrado, ya eliminado" });
      await ghRequest("DELETE", "/repos/" + REPO + "/contents/" + existing.path, {
        message: "Remove photo: " + key,
        sha: existing.sha,
        branch: BRANCH,
      });
      return json(200, { ok: true });
    } catch (err) {
      return json(500, { error: err.message });
    }
  }

  // ── UPLOAD / REPLACE ───────────────────────────────────────────────────────
  if (event.httpMethod === "POST") {
    if (!key || !data || !mime) return json(400, { error: "Faltan key, data o mime" });
    if (!/^[a-z0-9_-]+$/.test(key)) return json(400, { error: "Key inválida" });

    const buf = Buffer.from(data, "base64");
    if (buf.length > 8 * 1024 * 1024) return json(413, { error: "Foto demasiado grande (máx 8MB)" });

    const ext = ({ "image/jpeg":"jpg","image/jpg":"jpg","image/png":"png","image/webp":"webp" })[mime] || "jpg";
    const newPath = "photos/" + key + "." + ext;

    try {
      // If a file with this key already exists (possibly different extension), delete it first
      const existing = await findExisting(key);
      if (existing && existing.path !== newPath) {
        // Different extension — delete old file before writing new one
        await ghRequest("DELETE", "/repos/" + REPO + "/contents/" + existing.path, {
          message: "Replace photo: " + key + " (old: " + existing.name + ")",
          sha: existing.sha,
          branch: BRANCH,
        });
      }

      // Now create or update the file at the new path
      const payload = {
        message: "Add photo: " + key,
        content: data,
        branch: BRANCH,
      };
      // If same path exists, include sha to update in place
      if (existing && existing.path === newPath) {
        payload.message = "Update photo: " + key;
        payload.sha = existing.sha;
      }

      await ghRequest("PUT", "/repos/" + REPO + "/contents/" + newPath, payload);
      return json(200, { ok: true, key, path: newPath, bytes: buf.length });

    } catch (err) {
      return json(500, { error: err.message });
    }
  }

  return json(405, { error: "Método no permitido" });
};

function ghRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: "api.github.com",
      path,
      method,
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
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(d);
          if (res.statusCode >= 400) {
            const err = new Error(parsed.message || "GitHub API " + res.statusCode);
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
