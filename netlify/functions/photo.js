// netlify/functions/photo.js
// GET /.netlify/functions/photo?key=s0-1
// Returns the image bytes from Netlify Blobs

const { getStore } = require("@netlify/blobs");

exports.handler = async function (event) {
  const key = event.queryStringParameters && event.queryStringParameters.key;
  if (!key || !/^[a-z0-9_-]+$/.test(key)) {
    return { statusCode: 400, body: "Invalid key" };
  }

  try {
    const store = getStore({ name: "photos", consistency: "strong" });
    const blob = await store.getWithMetadata(key, { type: "arrayBuffer" });

    if (!blob) return { statusCode: 404, body: "Not found" };

    const mime = blob.metadata?.mime || "image/jpeg";
    const buf = Buffer.from(blob.data);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": mime,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
      },
      body: buf.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error("photo fetch error:", err.message);
    return { statusCode: 404, body: "Not found" };
  }
};
