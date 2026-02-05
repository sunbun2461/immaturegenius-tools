const MAX_PROMPT_CHARS = 4000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const COOLDOWN_MS = 3 * 1000;
const OPENAI_MAX_TOKENS = 1600;
const ipRequestState = new Map();
const RESPONSE_HEADERS = {
	"Content-Type": "application/json",
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "Content-Type, Authorization",
	"Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(statusCode, payload) {
	return {
		statusCode,
		headers: RESPONSE_HEADERS,
		body: JSON.stringify(payload)
	};
}

function getMethod(event) {
	return String(
		event?.httpMethod
		|| event?.requestContext?.http?.method
		|| event?.requestContext?.httpMethod
		|| ""
	).toUpperCase();
}

function getHeader(headers, key) {
	if (!headers || typeof headers !== "object") return "";
	if (headers[key]) return headers[key];
	const lowered = key.toLowerCase();
	for (const [name, value] of Object.entries(headers)) {
		if (name.toLowerCase() === lowered) return value;
	}
	return "";
}

function getClientIp(event) {
	const directIp = getHeader(event.headers, "x-nf-client-connection-ip")
		|| getHeader(event.headers, "client-ip");
	if (directIp) return String(directIp).trim();

	const forwarded = getHeader(event.headers, "x-forwarded-for");
	if (forwarded) return String(forwarded).split(",")[0].trim();

	return "unknown";
}

function pruneRateLimitMap(now) {
	if (ipRequestState.size < 500) return;
	for (const [ip, state] of ipRequestState.entries()) {
		if (now - state.lastSeen > RATE_LIMIT_WINDOW_MS * 2) {
			ipRequestState.delete(ip);
		}
	}
}

function enforceAbuseControls(ip, now) {
	const state = ipRequestState.get(ip) || {
		requestTimes: [],
		lastRequestAt: 0,
		lastSeen: now
	};

	state.lastSeen = now;
	state.requestTimes = state.requestTimes.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);

	const msSinceLastRequest = now - state.lastRequestAt;
	if (state.lastRequestAt && msSinceLastRequest < COOLDOWN_MS) {
		const waitSeconds = Math.ceil((COOLDOWN_MS - msSinceLastRequest) / 1000);
		ipRequestState.set(ip, state);
		return `Cooldown active: wait ${waitSeconds}s before the next request.`;
	}

	if (state.requestTimes.length >= RATE_LIMIT_MAX_REQUESTS) {
		ipRequestState.set(ip, state);
		return "Rate limit reached: max 10 requests per 10 minutes per IP.";
	}

	state.requestTimes.push(now);
	state.lastRequestAt = now;
	ipRequestState.set(ip, state);
	return "";
}

exports.handler = async function (event) {
	try {
		const method = getMethod(event);
		if (method === "OPTIONS") {
			return jsonResponse(200, { text: "" });
		}
		if (method !== "POST") {
			return jsonResponse(405, { error: "Method not allowed." });
		}

		const now = Date.now();
		pruneRateLimitMap(now);
		const ip = getClientIp(event);
		const abuseError = enforceAbuseControls(ip, now);
		if (abuseError) {
			return jsonResponse(429, { error: abuseError });
		}

		let body;
		try {
			body = JSON.parse(event.body || "{}");
		} catch {
			return jsonResponse(400, { error: "Invalid JSON body." });
		}

		const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
		if (!prompt) {
			return jsonResponse(400, { error: "Missing prompt." });
		}
		if (prompt.length > MAX_PROMPT_CHARS) {
			return jsonResponse(400, { error: `Prompt too long (max ${MAX_PROMPT_CHARS} chars).` });
		}

		const apiKey = process.env.OPENAI_API_KEY;
		if (!apiKey) {
			return jsonResponse(500, { error: "Missing OPENAI_API_KEY env var." });
		}

		const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
		const resp = await fetch("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${apiKey}`
			},
			body: JSON.stringify({
				model,
				temperature: 0.6,
				max_tokens: OPENAI_MAX_TOKENS,
				messages: [
					{ role: "system", content: "You are a calm, thoughtful YouTube script coach." },
					{ role: "user", content: prompt }
				]
			})
		});

		if (!resp.ok) {
			let message = "Upstream API error.";
			const rawError = await resp.text();
			if (rawError) {
				try {
					const errJson = JSON.parse(rawError);
					message = errJson?.error?.message || rawError;
				} catch {
					message = rawError;
				}
			}
			return jsonResponse(resp.status, { error: message });
		}

		const json = await resp.json();
		const text = json?.choices?.[0]?.message?.content || "";

		return jsonResponse(200, { text });
	} catch (error) {
		return jsonResponse(500, { error: `Server error: ${error?.message || error}` });
	}
};
