# GCSC Project — Юридический Чек-лист & Compliance Guide
_Составлено на основе открытых источников: FinCEN, SEC, Washington State L&I, Stripe Terms, BSA/AML guidelines_
_Дата: 2026-05-21 | НЕ является юридической консультацией — только референс_

---

## 📋 Сводка: Что нужно ДО запуска

| Приоритет | Требование | Статус | Сложность | Сроки |
|-----------|-----------|--------|-----------|-------|
| 🔴 **КРИТИЧНО** | LLC/Corporation в Washington State | ❌ Не сделано | Лёгкая | 1–2 недели |
| 🔴 **КРИТИЧНО** | EIN (налоговый номер компании) | ❌ Не сделано | Лёгкая | 1 неделя |
| 🔴 **КРИТИЧНО** | Stripe Connect Account (правильный тип) | ⚠️ Нужно проверить | Средняя | 2–3 недели |
| 🟡 **ВАЖНО** | Contractor Marketplace — NOT MSB escrow | ⚠️ Нужно решить | Средняя | До запуска |
| 🟡 **ВАЖНО** | Privacy Policy + Terms of Service | ❌ Не сделано | Средняя | 1–2 недели |
| 🟡 **ВАЖНО** | KYC/AML базовый процесс | ❌ Не сделано | Средняя | 2–4 недели |
| 🟢 **ЖЕЛАТЕЛЬНО** | MSB/MTL лицензия (только если escrow самостоятельный) | ❌ Не сделано | Сложная | 4–12 месяцев |
| 🟢 **ЖЕЛАТЕЛЬНО** | Surety bond ($30K) + liability insurance | ❌ Не сделано | Лёгкая | 1–2 недели |
| 🔴 **НЕ ДЕЛАТЬ** | Токен/ICO в ближайшие месяцы | ❌ Не делать | — | После traction |

---

## 1️⃣ Бизнес-структура (Washington State)

### Что нужно сделать:
1. **Зарегистрировать LLC или Corporation** через Washington Secretary of State
   - Стоимость: ~$200 (LLC) / ~$180 (Corporation)
   - Срок: 3–7 рабочих дней онлайн
   - Нужен Registered Agent (можно себя или сервис за $100/год)

2. **Получить UBI (Unified Business Identifier)** через Washington Department of Revenue
   - Бесплатно, онлайн
   - Нужен для бизнес-лицензии

3. **Получить EIN** через IRS (irs.gov)
   - Бесплатно, онлайн
   - Нужен для открытия банковского счёта компании

4. **Открыть бизнес-счёт** (Chase, Wells Fargo, Mercury, Relay)
   - Mercury/Relay — для стартапов, лучше чем традиционные банки

### ⚠️ Важно:
- **НЕ веди бизнес через личный счёт** — это mixing personal/business assets, проблемы с налогами и liability
- LLC даёт limited liability (если кто-то подаст в суд — берут компанию, не тебя лично)

---

## 2️⃣ Contractor Marketplace — Лицензирование (WA State)

### GCSC — что это по закону?
Твоя платформа это **"Home Improvement Contractor" marketplace**. В Washington State:

- **Платформа НЕ обязана быть лицензированной как contractor** — если она только соединяет клиентов и подрядчиков
- **Подрядчики на платформе ОБЯЗАНЫ иметь лицензию** — General или Specialty через Washington L&I
- **Если GCSC берёт деньги клиентов и держит их** — это уже financial service, а не просто marketplace

### Что нужно подрядчикам на платформе:
| Тип подрядчика | Требование |
|----------------|-----------|
| General Contractor | Регистрация L&I + bond $30K + liability insurance |
| Specialty Contractor | Регистрация L&I + bond $15K + liability insurance |
| Plumbing/Electrical/Elevator | Отдельная trade license + exam |

### Рекомендация для GCSC:
**Требуй от каждого подрядчика на платформе:**
1. License number (L&I)
2. Bond proof ($30K/$15K)
3. Insurance certificate (L&I listed as certificate holder)
4. Workers comp insurance (если есть сотрудники)

