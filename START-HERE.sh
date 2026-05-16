#!/bin/bash
# ============================================================================
# GCSC Smart Contractor v2.0 — FULLY AUTOMATED SETUP
# ============================================================================
# This script does EVERYTHING automatically. You only need to:
#   1. Run this script:   ./START-HERE.sh
#   2. When Google asks — click "Allow"
#   3. Copy the code shown and paste it here
#   4. Press Enter
# That's it. Everything else is automatic.
# ============================================================================

set -e  # Exit on any error

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║     GCSC SMART CONTRACTOR v2.0 — AUTOMATED SETUP               ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "  I'll do everything for you. Just follow the prompts."
echo ""

# Check prerequisites
echo "Step 1/7: Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "  ❌ Node.js not found. Installing..."
    if command -v apt-get &> /dev/null; then
        apt-get update -qq && apt-get install -y -qq nodejs npm
    elif command -v brew &> /dev/null; then
        brew install node
    elif command -v choco &> /dev/null; then
        choco install nodejs
    else
        echo "  ⚠️  Please install Node.js from https://nodejs.org/ (LTS version)"
        echo "     Then run this script again."
        exit 1
    fi
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "  ⚠️  Node.js version is too old ($(node --version)). Need v18+."
    echo "     Please upgrade: https://nodejs.org/"
    exit 1
fi
echo "  ✅ Node.js $(node --version)"

# Install dependencies
echo ""
echo "Step 2/7: Installing dependencies (this may take 2-3 minutes)..."
npm install --silent
echo "  ✅ Dependencies installed"

# Create .env if not exists
echo ""
echo "Step 3/7: Setting up configuration..."

if [ ! -f ".env" ]; then
    cp .env.template .env
    echo "  ✅ Created .env file"
else
    echo "  ℹ️  .env already exists, keeping existing"
fi

# Generate ENCRYPTION_SECRET if not set
if ! grep -q "ENCRYPTION_SECRET=[^$]" .env 2>/dev/null || grep -q "ENCRYPTION_SECRET=replace_with_64_char_hex_string" .env 2>/dev/null; then
    SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    sed -i.bak "s/ENCRYPTION_SECRET=.*/ENCRYPTION_SECRET=${SECRET}/" .env
    rm -f .env.bak
    echo "  ✅ Generated secure ENCRYPTION_SECRET"
else
    echo "  ℹ️  ENCRYPTION_SECRET already set"
fi

# Generate JWT_SECRET if not set
if ! grep -q "JWT_SECRET=[^$]" .env 2>/dev/null || grep -q "JWT_SECRET=replace_with_64_char_hex_string" .env 2>/dev/null; then
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
    sed -i.bak "s/JWT_SECRET=.*/JWT_SECRET=${JWT_SECRET}/" .env
    rm -f .env.bak
    echo "  ✅ Generated secure JWT_SECRET"
else
    echo "  ℹ️  JWT_SECRET already set"
fi

# Check if Google credentials are configured
if grep -q "your_client_id.apps.googleusercontent.com" .env 2>/dev/null; then
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "  ⚠️  GOOGLE CREDENTIALS NEEDED"
    echo ""
    echo "  To use Google Drive and Gmail, you need to:"
    echo ""
    echo "  1. Go to: https://console.cloud.google.com/apis/credentials"
    echo "  2. Click 'Create Credentials' → 'OAuth client ID'"
    echo "  3. Application type: 'Web application'"
    echo "  4. Name: 'GCSC Smart Contractor'"
    echo "  5. Authorized redirect URIs:"
    echo "     http://localhost:3000/dev/oauth/callback"
    echo "     http://localhost:8080/dev/oauth/callback"
    echo "  6. Click CREATE"
    echo "  7. Copy the Client ID and Client Secret"
    echo ""
    echo "  Paste them here:"
    echo ""
    read -p "  GOOGLE_CLIENT_ID: " GOOGLE_CLIENT_ID
    read -p "  GOOGLE_CLIENT_SECRET: " GOOGLE_CLIENT_SECRET
    
    sed -i.bak "s|GOOGLE_CLIENT_ID=.*|GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}|" .env
    sed -i.bak "s|GOOGLE_CLIENT_SECRET=.*|GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}|" .env
    rm -f .env.bak
    echo "  ✅ Google credentials saved"
else
    echo "  ✅ Google credentials already configured"
fi

