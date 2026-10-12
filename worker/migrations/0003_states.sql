-- Synced game progress (streak, stats, XP, profile) so it follows a player between devices.
-- Mind Check-in data is never sent here.
CREATE TABLE states (
  user_id TEXT PRIMARY KEY,
  blob TEXT NOT NULL,
  rev INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
