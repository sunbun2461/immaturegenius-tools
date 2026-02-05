// ====== PASSWORD GATE (v1) ======
// For v1, hardcode. Later you can rotate it per Gumroad product if you want.
const ACCESS_PASSWORD = "CHANGE-ME";

const gateEl = document.getElementById("gate");
const appEl = document.getElementById("app");
const pwEl = document.getElementById("pw");
const gateErr = document.getElementById("gateErr");
const unlockBtn = document.getElementById("unlockBtn");

function showGate() {
	gateEl.style.display = "grid";
	appEl.style.display = "none";
}
function showApp() {
	gateEl.style.display = "none";
	appEl.style.display = "block";
}

// Persist unlock (so user doesn't retype every time)
const unlocked = localStorage.getItem("ig_unlocked") === "1";
if (unlocked) showApp(); else showGate();

unlockBtn.addEventListener("click", () => {
	const entered = (pwEl.value || "").trim();
	if (entered === ACCESS_PASSWORD) {
		localStorage.setItem("ig_unlocked", "1");
		showApp();
	} else {
		gateErr.style.display = "block";
		pwEl.value = "";
		pwEl.focus();
		setTimeout(() => gateErr.style.display = "none", 1800);
	}
});

pwEl.addEventListener("keydown", (e) => {
	if (e.key === "Enter") unlockBtn.click();
});

// ====== APP ======
const notesEl = document.getElementById("notes");
const lengthEl = document.getElementById("length");
const audienceEl = document.getElementById("audience");
const toneEl = document.getElementById("tone");
const genBtn = document.getElementById("genBtn");
const copyBtn = document.getElementById("copyBtn");
const payBtn = document.getElementById("payBtn");
const outEl = document.getElementById("output");
const previewBadgeEl = document.getElementById("previewBadge");
const statusEl = document.getElementById("status");
const loaderEl = document.getElementById("loader");
const loaderMsgEl = document.getElementById("loaderMsg");
const loaderBarEl = document.getElementById("loaderBar");
const LAST_INPUTS_KEY = "calmScriptBuilder:lastInputs";

function setStatus(msg) { statusEl.textContent = msg || ""; }

const LOADING_MESSAGES = [
	"thinking…",
	"organizing your ideas…",
	"turning chaos into calm…",
	"removing clickbait impulses…",
	"making it sound like you…"
];

let isGenerating = false;
let messageTimer = null;
let progressTimer = null;
let progressValue = 0;
let messageIndex = 0;

copyBtn.style.display = "none";
copyBtn.disabled = true;

function setPreviewLock(enabled) {
	if (enabled) {
		outEl.classList.add("preview-locked");
		if (previewBadgeEl) previewBadgeEl.classList.add("is-visible");
		return;
	}
	outEl.classList.remove("preview-locked");
	if (previewBadgeEl) previewBadgeEl.classList.remove("is-visible");
}

function truncatePreview(text, maxChars = 720) {
	const clean = (text || "").trim();
	if (!clean) return "";
	if (clean.length <= maxChars) return clean;
	return `${clean.slice(0, maxChars).trimEnd()}...`;
}

function setLoaderProgress(percent) {
	progressValue = Math.max(0, Math.min(100, percent));
	loaderBarEl.style.width = `${progressValue}%`;
}

function clearLoaderTimers() {
	if (messageTimer) {
		clearInterval(messageTimer);
		messageTimer = null;
	}
	if (progressTimer) {
		clearInterval(progressTimer);
		progressTimer = null;
	}
}

