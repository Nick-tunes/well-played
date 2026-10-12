-- Well Played: accounts, ranked results, daily XP and friends.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  token_hash TEXT NOT NULL,
  friend_code TEXT NOT NULL UNIQUE,
  created INTEGER NOT NULL,
  xp_total INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  longest INTEGER NOT NULL DEFAULT 0,
  days_played INTEGER NOT NULL DEFAULT 0,
  last_day INTEGER NOT NULL DEFAULT 0
);

-- One ranked result per player, per game, per day.
CREATE TABLE ranked (
  user_id TEXT NOT NULL,
  day INTEGER NOT NULL,
  game TEXT NOT NULL,
  won INTEGER NOT NULL,
  time_ms INTEGER,
  acc REAL,
  score TEXT,
  created INTEGER NOT NULL,
  PRIMARY KEY (user_id, day, game)
);
CREATE INDEX ranked_board ON ranked (game, day, won, time_ms);

-- XP earned per player per day; a row means the player was active that day.
CREATE TABLE xp_days (
  user_id TEXT NOT NULL,
  day INTEGER NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
CREATE INDEX xp_by_day ON xp_days (day);

-- Friendships are stored in both directions.
CREATE TABLE friends (
  a TEXT NOT NULL,
  b TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (a, b)
);
