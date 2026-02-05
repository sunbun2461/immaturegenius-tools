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

function getHeader(headers, key) {
	if (!headers || typeof headers !== "object") return "";
	if (headers[key]) return headers[key];
	const lowered = key.toLowerCase();
	for (const [name, value] of Object.entries(headers)) {
		if (name.toLowerCase() === lowered) return value;
	}
	return "";
}

function getMethod(event) {
	return String(
		event?.httpMethod
		|| event?.requestContext?.http?.method
		|| event?.requestContext?.httpMethod
		|| ""
	).toUpperCase();
}

function getSiteOrigin(event) {
	const host = getHeader(event?.headers, "x-forwarded-host") || getHeader(event?.headers, "host");
	const proto = getHeader(event?.headers, "x-forwarded-proto") || "https";
	if (!host) return "https://tools.immaturegenius.com";
	return `${proto}://${host}`;
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

		const stripe = new Stripe(secretKey);
		const siteOrigin = getSiteOrigin(event);
		const successUrl = `${siteOrigin}/tools/calm-script-builder/success/?session_id={CHECKOUT_SESSION_ID}`;
		const cancelUrl = `${siteOrigin}/tools/calm-script-builder/`;
		const session = await stripe.checkout.sessions.create({
			mode: "payment",
			success_url: successUrl,
			cancel_url: cancelUrl,
			line_items: [
				{
					price_data: {
						currency: "usd",
						unit_amount: 700,
						product_data: {
							name: "Calm Script Builder — Pay & Download"
						}
					},
					quantity: 1
				}
			]
		});

		if (!session?.url) {
			return jsonResponse(500, { error: "Could not create checkout session." });
		}

		return jsonResponse(200, { url: session.url });
	} catch (error) {
		return jsonResponse(500, { error: `Server error: ${error?.message || error}` });
	}
};
