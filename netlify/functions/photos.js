// photos.js — lists photos from GitHub repo /photos/ folder

const https = require("https");

const REPO   = process.env.GITHUB_REPO  || "";
const GTOKEN = process.env.GITHUB_TOKEN || "";
const BRANCH = process.env.GITHUB_BRANCH || "main";

exports.handler = async function () {
  const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

  if (!REPO || !GTOKEN) {
    return { statusCode: 200, headers: cors, body: JSON.stringify({}) };
  }

  try {
    const files = await ghGet("/repos/" + REPO + "/contents/photos?ref=" + BRANCH);
    const result = {};

    for (const f of (Array.isArray(files) ? files : [])) {
      if (f.type !== "file") continue;
      // key = filename without extension (e.g. "s0-1.jpg" -> "s0-1")
      const key = f.name.replace(/\.[^.]+$/, "");
      // Use raw GitHub URL (public repo) or download_url
      result[key] = f.download_url;
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify(result) };
  } catch (err) {
    // /photos folder doesn't exist yet — return empty, app uses defaults
    console.log("photos list:", err.message);
    return { statusCode: 200, headers: cors, body: JSON.stringify({}) };
  }
};

function ghGet(path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "api.github.com",
      path: path,
      method: "GET",
      headers: {
        "User-Agent": "cordoba-tour-app",
        "Authorization": "Bearer " + GTOKEN,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            const err = new Error((parsed.message || "HTTP " + res.statusCode));
            err.status = res.statusCode;
            return reject(err);
          }
          resolve(parsed);
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("Timeout")); });
    req.end();
  });
}
