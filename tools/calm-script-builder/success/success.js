const LAST_INPUTS_KEY = "calmScriptBuilder:lastInputs";
const statusEl = document.getElementById("status");
const fallbackLinkEl = document.getElementById("fallbackLink");

function setStatus(text) {
	statusEl.textContent = text;
}

function getSessionId() {
	const params = new URLSearchParams(window.location.search);
	return (params.get("session_id") || "").trim();
}

function getStoredInputs() {
	const raw = localStorage.getItem(LAST_INPUTS_KEY) || "";
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return null;
		const prompt = typeof parsed.prompt === "string" ? parsed.prompt.trim() : "";
		if (!prompt) return null;
		return {
			prompt,
			tone: typeof parsed.tone === "string" ? parsed.tone : "calm",
			audience: typeof parsed.audience === "string" ? parsed.audience : "general",
			length: typeof parsed.length === "string" ? parsed.length : "8-12"
		};
	} catch {
		return null;
	}
}

function toMarkdown(text) {
	const generatedAt = new Date().toISOString();
	return `# Calm Script Builder Output\n\nGenerated at: ${generatedAt}\n\n---\n\n${text}\n`;
}

function downloadBlob(markdown) {
	const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = "calm-script.md";
	link.style.display = "none";
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);

	fallbackLinkEl.href = url;
	fallbackLinkEl.classList.add("is-visible");

	window.addEventListener("beforeunload", () => {
		URL.revokeObjectURL(url);
	});
}

async function verifyPayment(sessionId) {
	const res = await fetch("/.netlify/functions/verifySession", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ session_id: sessionId })
	});

	const raw = await res.text();
	let data;
	try {
		data = raw ? JSON.parse(raw) : null;
	} catch {
		data = null;
	}
	if (!data || typeof data !== "object") data = {};

	if (!res.ok || data.ok !== true) {
		const rawError = raw ? raw.trim() : "";
		throw new Error(data?.error || rawError || "Payment not verified. Please try again.");
	}
}

async function generateFullScript(inputs, sessionId) {
	const res = await fetch("/.netlify/functions/generate", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			prompt: inputs.prompt,
			tone: inputs.tone,
			audience: inputs.audience,
			length: inputs.length,
			mode: "full",
			session_id: sessionId
		})
	});

	const raw = await res.text();
	let data;
	try {
		data = raw ? JSON.parse(raw) : null;
	} catch {
		data = null;
	}
	if (!data || typeof data !== "object") data = {};
	if (!res.ok || !data.text) {
		const rawError = raw ? raw.trim() : "";
		throw new Error(data?.error || rawError || "Couldn't generate full script.");
	}
	return data.text;
}

(async function init() {
	try {
		const sessionId = getSessionId();
		if (!sessionId) {
			setStatus("Missing session ID. Please return to checkout and try again.");
			return;
		}

		const inputs = getStoredInputs();
		if (!inputs) {
			setStatus("Couldn't find your script text. Please go back and generate again.");
			return;
		}

		await verifyPayment(sessionId);
		setStatus("Payment verified. Building your full script...");
		const fullText = await generateFullScript(inputs, sessionId);
		downloadBlob(toMarkdown(fullText));
		localStorage.removeItem(LAST_INPUTS_KEY);
		setStatus("Your download should start automatically.");
	} catch (error) {
		setStatus(error?.message || "Payment not verified. Please try again.");
	}
})();