---

## 3️⃣ MSB (Money Services Business) — Нужна ли лицензия?

### Что такое MSB по FinCEN:
**MSB = любой бизнес, который передаёт деньги (money transmission)** — в ЛЮБОМ объёме, без порога $1,000.

### Твой escrow — MSB или нет?

**Сценарий A: GCSC держит деньги клиента**
- Клиент платит $10K через Stripe → деньги идут на счёт GCSC
- GCSC держит деньги до завершения работы
- GCSC выплачивает подрядчику после подписания
→ **ЭТО MSB (money transmitter)** ❌ Нужна FinCEN регистрация + state MTL

**Сценарий B: Stripe escrow/Connect (Split Payments)**
- Клиент платит через Stripe
- Stripe держит деньги в escrow
- GCSC не касается денег напрямую
→ **GCSC НЕ MSB** ✅ (Stripe уже лицензирован как MSB)

**Сценарий C: Блокчейн escrow (XPR)**
- Деньги идут в smart contract на XPR Network
- GCSC не держит fiat
→ **GCSC НЕ MSB** ✅ (но может быть virtual currency MSB, если обмен)

### Рекомендация:
**Используй Сценарий B или C** — не делай Сценарий A без лицензии.

### Если ВСЁ ЖЕ нужна MSB лицензия:
| Шаг | Что нужно | Сроки | Стоимость |
|-----|-----------|-------|-----------|
| 1 | LLC/Corporation | 1–2 недели | ~$200 |
| 2 | AML Compliance Program (письменный) | 2–4 недели | $5K–$15K (юрист) |
| 3 | FinCEN Form 107 (регистрация) | 1–3 недели | Бесплатно |
| 4 | State Money Transmitter License (WA + другие) | 6–18 месяцев | $25K–$500K bond |
| 5 | Compliance Officer (назначить) | — | — |
| 6 | KYC/AML система | — | $500–$5K/мес |
| 7 | Обновление каждые 2 года | — | — |

**Штраф за работу без MSB лицензии:**
- Civil: до $5,000 за каждый день нарушения
- Criminal: штраф + до 5 лет тюрьмы (18 USC 1960)

---

## 4️⃣ Stripe — Правила для Escrow

### Stripe Restricted Businesses List:
Stripe запрещает:
- ❌ "Non-fiat currency" (крипто без разрешения)
- ❌ "Lending and credit"
- ❌ "Pyramid schemes, MLM"
- ❌ "Any product or service that infringes on IP"

### Escrow через Stripe:
**Stripe Connect** позволяет marketplace:
- Разделить платеж между продавцом и платформой
- Delayed payouts (держать деньги до условия)
- Но требует **Stripe Connect Account** (не обычный Stripe Standard)

### Типы Stripe Connect:
| Тип | Что делает | Нужна ли MSB? |
|-----|-----------|---------------|
| **Standard** | Подрядчик получает деньги сразу | Нет |
| **Express** | Stripe держит деньги, платформа контролирует payout timing | Нет (Stripe держит) |
| **Custom** | Полный контроль, но нужна MTL | Возможно |

### Рекомендация:
**Используй Stripe Connect Express** для escrow:
- Stripe держит деньги (они уже MSB-лицензированы)
- Ты контролируешь когда выплатить подрядчику
- Нет нужды в твоей собственной MSB лицензии
- **НО:** нужен pre-approval от Stripe для escrow модели

---

## 5️⃣ SEC — Токен & Cryptocurrency

### Howey Test (SEC v. W.J. Howey Co., 1946):
Токен = **Security (ценная бумага)** если все 4 элемента присутствуют:

1. ✅ **Investment of money** — люди вкладывают деньги
2. ✅ **In a common enterprise** — общее дело/проект
3. ✅ **Expectation of profits** — ожидание прибыли
4. ✅ **Derived from efforts of others** — прибыль от чужих усилий

→ Если 4/4 — это **Security Token**, нужна регистрация SEC