# Check database
if command -v docker &> /dev/null; then
    echo ""
    echo "Step 4/7: Setting up database (Docker)..."
    
    if ! docker ps &> /dev/null; then
        echo "  ⚠️  Docker is not running. Please start Docker Desktop."
        echo "     Skipping database setup (will use in-memory mode)."
    else
        # Check if PostgreSQL container exists
        if docker ps -q -f name=gcsc-db | grep -q .; then
            echo "  ✅ Database container already running"
        else
            # Generate random DB password
            DB_PASS=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")
            
            # Start PostgreSQL
            docker run -d \
                --name gcsc-db \
                -e POSTGRES_USER=gcsc \
                -e POSTGRES_PASSWORD="${DB_PASS}" \
                -e POSTGRES_DB=gcsc_contractor \
                -p 5432:5432 \
                -v gcsc_postgres_data:/var/lib/postgresql/data \
                --restart unless-stopped \
                postgres:15-alpine > /dev/null 2>&1
            
            # Wait for DB to be ready
            echo "  ⏳ Waiting for database to start..."
            sleep 3
            
            until docker exec gcsc-db pg_isready -U gcsc > /dev/null 2>&1; do
                sleep 1
            done
            
            echo "  ✅ PostgreSQL started"
            
            # Run schema
            docker exec -i gcsc-db psql -U gcsc -d gcsc_contractor < database/schema.sql > /dev/null 2>&1
            echo "  ✅ Database schema created"
            
            # Seed data
            docker exec -i gcsc-db psql -U gcsc -d gcsc_contractor < database/init.sql > /dev/null 2>&1
            echo "  ✅ Sample data loaded"
            
            # Update .env with DB connection
            sed -i.bak "s|DATABASE_URL=.*|DATABASE_URL=postgresql://gcsc:${DB_PASS}@localhost:5432/gcsc_contractor|" .env
            rm -f .env.bak
        fi
    fi
else
    echo ""
    echo "Step 4/7: Docker not found — skipping database (will use in-memory mode)"
    echo "  💡 For production: install Docker from https://docker.com"
fi

# Get Google Refresh Token
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""

if grep -q "GOOGLE_REFRESH_TOKEN=obtain_via_oauth_flow" .env 2>/dev/null || grep -q "GOOGLE_REFRESH_TOKEN=$" .env 2>/dev/null; then
    echo "Step 5/7: Getting Google Refresh Token..."
    echo ""
    echo "  I need to open your browser for Google authorization."
    echo "  When you see 'Sign in with Google' — click 'Allow'."
    echo "  Then copy the code shown and paste it here."
    echo ""
    
    # Start the server briefly to get the token
    node -e "
const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const open = require('open');
const fs = require('fs');

const clientId = '${GOOGLE_CLIENT_ID:-placeholder}';
const clientSecret = '${GOOGLE_CLIENT_SECRET:-placeholder}';

if (clientId === 'placeholder') {
    console.log('  ⚠️  Google credentials not set. Skipping OAuth setup.');
    console.log('     You can set it up later by visiting /dev/oauth/start');
    process.exit(0);
}

const oauth2Client = new google.auth.OAuth2(
    clientId, clientSecret, 'http://localhost:3000/dev/oauth/callback'
);

const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/gmail.send'],
    prompt: 'consent',
});

console.log('  Opening browser...');
open(authUrl).catch(() => {
    console.log('  Please open this URL manually:');
    console.log('  ' + authUrl);
});

const server = http.createServer(async (req, res) => {
    const parsed = url.parse(req.url, true);
    if (parsed.pathname !== '/dev/oauth/callback') return;
    
    const code = parsed.query.code;
    if (!code) return;
    
    try {
        const { tokens } = await oauth2Client.getToken(code);
        console.log('\n  ✅ REFRESH TOKEN (copy this):\n');
        console.log('  ' + tokens.refresh_token);
        console.log('\n  Paste it below and press Enter:\n');
        server.close();
        process.exit(0);
    } catch (e) {
        console.log('  ❌ Error: ' + e.message);
        server.close();
        process.exit(1);
    }
});

server.listen(3000, () => {
    console.log('  Waiting for authorization... (server on localhost:3000)');
});

setTimeout(() => {
    console.log('\n  ⏱️  Timeout. You can get the token later.');
    server.close();
    process.exit(0);
}, 120000);
" 2>&1 || true
    
    read -p "  Refresh Token (paste here): " REFRESH_TOKEN
    
    if [ -n "$REFRESH_TOKEN" ]; then
        sed -i.bak "s|GOOGLE_REFRESH_TOKEN=.*|GOOGLE_REFRESH_TOKEN=${REFRESH_TOKEN}|" .env
        rm -f .env.bak
        echo "  ✅ Refresh token saved"
    else
        echo "  ⚠️  No token provided. You can add it later in .env"
    fi
else
    echo "Step 5/7: Google Refresh Token already configured ✅"
fi

# Set system email
if grep -q "SYSTEM_EMAIL=your_email@gmail.com" .env 2>/dev/null; then
    echo ""
    read -p "Step 6/7: Enter your email (for notifications): " SYSTEM_EMAIL
    if [ -n "$SYSTEM_EMAIL" ]; then
        sed -i.bak "s|SYSTEM_EMAIL=.*|SYSTEM_EMAIL=${SYSTEM_EMAIL}|" .env
        rm -f .env.bak
        echo "  ✅ Email saved"
    fi
else
    echo "Step 6/7: Email already configured ✅"
fi

# Summary
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  ✅ SETUP COMPLETE!"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Starting the server now..."
echo ""
echo "  Your app will be available at:"
echo "    🌐 http://localhost:3000"
echo ""
echo "  Press Ctrl+C to stop the server"
echo ""
echo "═══════════════════════════════════════════════════════════════"

# Start the server
npm start
