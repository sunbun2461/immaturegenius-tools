const Stripe = require("stripe");

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

exports.handler = async function (event) {
	try {
		const method = getMethod(event);
		if (method === "OPTIONS") {
			return jsonResponse(200, { ok: true });
		}
		if (method !== "POST") {
			return jsonResponse(405, { error: "Method not allowed." });
		}

		const secretKey = process.env.STRIPE_SECRET_KEY;
		if (!secretKey) {
			return jsonResponse(500, { error: "Missing STRIPE_SECRET_KEY env var." });
		}

		let body;
		try {
			body = JSON.parse(event.body || "{}");
		} catch {
			return jsonResponse(400, { error: "Invalid JSON body." });
		}

		const sessionId = typeof body?.session_id === "string" ? body.session_id.trim() : "";
		if (!sessionId) {
			return jsonResponse(400, { error: "Missing session_id." });
		}

		const stripe = new Stripe(secretKey);
		const session = await stripe.checkout.sessions.retrieve(sessionId);
		if (session?.payment_status === "paid") {
			return jsonResponse(200, { ok: true });
		}

		return jsonResponse(403, { ok: false, error: "Payment not verified." });
	} catch (error) {
		return jsonResponse(500, { error: `Server error: ${error?.message || error}` });
	}
};
