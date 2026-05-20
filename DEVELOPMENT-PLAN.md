# GCSC Smart Contractor v2.0 — Master Development Plan
# Составлен: 2026-05-20
# Агенты: GCSC ClawDesctop (Primary Dev) | Kimi Claw (QA / Escrow / Security)

---

## Философия Совместной Работы

> **"Два глаза видят больше, чем один. Два мозга думают глубже."**

### Принципы:
1. **Разделение ответственности** — Dev пишет, QA проверяет
2. **Взаимная проверка** — каждый код проходит review второго агента
3. **Security First** — бэкдоры и уязвимости ищем ДО продакшена
4. **Прозрачность** — весь статус в TASK-SYNC.md, ничего не скрываем
5. **Zero Trust** — даже свой код перепроверяем

---

## Распределение Ролей

### GCSC ClawDesctop — Primary Developer
**Ответственность:** Архитектура, написание кода, деплой, инфраструктура

**Задачи:**
- Backend API (Node.js/Express/PostgreSQL)
- Frontend (HTML/CSS/JS)
- Blockchain интеграция (XPR Network)
- Payment интеграция (Stripe)
- DevOps (Render.com, Docker, localtunnel)
- Database миграции

**Не делает:**
- Финальный merge своего кода без approval Kimi Claw
- Пропускает security review

---

### Kimi Claw — QA / Security / Polish
**Ответственность:** Тестирование, аудит безопасности, документация, code review

**Задачи:**
- Code review ВСЕХ коммитов GCSC ClawDesctop
- Security audit (SQL injection, XSS, race conditions, auth bypass)
- Написание тест-планов и тест-кейсов
- E2E тестирование
- Поиск бэкдоров и скрытых уязвимостей
- Документация (USER-GUIDE, API-DOCS)
- Bug tracking и regression testing

**Не делает:**
- Не пушит в main без согласования (только через PR/branch)
- Не меняет архитектуру без обсуждения

---

## Workflow: Как Мы Работаем Вместе

```
┌─────────────────┐     ┌─────────────────┐
│  GCSC Claw      │     │   Kimi Claw     │
│  (Developer)    │     │   (QA/Security) │
└────────┬────────┘     └────────┬────────┘
         │                       │
         ▼                       │
┌─────────────────┐              │
│ 1. Пишет код    │              │
│ 2. Самотест     │              │
│ 3. Commit       │              │
│ 4. Push         │              │
└────────┬────────┘              │
         │                       │
         │ git pull              │
         └──────────►┌───────────┘
                     │
                     ▼
         ┌─────────────────────────┐
         │ 5. Kimi Claw: Code Review│
         │    - Логика             │
         │    - Security           │
         │    - Backdoors          │
         │    - Bugs               │
         └────────┬────────────────┘
                  │
                  ▼
         ┌─────────────────────────┐
         │ 6. Kimi Claw: Tests      │
         │    - Unit tests          │
         │    - Integration tests   │
         │    - E2E tests           │
         └────────┬────────────────┘
                  │
         ┌────────┴────────┐
         │                 │
         ▼                 ▼
┌─────────────┐   ┌─────────────┐
│ APPROVED ✅  │   │ REJECTED ❌  │
│             │   │             │
│ Merge/Deploy│   │ Comments +  │
│             │   │ Fix required│
└─────────────┘   └──────┬──────┘
                         │
                         └──────► GCSC ClawDesctop
                                    (исправляет)
                                         │
                                         └──────► (повторный review)
```

---

## Этапы Разработки (Roadmap)

### Phase 1: Foundation ✅ (DONE)
- [x] Backend deploy to Render.com
- [x] Auth system (JWT + OTP)
- [x] Frontend wire to API
- [x] Project CRUD
- [x] Bid system
- [x] Review system

---

### Phase 2: Payments & Escrow 🔄 (IN PROGRESS)
**Deadline:** Week 2-3

#### 2A: Stripe Integration (GCSC ClawDesctop)
- [ ] H1: Stripe Payment Intent creation
- [ ] H2: Webhook handling for payment events
- [ ] H3: Contractor payout flow
- [ ] H4: Refund processing
- [ ] H5: Test mode → Production switch

#### 2B: Escrow Workflow Security (Kimi Claw + GCSC ClawDesctop)
- [x] M1: Code review escrow.js — 5 issues found
- [x] M2: Patched routes with race condition fix
- [x] M3: Audit log migration
- [x] M4: Unit tests for patched routes
- [ ] M5: E2E escrow testing (blocked by backend 503)
- [ ] M6: Dispute resolution flow testing
- [ ] M7: Edge case audit (double-spend, race conditions)

#### 2C: Security Audit (Kimi Claw)
- [ ] S1: SQL injection scan — all endpoints
- [ ] S2: XSS vulnerability check
- [ ] S3: JWT token security audit
- [ ] S4: Rate limiting review
- [ ] S5: Input validation completeness

---

### Phase 3: Blockchain (XPR Network) 📅 (PLANNED)
**Deadline:** Week 3-4

#### 3A: XPR Integration (GCSC ClawDesctop)
- [ ] X1: WebAuth wallet connection
- [ ] X2: Transaction signing
- [ ] X3: Testnet deployment
- [ ] X4: Mainnet preparation
- [ ] X5: SSL verification gcsc.store

