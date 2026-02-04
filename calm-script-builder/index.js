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

function setStatus(msg) { statusEl.textContent = msg || ""; }

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

	genBtn.disabled = true;
	copyBtn.disabled = true;
	outEl.textContent = "";
	setStatus("thinking…");

	try {
		const res = await fetch("/.netlify/functions/generate", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				prompt: PROMPT_TEMPLATE(notes, opts)
			})
		});

		if (!res.ok) {
			const txt = await res.text();
			throw new Error(`Server error (${res.status}): ${txt}`);
		}

		const data = await res.json();
		outEl.textContent = data.text || "(no output)";
		copyBtn.disabled = false;
		setStatus("done");
	} catch (err) {
		outEl.textContent = "Error: " + (err?.message || String(err));
		setStatus("error");
	} finally {
		genBtn.disabled = false;
		setTimeout(() => setStatus(""), 1200);
	}
}

genBtn.addEventListener("click", generate);

copyBtn.addEventListener("click", async () => {
	try {
		await navigator.clipboard.writeText(outEl.textContent || "");
		setStatus("copied");
		setTimeout(() => setStatus(""), 900);
	} catch {
		setStatus("copy failed");
		setTimeout(() => setStatus(""), 900);
	}
});