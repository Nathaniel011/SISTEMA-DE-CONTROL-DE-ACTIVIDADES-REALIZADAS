CREATE TABLE IF NOT EXISTS knowledge_articles (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID REFERENCES projects(id) ON DELETE SET NULL,
    title         VARCHAR(255) NOT NULL,
    slug          VARCHAR(320) NOT NULL UNIQUE,
    content       TEXT,
    tags          TEXT,
    status        VARCHAR(30) NOT NULL DEFAULT 'draft',
    author_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_project ON knowledge_articles(project_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_status ON knowledge_articles(status);

CREATE TABLE IF NOT EXISTS whiteboards (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID REFERENCES projects(id) ON DELETE SET NULL,
    name          VARCHAR(255) NOT NULL,
    description   TEXT,
    content_json  TEXT NOT NULL DEFAULT '{"elements":[]}',
    updated_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whiteboards_project ON whiteboards(project_id);
