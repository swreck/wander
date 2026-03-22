---
name: iPhone Remote Access Plan
description: How to use Claude Code from iPhone via GitHub Codespaces while traveling, without needing Mac access
type: reference
---

# iPhone Remote Access to Claude Code

## Goal
Edit and deploy Wander (and other apps) from iPhone while traveling, without remote access to the managed Mac.

## Solution: GitHub Codespaces
A cloud Linux VM accessible from iPhone Safari, with Claude Code installed.

## Setup Steps (10-15 min)
1. Go to github.com/swreck/wander → Code → Codespaces → create one
2. In Codespace terminal: `npm install -g @anthropic-ai/claude-code`
3. Run `claude` and log in with Max account
4. Test: make a small edit, push to main, confirm Railway auto-deploys
5. Open the Codespace from iPhone Safari, verify terminal is usable

## How It Works
- Mac stays the primary dev machine (nothing changes day-to-day)
- Codespace is a second copy of the repo, used only when traveling
- Push to GitHub main → Railway auto-deploys (same pipeline)
- After trip: `git pull` on Mac to sync changes made from the road

## Key Details
- GitHub free tier: 120 core-hours/month (plenty for occasional fixes)
- The iPhone experience is Claude Code in a browser terminal — same conversational workflow
- Typing is on phone keyboard but user only describes changes, doesn't write code
- Need to verify iPhone Safari + VS Code terminal comfort before relying on it

## Status
Not yet set up. Revisit before next trip. Tech may evolve (watch for Claude Code mobile features).
