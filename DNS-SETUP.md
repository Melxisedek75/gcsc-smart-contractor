# DNS Setup for gcsc.store (Namecheap)

## What You Need To Do (Takes 2 Minutes)

### Step 1: Log into Namecheap
1. Go to https://www.namecheap.com
2. Click "Sign In" (top right)
3. Enter your username and password

### Step 2: Find Your Domain
1. Click "Domain List" (left menu)
2. Find "gcsc.store" in the list
3. Click "Manage" button next to it

### Step 3: Go to Advanced DNS
1. Click "Advanced DNS" tab
2. Click "Add New Record"

### Step 4: Add These 4 Records (one by one)

**Record 1:**
- Type: A Record
- Host: @
- Value: 185.199.108.153
- TTL: Automatic
- Click: SAVE

**Record 2:**
- Type: A Record
- Host: @
- Value: 185.199.109.153
- TTL: Automatic
- Click: SAVE

**Record 3:**
- Type: A Record
- Host: @
- Value: 185.199.110.153
- TTL: Automatic
- Click: SAVE

**Record 4:**
- Type: A Record
- Host: @
- Value: 185.199.111.153
- TTL: Automatic
- Click: SAVE

### Step 5: Add WWW Redirect

**Record 5:**
- Type: CNAME Record
- Host: www
- Value: gcsc.store
- TTL: Automatic
- Click: SAVE

### Step 6: Save Everything
1. Click green "Save All Changes" button at bottom
2. Wait 5-30 minutes for DNS to propagate
3. Open https://gcsc.store in your browser

---

## What These Records Do

These 4 IP addresses belong to GitHub Pages servers.
They tell the internet: "when someone types gcsc.store, show them the website from GitHub."

It's like giving your house address to the post office so mail can be delivered.

---

## After Setup

Your site will be live at:
- https://gcsc.store
- https://www.gcsc.store

With free SSL (green lock icon) — automatically provided by GitHub.

---

## Need Help?

If something doesn't work after 30 minutes:
1. Check that all 4 A records are saved correctly
2. Make sure you clicked "Save All Changes"
3. Try opening in a different browser
