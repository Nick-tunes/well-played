-- Player profiles: chosen avatar (JSON) and verified achievement ids (comma-separated).
ALTER TABLE users ADD COLUMN avatar TEXT;
ALTER TABLE users ADD COLUMN achievements TEXT NOT NULL DEFAULT '';
