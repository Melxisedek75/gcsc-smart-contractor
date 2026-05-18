# GCSC API Documentation

## Base URL
```
Development: http://localhost:10000
Production: https://gcsc-api.onrender.com (planned)
```

## Authentication
All endpoints except `/health` and `/api/stats` require JWT Bearer token:
```
Authorization: Bearer <token>
```

Get token via `/api/register` or `/api/login` → verify OTP → receive token.

---

## Endpoints

### Health
```
GET /health
```
Returns: `{ status: "ok", version: "3.0.0", database: "connected" }`

### Stats
```
GET /api/stats
```
Returns: `{ users, projects, completed_escrows, platform }`

---

### Auth

#### Register (Step 1)
```
POST /api/register
Body: { "email": "user@example.com", "role": "homeowner|contractor" }
```
Returns: `{ message: "OTP sent", email }`

#### Verify Registration
```
POST /api/verify
Body: { "email": "...", "otp": "123456", "role": "...", "full_name": "...", "password": "..." }
```
Returns: `{ message: "Registration successful", token, user }`

#### Login (Step 1)
```
POST /api/login
Body: { "email": "user@example.com" }
```
Returns: `{ message: "OTP sent", email }`

#### Verify Login
```
POST /api/login/verify
Body: { "email": "...", "otp": "123456" }
```
Returns: `{ message: "Login successful", token, user }`

#### Get Current User
```
GET /api/me
Headers: Authorization: Bearer <token>
```
Returns: `{ user: { id, email, role, full_name, ... } }`

---

### Projects

#### Create Project
```
POST /api/projects
Headers: Authorization: Bearer <token>
Body: {
  "title": "Kitchen Renovation",
  "description": "Full kitchen remodel",
  "category": "renovation",
  "budget_min": 5000,
  "budget_max": 15000,
  "location": "Seattle, WA",
  "timeline_days": 30
}
```

#### List Projects
```
GET /api/projects?status=open&category=roofing&location=Seattle
```

#### Get Project
```
GET /api/projects/:id
```

#### My Projects
```
GET /api/projects/my/projects
Headers: Authorization: Bearer <token>
```

---

### Bids

#### Place Bid
```
POST /api/bids
Headers: Authorization: Bearer <token>
Body: { "project_id": 1, "amount": 12000, "proposed_timeline_days": 25, "message": "..." }
```

#### Accept Bid
```
POST /api/bids/:id/accept
Headers: Authorization: Bearer <token>
```

#### My Bids
```
GET /api/bids/my/bids
Headers: Authorization: Bearer <token>
```

---

### Escrow

#### Get Escrow
```
GET /api/escrow/:id
Headers: Authorization: Bearer <token>
```

#### My Escrows
```
GET /api/escrow/my/escrows
Headers: Authorization: Bearer <token>
```

---

### Reviews

#### Create Review
```
POST /api/reviews
Headers: Authorization: Bearer <token>
Body: { "project_id": 1, "reviewee_id": 2, "rating": 5, "comment": "Great work!" }
```

#### Get User Reviews
```
GET /api/reviews/user/:userId
```

#### Get Project Reviews
```
GET /api/reviews/project/:projectId
```

---

## Error Codes
| Code | Meaning |
|------|---------|
| 400 | Bad Request - invalid input |
| 401 | Unauthorized - no/invalid token |
| 403 | Forbidden - wrong role |
| 404 | Not Found |
| 409 | Conflict - duplicate |
| 500 | Server Error |
