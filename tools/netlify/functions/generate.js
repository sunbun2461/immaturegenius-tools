// netlify/functions/generate.js
export async function handler(event) {
	try {
		if (event.httpMethod !== "POST") {
			return { statusCode: 405, body: "Method Not Allowed" };
		}

		const { prompt } = JSON.parse(event.body || "{}");
		if (!prompt || typeof prompt !== "string") {
			return { statusCode: 400, body: "Missing prompt" };
		}

		const apiKey = process.env.OPENAI_API_KEY;
		if (!apiKey) {
			return { statusCode: 500, body: "Missing OPENAI_API_KEY env var" };
		}

		// Choose a model you have access to. Keep it modest for cost.
		const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

		// Using Chat Completions style request for broad compatibility
		const resp = await fetch("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${apiKey}`
			},
			body: JSON.stringify({
				model,
				temperature: 0.6,
				messages: [
					{ role: "system", content: "You are a calm, thoughtful YouTube script coach." },
					{ role: "user", content: prompt }
				]
			})
		});

		if (!resp.ok) {
			const errText = await resp.text();
			return { statusCode: resp.status, body: errText };
		}

		const json = await resp.json();
		const text = json?.choices?.[0]?.message?.content || "";

		return {
			statusCode: 200,
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ text })
		};
	} catch (e) {
		return { statusCode: 500, body: `Server error: ${e?.message || e}` };
	}
}
