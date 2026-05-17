# GCSC Task Queue — Current
## Last Updated: 2026-05-18

## CRITICAL (Do First)

### C1: Deploy Backend to Render.com
- **What**: Deploy Node.js backend with all API endpoints
- **How**: Use render.yaml blueprint from repo, add env vars, deploy
- **Files**: render.yaml, Dockerfile, server.js, routes/*.js
- **Depends on**: Nothing — do immediately
- **Status**: PENDING

### C2: Test Login/Register Flow End-to-End
- **What**: Verify email OTP works, JWT tokens, session management
- **How**: Use curl to test /api/login, /api/login/verify, /api/register
- **Files**: server.js (auth section), login.html, register.html
- **Depends on**: C1 (backend must be live)
- **Status**: PENDING

### C3: Make Frontend Buttons Functional
- **What**: All "Post Project", "Place Bid", "Accept Bid" buttons call real API
- **How**: Add onclick handlers with fetch() calls to gcsc-api.onrender.com
- **Files**: dashboard-homeowner.html, dashboard-contractor.html
- **Depends on**: C1, C2
- **Status**: PENDING

## HIGH (Do After Critical)

### H1: Stripe Payment Integration Test
- **What**: Create test payment intent, verify webhook handling
- **How**: Use Stripe test keys, test /api/stripe/create-payment-intent
- **Files**: routes/stripe.js
- **Depends on**: C1
- **Status**: PENDING

### H2: XPR WebAuth Wallet Connection
- **What**: Connect to XPR Network testnet, test escrow creation
- **How**: Use @proton/web-sdk, test /api/xpr/escrow/create
- **Files**: routes/xpr.js
- **Depends on**: C1
- **Status**: PENDING

### H3: Project CRUD Operations
- **What**: Full create, read, update, delete for construction projects
- **How**: Test all /api/projects endpoints with curl
- **Files**: routes/projects.js
- **Depends on**: C1, C2 (need auth)
- **Status**: PENDING

### H4: Bid System Test
- **What**: Contractors can place bids, homeowners can accept/reject
- **How**: Test /api/bids endpoints, verify bid workflow
- **Files**: routes/bids.js
- **Depends on**: C1, C3 (need projects)
- **Status**: PENDING

## MEDIUM (Do After High)

### M1: Escrow Milestone Workflow
- **What**: Test milestone completion, approval, payment release
- **How**: Test /api/escrow/:id/milestone/:index/complete and /approve
- **Files**: routes/escrow.js
- **Depends on**: H3, H4
- **Status**: PENDING

### M2: Review System
- **What**: Users can leave reviews after project completion
- **How**: Test review creation, calculation of average ratings
- **Files**: routes/reviews.js (if exists, or add to escrow.js)
- **Depends on**: M1
- **Status**: PENDING

### M3: Mobile Responsive Testing
- **What**: All pages work on mobile (375px width)
- **How**: Use browser dev tools, test all interactive elements
- **Files**: All .html files
- **Depends on**: C3
- **Status**: PENDING

### M4: Performance Optimization
- **What**: Lazy loading, image compression, minification
- **How**: Add loading="lazy" to images, compress assets
- **Files**: index.html, dashboard files
- **Depends on**: Nothing
- **Status**: PENDING

## LOW (Nice to Have)

### L1: SEO Optimization
- **What**: Meta tags, sitemap.xml, robots.txt
- **How**: Add proper meta descriptions, create sitemap
- **Files**: index.html, new sitemap.xml, robots.txt
- **Depends on**: Nothing
- **Status**: PENDING

### L2: Analytics Setup
- **What**: Google Analytics or Plausible for visitor tracking
- **How**: Add tracking script to index.html
- **Files**: index.html
- **Depends on**: Nothing
- **Status**: PENDING

### L3: Documentation for Serhiy
- **What**: User guide explaining how to use the platform
- **How**: Create DOCUMENTATION.md with screenshots
- **Files**: new DOCUMENTATION.md
- **Depends on**: Everything working
- **Status**: PENDING

## COMPLETED

- [x] Landing page with full-width logo
- [x] Backend v3 with all routes (7,806 lines)
- [x] Frontend pages (login, register, dashboards)
- [x] Database schema (PostgreSQL)
- [x] Dockerfile and render.yaml
- [x] Security audit report
- [x] All files uploaded to GitHub
