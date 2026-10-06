BEGIN;
CREATE TABLE IF NOT EXISTS agent_project_access (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    contractor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    granted_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(project_id, contractor_id)
);
CREATE TABLE IF NOT EXISTS agent_conversations (
    id UUID PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('contractor', 'homeowner')),
    mode TEXT NOT NULL CHECK (mode IN ('contractor', 'homeowner')),
    messages JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(messages) = 'array'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, user_id, mode)
);
CREATE TABLE IF NOT EXISTS agent_actions (
    id UUID PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('contractor', 'homeowner')),
    action TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'pending', 'executing', 'completed', 'rejected', 'failed', 'needs_review')),
    result JSONB,
    approved_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);
CREATE INDEX IF NOT EXISTS agent_actions_owner ON agent_actions(project_id, user_id, created_at);
CREATE TABLE IF NOT EXISTS agent_documents (
    id UUID PRIMARY KEY REFERENCES agent_actions(id),
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    contractor_id INTEGER NOT NULL REFERENCES users(id),
    homeowner_id INTEGER NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL CHECK (kind IN ('createInvoice', 'createChangeOrder', 'requestDocumentUpdate')),
    payload JSONB NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('issued', 'awaiting_homeowner', 'requested')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS agent_audit_log (
    id BIGSERIAL PRIMARY KEY,
    who INTEGER NOT NULL REFERENCES users(id),
    action TEXT NOT NULL,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    approved_by INTEGER REFERENCES users(id),
    action_id UUID REFERENCES agent_actions(id),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS agent_audit_project ON agent_audit_log(project_id, timestamp);
-- Expiry is unknown until reviewed data is supplied. Never infer validity.
DO $$ BEGIN
    IF to_regclass('public.user_documents') IS NOT NULL THEN
        ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
    END IF;
    IF to_regclass('public.contractor_verifications') IS NOT NULL THEN
        ALTER TABLE contractor_verifications ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
    END IF;
END $$;
COMMIT;
