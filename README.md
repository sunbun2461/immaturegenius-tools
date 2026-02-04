# immaturegenius-tools
A collection of small, opinionated AI-powered tools focused on clarity over hype.
ImmatureGenius Tools

A collection of small, opinionated AI-powered tools focused on clarity over hype.

These tools are intentionally:

narrow

calm

low-friction

non-performative

They are not platforms.
They are not startups.
They are thinking aids.

Calm Script Builder

Calm Script Builder turns messy YouTube ideas into a clear, thoughtful script structure.

It’s designed for creators who:

think deeply

dislike clickbait

prefer reflective, grounded videos

want structure without hype

What it does

You paste rough notes, half-formed ideas, or a rambling paragraph.

It returns:

clear title options (non-clickbait)

a one-sentence premise

a quiet hook

a timestamped outline

a 60–90 second opening script

reusable key lines

a soft, non-pushy close

Tone defaults to calm and reflective, not loud or algorithm-chasing.

Why this exists

Most “AI YouTube tools” optimize for:

virality

growth hacks

engagement tricks

This tool optimizes for:

clarity

coherence

honesty

thinking before speaking

It’s for people who want their videos to feel considered, not engineered.

How it works (high level)

Static HTML + vanilla JS frontend

Password-gated (no accounts, no tracking)

Serverless OpenAI API calls via Netlify Functions

Payments handled externally (Gumroad)

There is no database, no user system, and no persistence by design.

Repository structure
/
├─ tools/
│  └─ calm-script-builder/
│     └─ index.html
├─ netlify/
│  └─ functions/
│     └─ generate.js
├─ netlify.toml
└─ README.md



More tools may be added under /tools using the same pattern.

Philosophy

This project follows a few rules:

Create once, don’t babysit

Avoid business theater

Prefer usefulness over scale

Keep expectations low and honest

Reduce friction for both users and the builder

If a tool stops being useful, it can quietly disappear.
No lock-in. No guilt.

Deployment

Domain is managed externally

Tools are hosted on Netlify

Subdomain routing is used (tools.immaturegenius.com)

Environment variables:

OPENAI_API_KEY

optional: OPENAI_MODEL

Future direction (optional)

If a tool proves genuinely useful:

it may be rebuilt in React

it may be adapted for React Native

it may remain exactly as it is

No roadmap promises.

License

Personal project.
Use, modify, or learn from the code responsibly.
