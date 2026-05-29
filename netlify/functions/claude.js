const https = require("https");

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders(), body: "Method not allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: corsHeaders(), body: "Invalid JSON" };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: { message: "ANTHROPIC_API_KEY no configurada en Netlify" } }) };
  }

  try {
    const result = await callClaude(apiKey, body.messages, body.system);
    return {
      statusCode: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error("claude proxy error:", err.message);
    return {
      statusCode: 200, // return 200 so frontend can parse the error JSON
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ error: { message: err.message } }),
    };
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function callClaude(apiKey, messages, system) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: "claude-opus-4-5",
      max_tokens: 3000,
      system: system || "Eres un experto historiador y guia turistica de Cordoba, Espana.",
      messages,
    });

    const req = https.request(
      {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (e) {
            reject(new Error("Parse error: " + data.slice(0, 300)));
          }
        });
      }
    );

    req.on("error", reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error("Timeout tras 30s")); });
    req.write(payload);
    req.end();
  });
}
