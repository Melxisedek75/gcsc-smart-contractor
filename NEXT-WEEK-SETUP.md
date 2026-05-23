# GCSC — Next Week Setup Checklist
# Prepared: 2026-05-22
# Goal: Execute remaining legal & business setup items

---

## 1. LLC Registration (Washington State)

**Estimated time:** 30 min online + 3–7 business days processing
**Cost:** ~$200 (LLC) / ~$180 (Corporation)

### Steps:
1. [ ] Go to https://www.sos.wa.gov/corps/ (Washington Secretary of State — Corporations & Charities)
2. [ ] Search name availability: "GCSC Smart Contractor LLC" (or preferred name)
3. [ ] File Certificate of Formation online
4. [ ] Choose Registered Agent (yourself or service like Northwest Registered Agent ~$125/year)
5. [ ] Pay filing fee ($200 for LLC)
6. [ ] Receive UBI (Unified Business Identifier) — takes 3–7 days

### After LLC approved:
7. [ ] Get UBI number from Washington Department of Revenue: https://dor.wa.gov/
8. [ ] Apply for City Business License (Spokane if based there)

---

## 2. EIN (Employer Identification Number)

**Estimated time:** 15 min online
**Cost:** FREE (irs.gov only — never pay a third party)

### Steps:
1. [ ] Go to https://www.irs.gov/ein
2. [ ] Click "Apply Online Now"
3. [ ] Select "Limited Liability Company"
4. [ ] Fill in LLC name exactly as filed with WA Secretary of State
5. [ ] Select "Started a new business" as reason
6. [ ] Enter your SSN as responsible party
7. [ ] Receive EIN immediately as PDF confirmation letter

### Save:
- [ ] Download and save the EIN confirmation letter (CP 575)
- [ ] Store in GCSC legal documents folder

---

## 3. Terms of Service & Privacy Policy on Website

**Status:** ✅ PAGES CREATED — deploy needed

### Files created:
- `terms-of-service.html` — full ToS (marketplace disclaimer, escrow terms, arbitration, WA law)
- `privacy-policy.html` — full Privacy Policy (CCPA compliant, Stripe/XPR disclosure, cookie policy)

### Deploy steps:
1. [ ] Ensure `terms-of-service.html` and `privacy-policy.html` are in `public/` folder
2. [ ] Git push: `git add -A && git commit -m "Add Terms of Service and Privacy Policy" && git push origin main`
3. [ ] Verify live: https://gcsc.store/terms-of-service.html and https://gcsc.store/privacy-policy.html

### Register page links:
- [ ] `register.html` updated with real links (opens in new tab)
- [ ] Already copied to `public/register.html`

---

## 4. Stripe Connect Express — Pre-Approval for Escrow

**Estimated time:** 1–2 weeks for Stripe review
**Cost:** No upfront fee (pay-as-you-go: 2.9% + 30¢ per transaction)

### Prerequisites (must complete FIRST):
- [ ] LLC registered and approved
- [ ] EIN received
- [ ] Business bank account opened (see below)

### Application steps:
1. [ ] Go to https://dashboard.stripe.com/register
2. [ ] Create new account with LLC name and EIN
3. [ ] In Dashboard, go to Settings → Connect settings
4. [ ] Apply for **Stripe Connect Express**
5. [ ] Select platform type: "Marketplace"
6. [ ] Describe business model:
   > "GCSC is a construction marketplace connecting homeowners with licensed contractors. We hold project funds in escrow via Stripe Connect and release them upon milestone completion."
7. [ ] Provide:
   - LLC Certificate of Formation
   - EIN letter
   - Business bank account details
   - Website URL: https://gcsc.store
   - Terms of Service URL: https://gcsc.store/terms-of-service.html
   - Privacy Policy URL: https://gcsc.store/privacy-policy.html
   - Expected volume: conservative estimate (e.g., $50K/month to start)

### Important for escrow model:
- [ ] Explicitly request **"separate charges and transfers"** or **"destination charges"**
- [ ] Mention you will use **delayed payouts** (hold funds until milestones complete)
- [ ] Be transparent that you are a marketplace, not a direct contractor

### After approval:
- [ ] Integrate Stripe Connect onboarding flow for contractors
- [ ] Set payout timing rules (e.g., 7-day hold or milestone-triggered)

---

## 5. Contractor License Verification Process

**Status:** ✅ FRONTEND READY — backend endpoint needed

### What was prepared:
- `register.html` now includes **Step 3** for contractors after OTP:
  - Full Name / Business Name
  - WA L&I License Number (with format hint)
  - License Type (General / Specialty / Electrical / Plumbing)
  - Bond Amount ($30K / $15K)
  - Insurance Provider & Policy Number

### Backend needed:
- [ ] Create `POST /api/contractor/verify` endpoint (or integrate v3/routes/verification.js)
- [ ] Store submissions in `contractor_verifications` table
- [ ] Admin review interface (`admin.html`) to approve/reject
- [ ] Auto-check WA L&I database if API available (manual for now)

### Manual verification workflow (until automated):
1. Contractor submits license info during registration
2. GCSC admin manually checks https://secure.lni.wa.gov/verify/
3. Admin marks verified in dashboard
4. Contractor can then place bids on projects

---

## 6. Business Bank Account (Do after EIN)

**Recommended:** Mercury.com or Relay.fi (startup-friendly, no fees)
**Alternative:** Chase Business Complete, Wells Fargo

### Steps:
1. [ ] Go to https://mercury.com/ (or chosen bank)
2. [ ] Apply with:
   - LLC name and EIN
   - Articles of Organization
   - EIN confirmation letter
   - Your ID (passport or driver's license)
3. [ ] Wait for approval (Mercury: 1–3 days; traditional banks: 1–2 weeks)

---

## 7. Optional: Surety Bond & Liability Insurance for GCSC

Even though GCSC is a marketplace (not a contractor), consider:
- [ ] **E&O Insurance (Errors & Omissions)** — covers platform liability
- [ ] **Cyber Liability Insurance** — covers data breach
- [ ] **General Liability** — if any on-site visits occur

Providers: Hiscox, Next Insurance, CoverWallet
Cost: ~$500–$2,000/year for a small tech platform

---

## Ordered Execution Plan (Recommended Sequence)

| Day | Task | Dependencies |
|-----|------|-------------|
| Mon | LLC filing | None |
| Tue | EIN application | LLC approved (or use SSN temporarily) |
| Wed | Business bank account | EIN |
| Thu | Stripe Connect application | LLC + EIN + Bank + ToS/Privacy live |
| Fri | Backend contractor verify endpoint | Stripe pending |
| Next Mon | Test full flow: register → verify → bid | All above |

---

## Quick Links

| Service | URL |
|---------|-----|
| WA Secretary of State (LLC) | https://www.sos.wa.gov/corps/ |
| WA L&I License Verify | https://secure.lni.wa.gov/verify/ |
| IRS EIN | https://www.irs.gov/ein |
| Mercury Bank | https://mercury.com/ |
| Stripe Connect | https://dashboard.stripe.com/ |
| GCSC Terms | https://gcsc.store/terms-of-service.html |
| GCSC Privacy | https://gcsc.store/privacy-policy.html |

---

_This checklist is preparatory. No legal advice — consult a Washington-licensed attorney for binding documents._