function startLoader() {
	clearLoaderTimers();
	messageIndex = 0;
	setLoaderProgress(0);
	loaderMsgEl.textContent = LOADING_MESSAGES[messageIndex];
	messageIndex += 1;
	loaderEl.classList.add("is-on");
	loaderEl.setAttribute("aria-hidden", "false");
	outEl.classList.add("is-loading");

	messageTimer = setInterval(() => {
		loaderMsgEl.textContent = LOADING_MESSAGES[messageIndex % LOADING_MESSAGES.length];
		messageIndex += 1;
	}, 1500);

	progressTimer = setInterval(() => {
		const remaining = 90 - progressValue;
		if (remaining <= 0.3) {
			setLoaderProgress(90);
			return;
		}
		const step = Math.max(0.45, remaining * 0.08);
		setLoaderProgress(Math.min(90, progressValue + step));
	}, 180);
}

async function stopLoader(success) {
	clearLoaderTimers();
	if (success) {
		setLoaderProgress(100);
		await new Promise((resolve) => setTimeout(resolve, 220));
	}
	loaderEl.classList.remove("is-on");
	loaderEl.setAttribute("aria-hidden", "true");
	outEl.classList.remove("is-loading");
	setLoaderProgress(0);
}

async function generate() {
	if (isGenerating) return;

	const notes = (notesEl.value || "").trim();
	if (!notes) {
		outEl.textContent = "Paste some notes first.";
		return;
	}

	const opts = {
		length: lengthEl.value,
		audience: audienceEl.value,
		tone: toneEl.value
	};

	isGenerating = true;
	genBtn.disabled = true;
	genBtn.textContent = "Generating...";
	copyBtn.disabled = true;
	payBtn.disabled = true;
	outEl.textContent = "";
	setStatus("");
	startLoader();

	try {
		const res = await fetch("/.netlify/functions/generate", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				prompt: notes,
				tone: opts.tone,
				audience: opts.audience,
				length: opts.length,
				mode: "preview"
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

		if (!res.ok) {
			const rawError = raw ? raw.trim() : "";
			const errorMessage = data?.error || rawError || `Server error (${res.status})`;
			throw new Error(errorMessage);
		}

		outEl.textContent = truncatePreview(data.text) || "(no output)";
		payBtn.disabled = !data.text;
		setPreviewLock(!!data.text);
		setStatus("done");
		await stopLoader(true);
	} catch (err) {
		outEl.textContent = "Error: " + (err?.message || String(err));
		payBtn.disabled = true;
		setPreviewLock(false);
		setStatus("error");
		await stopLoader(false);
	} finally {
		isGenerating = false;
		genBtn.disabled = false;
		genBtn.textContent = "Generate";
		setTimeout(() => setStatus(""), 1200);
	}
}

genBtn.addEventListener("click", generate);

async function startCheckoutFlow() {
	const notes = (notesEl.value || "").trim();
	if (!notes) {
		setStatus("generate a script first");
		setTimeout(() => setStatus(""), 1200);
		return;
	}
	localStorage.setItem(LAST_INPUTS_KEY, JSON.stringify({
		prompt: notes,
		tone: toneEl.value,
		audience: audienceEl.value,
		length: lengthEl.value
	}));
	payBtn.disabled = true;
	const originalLabel = payBtn.textContent;
	payBtn.textContent = "Redirecting...";

	try {
		const res = await fetch("/.netlify/functions/createCheckoutSession", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({})
		});

		const raw = await res.text();
		let data;
		try {
			data = raw ? JSON.parse(raw) : null;
		} catch {
			data = null;
		}
		if (!data || typeof data !== "object") data = {};

		if (!res.ok || !data.url) {
			const rawError = raw ? raw.trim() : "";
			const errorMessage = data?.error || rawError || `Checkout error (${res.status})`;
			throw new Error(errorMessage);
		}

		window.location.href = data.url;
	} catch (err) {
		setStatus("payment failed");
		outEl.textContent = "Error: " + (err?.message || String(err));
		payBtn.disabled = false;
		payBtn.textContent = originalLabel;
		setTimeout(() => setStatus(""), 1600);
	}
}

payBtn.addEventListener("click", startCheckoutFlow);
if (previewBadgeEl) {
	previewBadgeEl.addEventListener("click", startCheckoutFlow);
}