### GCSC Token — что будет?

**Если токен даёт:**
- ❌ Дивиденды от прибыли GCSC → **SECURITY TOKEN** (нужна SEC регистрация)
- ❌ Право на часть дохода платформы → **SECURITY TOKEN**
- ✅ Только для платформы (оплата комиссий, доступ функций) → **Utility Token**
- ✅ Governance (голосование за фичи) → **Возможно Utility**
- ✅ NFT — certificate of completion → **Не security**

### Регистрация Security Token:
| Метод | Что это | Сроки | Стоимость |
|-------|---------|-------|-----------|
| **Reg D (506(b) или 506(c))** | Private placement, только accredited investors | 2–4 недели | $25K–$50K (юристы) |
| **Reg S** | Только non-US investors | 2–4 недели | $15K–$30K |
| **Reg A+ (Tier 1 или 2)** | Mini-IPO, публичный | 6–12 месяцев | $100K–$500K |
| **Full SEC Registration** | IPO-style | 12–24 месяца | $500K–$2M+ |

### Штрафы за unregistered security:
- Civil: до $10,000 за нарушение + restitution инвесторам
- Criminal: до $5M штраф + до 20 лет тюрьмы (15 USC 77x)
- SEC enforcement: Telegram ($1.2B), Ripple (ongoing), etc.

### Рекомендация:
**НЕ делай investment token сейчас.**

**Безопасные варианты:**
1. **Utility Token** — только для платформы (комиссии, премиум фичи)
2. **NFT** — certificate of completed project (не security)
3. **Loyalty Points** — не tradeable на exchanges
4. **Governance Token** — только voting, no profit rights

---

## 6️⃣ GDPR / CCPA / Privacy

### Нужно ли?
- **CCPA** — если пользователи из California (да, нужно)
- **GDPR** — если пользователи из EU (если планируешь международный запуск)
- **WA State Privacy Act** — пока нет отдельного закона (2026)

### Что нужно:
1. **Privacy Policy** на сайте (обязательно)
2. **Terms of Service** (обязательно)
3. Cookie consent banner (если cookies для tracking)
4. Data retention policy (сколько хранишь данные)
5. Right to deletion (CCPA/GDPR)

### Что собираешь (проверь в коде):
| Данные | Как защитить |
|--------|-------------|
| Имя, email, телефон | Шифрование в БД |
| SSN / EIN подрядчиков | **НЕ собирай без необходимости** — если собираешь, храни encrypted |
| Payment info | **НЕ храни** — используй Stripe tokenization |
| Bank account details | **НЕ храни** — используй Stripe Connect |
| Construction project details | Анонимизация в логах |

---

## 7️⃣ AML / KYC — Базовые требования

### Если GCSC НЕ MSB (Сценарий B или C):
KYC **не обязателен** по закону, но **рекомендуется** для:
- Предотвращения fraud
- Защиты подрядчиков
- Репутации платформы

### Базовый KYC процесс (рекомендуется):
| Уровень | Для кого | Что проверять |
|---------|----------|---------------|
| **Light** | Homeowners | Email verification, phone verification |
| **Medium** | Contractors | + License number (L&I database check) |
| **Heavy** | High-value projects ($50K+) | + ID verification (Stripe Identity или Jumio) |

### Инструменты для KYC:
- **Stripe Identity** — $1.50 per verification
- **Jumio** — enterprise level
- **Persona** — $1 per verification
- **DIY**: Manual document upload + L&I license lookup API

---

## 8️⃣ Документы-шаблоны (нужно создать)

### A. Terms of Service для GCSC
Нужно включить:
- ✅ GCSC — marketplace, не строительная компания
- ✅ Подрядчики — independent contractors, не employees
- ✅ GCSC не гарантирует качество работы (проверяет лицензии, но не качество)
- ✅ Dispute resolution процесс
- ✅ Escrow terms (когда деньги выплачиваются)
- ✅ Limitation of liability
- ✅ Arbitration clause (рекомендуется — дешевле чем суд)
- ✅ Governing law: Washington State
- ✅ Refund policy
- ✅ Account termination условия

