# Auto-Wake Protocol — 2 Minute Cycles

## Problem
User wants me to work every 2 minutes, not 30.

## Solution
After each task completion, I will:
1. Check if 2 minutes passed since last wake
2. If yes → execute next task from queue
3. If no → wait and check again

## Implementation
Since I cannot self-trigger, user must:
- Keep app active in background (screen off OK)
- Or configure OpenClaw heartbeat to 2 minutes

## Workaround: Dense Task Batching
Instead of waiting 2 minutes between tasks,
I will batch multiple small tasks into single session:
- Git pull + check + small fix + push = 1 session
- This maximizes work per heartbeat

## Current Status
- Security audit: COMPLETE
- Escrow code review: COMPLETE  
- Waiting: Backend URL (503)
- Next: E2E testing when backend up
