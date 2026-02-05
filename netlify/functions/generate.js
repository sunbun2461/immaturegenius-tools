const Stripe = require("stripe");

const MAX_PROMPT_CHARS = 4000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const COOLDOWN_MS = 3 * 1000;
const OPENAI_MAX_TOKENS = 1600;
const PREVIEW_MAX_TOKENS = 360;
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

function buildPreviewPrompt(notes, opts) {
	return `
You are a calm, thoughtful YouTube script coach.
Create PREVIEW-ONLY output from these notes.

Constraints:
- Audience: ${opts.audience}
- Tone: ${opts.tone}
- Target length: ${opts.length} minutes
- Keep it concise. Do not write a full script.

User notes:
${notes}

Output format (exactly):
### Hook
2-4 sentences

### Short outline
- 4-6 bullets max

### First paragraph
One paragraph only.
`.trim();
}

function buildFullPrompt(notes, opts) {
	return `
You are a calm, thoughtful YouTube script coach. Turn messy notes into a clear, reflective video structure with a quiet, grounded tone. Avoid hype, clickbait, or "SMASH LIKE" energy. Be concise, practical, and emotionally steady. Do not invent facts—if something is uncertain, phrase it as opinion or a question.

Constraints:
- Target length: ${opts.length} minutes
- Audience: ${opts.audience}
- Tone: ${opts.tone}

User notes:
${notes}

OUTPUT FORMAT (follow exactly):

### 1) Title options (5)
- Write 5 titles that are clear and intriguing without being clickbait.

### 2) One-sentence premise
- Summarize what this video is really about in one sentence.

### 3) Quiet hook (10–20 seconds)
- Write a short opening that feels like a thoughtful person talking to one viewer. No hype.

### 4) Structure (outline with timestamps)
- Provide a simple outline with 5–8 sections.
- Include rough timestamps for a ${opts.length} minute video.
- Each section should have 2–4 bullet points of what to say.

### 5) Script starter (first 60–90 seconds)
- Write the opening minute as actual spoken script, matching the tone.

### 6) Key lines to reuse (5)
- Give 5 strong lines or phrases the creator can reuse throughout the video.

### 7) Soft close + CTA (10–15 seconds)
- A calm closing thought + a non-pushy CTA.

### 8) "Tone check"
- 3 bullets: what to avoid saying (too harsh, too cringe, too vague).
- 3 bullets: what to lean into (clarity, honesty, personal insight).
`.trim();
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
		const mode = body?.mode === "full" ? "full" : "preview";
		const opts = {
			tone: typeof body?.tone === "string" ? body.tone.trim() || "calm" : "calm",
			audience: typeof body?.audience === "string" ? body.audience.trim() || "general" : "general",
			length: typeof body?.length === "string" ? body.length.trim() || "8-12" : "8-12"
		};

		const apiKey = process.env.OPENAI_API_KEY;
		if (!apiKey) {
			return jsonResponse(500, { error: "Missing OPENAI_API_KEY env var." });
		}

		if (mode === "full") {
			const sessionId = typeof body?.session_id === "string" ? body.session_id.trim() : "";
			if (!sessionId) {
				return jsonResponse(403, { error: "Payment required for full script." });
			}
			const stripeSecret = process.env.STRIPE_SECRET_KEY;
			if (!stripeSecret) {
				return jsonResponse(500, { error: "Missing STRIPE_SECRET_KEY env var." });
			}
			const stripe = new Stripe(stripeSecret);
			const session = await stripe.checkout.sessions.retrieve(sessionId);
			if (session?.payment_status !== "paid") {
				return jsonResponse(403, { error: "Payment required for full script." });
			}
		}

		const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
		const userPrompt = mode === "preview"
			? buildPreviewPrompt(prompt, opts)
			: buildFullPrompt(prompt, opts);
		const resp = await fetch("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${apiKey}`
			},
			body: JSON.stringify({
				model,
				temperature: 0.6,
				max_tokens: mode === "preview" ? PREVIEW_MAX_TOKENS : OPENAI_MAX_TOKENS,
				messages: [
					{ role: "system", content: "You are a calm, thoughtful YouTube script coach." },
					{ role: "user", content: userPrompt }
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
