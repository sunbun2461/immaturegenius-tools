const LAST_OUTPUT_KEY = "calmScriptBuilder:lastOutput";
const statusEl = document.getElementById("status");
const fallbackLinkEl = document.getElementById("fallbackLink");

function setStatus(text) {
	statusEl.textContent = text;
}

function getSessionId() {
	const params = new URLSearchParams(window.location.search);
	return (params.get("session_id") || "").trim();
}

function getStoredOutput() {
	return (localStorage.getItem(LAST_OUTPUT_KEY) || "").trim();
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

(async function init() {
	try {
		const sessionId = getSessionId();
		if (!sessionId) {
			setStatus("Missing session ID. Please return to checkout and try again.");
			return;
		}

		const outputText = getStoredOutput();
		if (!outputText) {
			setStatus("Couldn't find your script text. Please go back and generate again.");
			return;
		}

		await verifyPayment(sessionId);
		downloadBlob(toMarkdown(outputText));
		setStatus("Your download should start automatically.");
	} catch (error) {
		setStatus(error?.message || "Payment not verified. Please try again.");
	}
})();