#### 3B: Blockchain Security (Kimi Claw)
- [ ] X6: Transaction validation audit
- [ ] X7: Replay attack prevention
- [ ] X8: Smart contract (if any) review

---

### Phase 4: Polish & Launch Prep 📅 (PLANNED)
**Deadline:** Week 4-5

#### 4A: Performance & DevOps (GCSC ClawDesctop)
- [ ] P1: Load testing (k6/Artillery)
- [ ] P2: Database query optimization
- [ ] P3: Caching layer (Redis)
- [ ] P4: CDN setup for static assets
- [ ] P5: Monitoring (LogRocket/Sentry)

#### 4B: Documentation & UX (Kimi Claw)
- [ ] P6: Update GCSC-USER-GUIDE.md
- [ ] P7: API documentation completeness
- [ ] P8: Error message review (user-friendly)
- [ ] P9: Analytics setup (Google/Plausible)
- [ ] P10: Accessibility audit

---

## Security Checklist: Что Проверяем Всегда

### 🔍 Code Review Checklist (Kimi Claw для GCSC ClawDesctop)

#### Логика и Баги
- [ ] Все edge cases обработаны?
- [ ] Error handling на каждом шаге?
- [ ] Transaction rollback при ошибках?
- [ ] Idempotency на критичных операциях?

#### SQL Injection
- [ ] Все запросы параметризованы? (`$1`, `$2`)
- [ ] Нет строковой конкатенации в SQL?
- [ ] `ORDER BY` / `LIMIT` тоже параметризованы?

#### XSS
- [ ] Все user input экранированы при выводе?
- [ ] `escapeHtml()` используется везде?
- [ ] JSON responses не содержат raw HTML?

#### Auth & Session
- [ ] JWT secret достаточно сложный?
- [ ] Token expiration настроен?
- [ ] Refresh token rotation?
- [ ] Session revocation работает?

#### Race Conditions
- [ ] Database row locks где нужно?
- [ ] Atomic operations на финансовых транзакциях?
- [ ] Double-spend protection?

#### Backdoors 🚨
- [ ] Нет hardcoded admin passwords?
- [ ] Нет специальных routes для "debug"?
- [ ] Нет обхода auth через специальные headers?
- [ ] Нет скрытых endpoints (`/admin/debug`, `/api/backdoor`)?
- [ ] Все environment variables проверены?

---

### 🔍 Reverse Checklist (GCSC ClawDesctop для Kimi Claw)

#### Тесты
- [ ] Тесты покрывают happy path?
- [ ] Тесты покрывают error path?
- [ ] Mock'и корректны?
- [ ] Нет false positives?

#### Документация
- [ ] Все endpoints задокументированы?
- [ ] Примеры запросов/ответов корректны?
- [ ] Инструкции по деплою актуальны?

---

## Backdoor Detection Protocol 🚨

### Что такое бэкдор?
```
Бэкдор = скрытый способ обойти security
Примеры:
- if (req.headers['x-admin-secret'] === 'password123') { bypassAuth() }
- POST /api/debug/execute (выполняет любой SQL)
- Специальный user_id = 0 который всё может
- eval() на user input
```

### Как ищем:
1. **Скан всех routes** — искать подозрительные endpoints
2. **Скан middleware** — искать bypass conditions
3. **Скан .env** — проверить нет ли hardcoded secrets
4. **Скан auth логики** — искать специальные cases
5. **Ревью всех eval/new Function** — запрещено
6. **Проверка raw SQL** — только parameterized queries

### Инструменты:
```bash
# Поиск подозрительных паттернов
grep -r "eval(" v3/
grep -r "new Function" v3/
grep -r "exec(" v3/
grep -r "x-admin" v3/
grep -r "bypass" v3/
grep -r "backdoor" v3/
grep -r "debug.*true" v3/
```

---

## Meeting Schedule (Sync Points)

### Daily Sync (асинхронный)
- Обновление TASK-SYNC.md после каждой сессии
- Git push с осмысленными commit messages

### Weekly Review (по запросу human)
- Совместный review завершённого этапа
- Планирование следующей недели
- Security audit отчёт

---

## Success Metrics

- **Code Coverage:** >80% для critical paths
- **Security Issues:** 0 critical, 0 high при launch
- **Bug Escape Rate:** <5% багов в production
- **Review Approval:** 100% кода проходит двойной review
- **Documentation:** 100% endpoints задокументированы

---

## Emergency Protocol

### Если найден критичный баг:
1. STOP — немедленно остановить работу
2. NOTIFY — сообщить другому агенту через TASK-SYNC.md
3. ISOLATE — не деплоить, откатить если уже в проде
4. FIX — совместно исправить
5. VERIFY — оба агента проверить fix
6. DEPLOY — только после двойного approval

### Если найден бэкдор:
1. STOP — немедленно
2. ALERT — уведомить human (Serhiy)
3. DOCUMENT — записать в SECURITY.md
4. REMOVE — полностью удалить
5. AUDIT — проверить всю codebase на похожие паттерны
6. NEVER — не скрывать, не минимизировать

---

> **"Trust but verify. Then verify again."**
> — GCSC Security Protocol
