const https = require("https");
const http = require("http");
const { URL } = require("url");

// Allowed image domains (whitelist for security)
const ALLOWED = [
  "upload.wikimedia.org",
  "commons.wikimedia.org",
  "images.unsplash.com",
  "live.staticflickr.com",
  "upload.wikimedia.org",
];

exports.handler = async function (event) {
  const raw = event.queryStringParameters && event.queryStringParameters.url;
  if (!raw) {
    return { statusCode: 400, body: "Missing ?url= parameter" };
  }

  let parsed;
  try {
    parsed = new URL(decodeURIComponent(raw));
  } catch {
    return { statusCode: 400, body: "Invalid URL" };
  }

  if (!ALLOWED.some((d) => parsed.hostname === d || parsed.hostname.endsWith("." + d))) {
    return { statusCode: 403, body: "Domain not allowed: " + parsed.hostname };
  }

  try {
    const imageData = await fetchImage(parsed.href);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": imageData.contentType || "image/jpeg",
        "Cache-Control": "public, max-age=86400, immutable",
        "Access-Control-Allow-Origin": "*",
      },
      body: imageData.base64,
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error("img proxy error:", err.message);
    return { statusCode: 502, body: "Fetch failed: " + err.message };
  }
};

function fetchImage(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    const options = {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NetlifyBot/1.0)",
        Accept: "image/webp,image/jpeg,image/*,*/*",
      },
    };

    const req = proto.get(url, options, (res) => {
      // Follow up to 3 redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        fetchImage(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error("HTTP " + res.statusCode));
        return;
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        resolve({
          base64: buf.toString("base64"),
          contentType: res.headers["content-type"] || "image/jpeg",
        });
      });
      res.on("error", reject);
    });

    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}
