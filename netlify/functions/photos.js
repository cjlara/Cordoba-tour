// netlify/functions/photos.js
// GET /.netlify/functions/photos
// Returns JSON map of { key: url } for all uploaded photos

const { getStore } = require("@netlify/blobs");

exports.handler = async function (event) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  try {
    const store = getStore({ name: "photos", consistency: "strong" });
    const { blobs } = await store.list();

    const result = {};
    for (const blob of blobs) {
      result[blob.key] = "/.netlify/functions/photo?key=" + blob.key;
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error("photos list error:", err.message);
    return { statusCode: 200, headers: cors, body: JSON.stringify({}) };
  }
};
