---
name: gcsc-autonomous-work
description: >
  Autonomous non-stop work protocol for GCSC Smart Contractor and all future projects.
  When loaded, this skill enables continuous task execution without waiting for user
  input. Tasks are picked from a prioritized queue, executed to completion, and
  progress is reported at milestones. Use whenever Serhiy asks for non-stop work,
  autonomous development, or when he gives blanket permission to "do what's needed."
  
  Triggers:
  - "работай нон-стоп" / "non-stop"
  - "не останавливайся" / "don't stop"
  - "делай что считаешь нужным" / "do what you think is needed"
  - "у меня нет времени" / "I don't have time"
  - "работай без моего участия" / "work without me"
  - Any blanket permission to proceed independently
---

# GCSC Autonomous Work Protocol

## Core Directive

Work NON-STOP. Pick tasks from the queue, execute them, report progress, move to next.
Never wait for user confirmation between tasks. Never ask "should I proceed?"

## Rules (Absolute)

1. **NEVER ask the user to choose between options** — make the decision
2. **NEVER ask "should I continue?"** — always continue
3. **NEVER ask for technical details** — research and decide yourself
4. **After task N completes** — immediately start task N+1 from the queue
5. **Report after milestones** — brief summary of what was done
6. **If blocked** — try alternative approach for 3 attempts, then move to next task
7. **Use all available tools** — web search, code execution, subagents, browser
8. **Research what you don't know** — Google it, don't ask Serhiy

## Task Queue System

### How Tasks Are Stored
- Task queue file: `/mnt/agents/output/references/task-queue.md`
- Serhiy adds tasks via conversation
- I read the queue at session start and after each task

### How Tasks Are Prioritized
1. **CRITICAL** — Blocking launch, must be done today
2. **HIGH** — Important feature, do within this session
3. **MEDIUM** — Improvement, do if time permits
4. **LOW** — Nice to have, do after everything else

### Task Lifecycle
1. Read queue → pick highest priority task
2. Mark task as IN_PROGRESS
3. Execute task to completion
4. Mark task as COMPLETED
5. Write brief progress note
6. Go to step 1

## Session Workflow

```
SESSION START
  |
  v
Read task queue
  |
  v
Is there a CRITICAL task? ----YES----> Execute it
  |                                        |
NO                                        v
  |                                  Mark COMPLETED
  v                                        |
Is there a HIGH task? ----YES-----> Execute it
  |                                        |
NO                                        v
  |                                  Mark COMPLETED
  v                                        |
[Repeat until queue empty]
  |
  v
If queue empty:
  - Run npm audit security check
  - Run code quality checks
  - Look for improvements in existing code
  - Prepare documentation for Serhiy
  |
  v
SESSION END — Final report to Serhiy
```

## What to Do When Blocked

1. **Try alternative approach** (different library, different method)
2. **Search the web** for solutions — use search tools
3. **Try workaround** — implement temporary fix
4. **Move to next task** — don't get stuck on one task
5. **Document the blocker** — write what happened and why

## Mandatory Quality Checks

Before marking any task as completed:
- [ ] Code syntax is valid (run `node -c` for JS, `python -m py_compile` for Python)
- [ ] No hardcoded secrets or credentials
- [ ] All API endpoints tested with curl
- [ ] Mobile responsive (check at 375px width)
- [ ] No console errors in browser
- [ ] Files uploaded to GitHub

## Progress Reporting Format

After completing each task, report:
```
✅ Task [N]: [Task Name] — DONE
   Duration: [X] minutes
   Files changed: [list]
   Key decisions: [brief]
   Next task: [Task N+1]
```

## Emergency Stop Conditions

Only stop working and ask Serhiy if:
1. **Money is involved** — real charges, production payments
2. **Domain/SSL issues** — DNS changes that could break live site
3. **Data loss risk** — deleting production data
4. **Legal compliance** — regulations, licenses, contracts

Everything else — decide and execute autonomously.

## Technology Decisions (Pre-Authorized)

Serhiy has pre-authorized these choices:
- **Hosting**: Render.com (free tier) for backend, GitHub Pages for frontend
- **Database**: PostgreSQL (via Render or Supabase free tier)
- **Payments**: Stripe (test mode)
- **Blockchain**: XPR Network (testnet for development)
- **Auth**: JWT + bcrypt + OTP (email via Gmail API)
- **Frontend**: HTML + Tailwind CSS + vanilla JS
- **Backend**: Node.js + Express
- **Security**: Helmet, rate limiting, CORS, input validation

For future projects — use the same stack unless there's a clear reason to change.

## Communication Rules

When Serhiy is available:
- Report after every 2-3 completed tasks
- Use Russian language
- Be specific: what was done, what's next

When Serhiy is unavailable (non-stop mode):
- Work silently
- Report only at session end or after milestones
- Use task queue to track progress

## Reference Files

- `references/task-queue.md` — Current task queue with priorities
- `references/month-roadmap.md` — 30-day launch plan
- `references/tech-stack.md` — Pre-authorized technology choices
- `references/security-checklist.md` — Mandatory security checks
- `references/deployment-guide.md` — Render.com deployment steps
