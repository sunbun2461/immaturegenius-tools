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
const outEl = document.getElementById("output");
const statusEl = document.getElementById("status");
const loaderEl = document.getElementById("loader");
const loaderMsgEl = document.getElementById("loaderMsg");
const loaderBarEl = document.getElementById("loaderBar");

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

const PROMPT_TEMPLATE = (notes, opts) => `
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
	outEl.textContent = "";
	setStatus("");
	startLoader();

	try {
		const res = await fetch("/.netlify/functions/generate", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				prompt: PROMPT_TEMPLATE(notes, opts)
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

		outEl.textContent = data.text || "(no output)";
		copyBtn.disabled = !data.text;
		setStatus("done");
		await stopLoader(true);
	} catch (err) {
		outEl.textContent = "Error: " + (err?.message || String(err));
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

async function copyText(text) {
	if (navigator.clipboard && navigator.clipboard.writeText) {
		await navigator.clipboard.writeText(text);
		return;
	}

	const helper = document.createElement("textarea");
	helper.value = text;
	helper.setAttribute("readonly", "true");
	helper.style.position = "fixed";
	helper.style.opacity = "0";
	document.body.appendChild(helper);
	helper.focus();
	helper.select();
	const ok = document.execCommand("copy");
	document.body.removeChild(helper);
	if (!ok) {
		throw new Error("copy failed");
	}
}

copyBtn.addEventListener("click", async () => {
	const text = (outEl.textContent || "").trim();
	if (!text || text === "(no output)") {
		setStatus("nothing to copy");
		setTimeout(() => setStatus(""), 900);
		return;
	}

	try {
		await copyText(text);
		setStatus("copied");
		setTimeout(() => setStatus(""), 900);
	} catch {
		setStatus("copy failed");
		setTimeout(() => setStatus(""), 900);
	}
});