### B. Privacy Policy
Нужно включить:
- ✅ Какие данные собираем
- ✅ Как используем
- ✅ С кем делимся (Stripe, XPR, etc.)
- ✅ Cookies
- ✅ Data retention period
- ✅ Права пользователей (delete, access)
- ✅ Contact info для privacy questions
- ✅ Date of last update

### C. Contractor Agreement
- ✅ Contractor — independent contractor (не employee)
- ✅ License requirement (must maintain active WA license)
- ✅ Insurance requirement
- ✅ Commission/fee structure
- ✅ Payment terms (escrow release conditions)
- ✅ Non-compete (если нужно)
- ✅ Termination

---

## 9️⃣ План запуска по фазам

### Phase 0: MVP (сейчас — 2 месяца)
- ✅ Работающий сайт + escrow через XPR
- ✅ LLC зарегистрирована
- ✅ EIN получен
- ✅ Бизнес-счёт открыт
- ✅ Terms of Service + Privacy Policy на сайте
- ⚠️ Stripe Connect Express (pre-approval для escrow)
- ⚠️ Basic KYC (email + license check)

### Phase 1: Beta (2–4 месяца)
- 10–20 тестовых сделок в Spokane/Seattle area
- Собирать feedback
- Настройка dispute resolution
- Ручная проверка подрядчиков

### Phase 2: Growth (4–12 месяцев)
- Маркетинг в Washington State
- Stripe Connect Express escrow
- Automated KYC через Stripe Identity
- Expansion to Oregon, Idaho

### Phase 3: Scale (12+ месяцев)
- **ТОЛЬКО ТУТ рассматривать токен**
- Продукт proven, traction есть
- Юрист для token structure (Reg D или Utility)
- Возможно: Series A fundraising

---

## 🔟 Красные линии (НЕ ДЕЛАТЬ)

| ❌ НЕ ДЕЛАТЬ | Почему |
|-------------|--------|
| **Запускать токен через неделю** | Без продукта = скам. SEC будет первым клиентом |
| **Держать клиентские деньги на своём счёту без MSB** | Federal crime, до 5 лет тюрьмы |
| **Собирать SSN без шифрования** | Identity theft liability |
| **Гарантировать качество работы подрядчиков** | GCSC станет liable за defects |
| **Нанимать подрядчиков как employees** | Employment taxes, workers comp, wrongful classification |
| **Забыть про Terms of Service** | Любой пользователь может подать в суд, нет защиты |
| **"Мы используем блокчейн" как маркетинг** | Это должно быть на background. Бизнес = construction marketplace, tech = secondary |

---

## 📚 Источники

1. FinCEN MSB Registration: https://www.fincen.gov/resources/money-services-business-msb-registration
2. IRS MSB Information: https://www.irs.gov/businesses/small-businesses-self-employed/money-services-business-msb-information-center
3. BSA/AML Examination Manual: https://bsaaml.ffiec.gov/
4. Stripe Restricted Businesses: https://stripe.com/en-th/legal/restricted-businesses
5. Stripe Services Agreement: https://stripe.com/legal/ssa
6. Washington L&I Contractor Licensing: https://lni.wa.gov/
7. SEC Howey Test (SEC.gov — enforcement actions)
8. Washington Secretary of State: https://www.sos.wa.gov/
9. IRS EIN Application: https://www.irs.gov/ein

---

## 🤝 Следующие шаги

1. **Регистрируй LLC** (самое быстрое, ~$200, 1 неделя)
2. **Получи EIN** (бесплатно, онлайн)
3. **Я создам Terms of Service + Privacy Policy** — скажи когда готов
4. **Stripe Connect Express pre-approval** — подай заявку в Stripe
5. **НЕ трогай токен** до Phase 3

---

_Документ создан из открытых источников. Для юридически обязывающих решений обратитесь к лицензированному attorney в Washington State._
