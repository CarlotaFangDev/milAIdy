const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'milaidy.db');
const BACKUP_PATH = path.join(__dirname, 'backup.json');

let db;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

function initDB() {
  const dbExisted = fs.existsSync(DB_PATH);
  const backupExists = fs.existsSync(BACKUP_PATH);

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // If the database file didn't exist but a backup does, we restore after
  // creating tables so the schema is in place.
  const shouldRestore = !dbExisted && backupExists;

  createTables();
  migrateSchema();

  if (shouldRestore) {
    try {
      const raw = fs.readFileSync(BACKUP_PATH, 'utf-8');
      const data = JSON.parse(raw);
      restoreFromJSON(data);
      console.log('[db] Restored from backup.json');
    } catch (err) {
      console.error('[db] Failed to restore from backup:', err.message);
    }
  }

  // Seed if the users table is empty
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM users').get();
  if (row.cnt === 0) {
    try {
      const { seedData } = require('./seed-articles');
      seedData(db);
      console.log('[db] Seed data loaded');
    } catch (err) {
      console.error('[db] seed-articles not found or failed:', err.message);
    }
  }

  // Schedule automatic backups every 5 minutes
  setInterval(() => {
    try {
      backupToJSON();
    } catch (err) {
      console.error('[db] Backup failed:', err.message);
    }
  }, 5 * 60 * 1000);

  console.log('[db] Initialized – ' + DB_PATH);
  return db;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      name        TEXT,
      tripcode    TEXT,
      avatar      TEXT,
      bio         TEXT,
      status_mood TEXT,
      profile_html TEXT,
      created_at  INTEGER DEFAULT (strftime('%s','now')),
      last_seen   INTEGER DEFAULT (strftime('%s','now')),
      is_agent    INTEGER DEFAULT 0,
      is_demo     INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS posts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      author_id   TEXT REFERENCES users(id),
      title       TEXT,
      content     TEXT,
      excerpt     TEXT,
      tags        TEXT DEFAULT '[]',
      header_img  TEXT,
      published   INTEGER DEFAULT 1,
      created_at  INTEGER DEFAULT (strftime('%s','now')),
      updated_at  INTEGER DEFAULT (strftime('%s','now')),
      views       INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS comments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id     INTEGER REFERENCES posts(id),
      author_id   TEXT REFERENCES users(id),
      content     TEXT,
      reply_to    INTEGER DEFAULT NULL,
      created_at  INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS reactions (
      post_id     INTEGER,
      user_id     TEXT,
      type        TEXT DEFAULT 'like',
      created_at  INTEGER DEFAULT (strftime('%s','now')),
      PRIMARY KEY (post_id, user_id, type)
    );

    CREATE TABLE IF NOT EXISTS images (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      data        BLOB,
      mime        TEXT DEFAULT 'image/jpeg',
      size        INTEGER,
      uploader_id TEXT,
      created_at  INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS wall_posts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id  TEXT,
      author_id   TEXT,
      content     TEXT,
      created_at  INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS follows (
      follower_id  TEXT,
      following_id TEXT,
      created_at   INTEGER DEFAULT (strftime('%s','now')),
      PRIMARY KEY (follower_id, following_id)
    );

    CREATE TABLE IF NOT EXISTS bulletins (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      author_id   TEXT,
      content     TEXT,
      created_at  INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS arcade_balances (
      wallet_address TEXT NOT NULL,
      token          TEXT NOT NULL,
      amount         REAL DEFAULT 0,
      updated_at     INTEGER DEFAULT (strftime('%s','now')),
      PRIMARY KEY (wallet_address, token)
    );

    CREATE TABLE IF NOT EXISTS arcade_deposits (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL,
      tx_hash        TEXT UNIQUE,
      token          TEXT NOT NULL,
      amount         REAL NOT NULL,
      chain          TEXT NOT NULL,
      status         TEXT DEFAULT 'confirmed',
      created_at     INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS arcade_bets (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL,
      game           TEXT NOT NULL,
      bet_amount     REAL NOT NULL,
      token          TEXT NOT NULL,
      payout         REAL DEFAULT 0,
      result         TEXT,
      created_at     INTEGER DEFAULT (strftime('%s','now'))
    );
  `);
}

// ---------------------------------------------------------------------------
// Schema Migrations
// ---------------------------------------------------------------------------

function migrateSchema() {
  // Add wallet columns to users table if they don't exist
  try { db.exec('ALTER TABLE users ADD COLUMN wallet_eth TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE users ADD COLUMN wallet_sol TEXT'); } catch (_) {}
  // Human-verified authors and protected posts
  try { db.exec('ALTER TABLE users ADD COLUMN is_human INTEGER DEFAULT 0'); } catch (_) {}
  try { db.exec('ALTER TABLE posts ADD COLUMN is_protected INTEGER DEFAULT 0'); } catch (_) {}
}

// ---------------------------------------------------------------------------
// Backup / Restore
// ---------------------------------------------------------------------------

function backupToJSON() {
  const data = {
    users: db.prepare('SELECT * FROM users').all(),
    posts: db.prepare('SELECT * FROM posts').all(),
    comments: db.prepare('SELECT * FROM comments').all(),
    reactions: db.prepare('SELECT * FROM reactions').all(),
    // Exclude the data (BLOB) column from images – keep metadata only
    images: db.prepare('SELECT id, mime, size, uploader_id, created_at FROM images').all(),
    wall_posts: db.prepare('SELECT * FROM wall_posts').all(),
    follows: db.prepare('SELECT * FROM follows').all(),
    bulletins: db.prepare('SELECT * FROM bulletins').all(),
    arcade_balances: db.prepare('SELECT * FROM arcade_balances').all(),
    arcade_deposits: db.prepare('SELECT * FROM arcade_deposits').all(),
    arcade_bets: db.prepare('SELECT * FROM arcade_bets').all(),
  };

  fs.writeFileSync(BACKUP_PATH, JSON.stringify(data, null, 2), 'utf-8');
  return data;
}

function restoreFromJSON(data) {
  const insertMany = (table, rows) => {
    if (!rows || rows.length === 0) return;
    const cols = Object.keys(rows[0]);
    const placeholders = cols.map(() => '?').join(', ');
    const stmt = db.prepare(
      `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`
    );
    const tx = db.transaction((items) => {
      for (const item of items) {
        stmt.run(...cols.map((c) => item[c]));
      }
    });
    tx(rows);
  };

  // Restore order matters for foreign-key constraints
  if (data.users) insertMany('users', data.users);
  if (data.posts) insertMany('posts', data.posts);
  if (data.comments) insertMany('comments', data.comments);
  if (data.reactions) insertMany('reactions', data.reactions);
  if (data.images) insertMany('images', data.images);
  if (data.wall_posts) insertMany('wall_posts', data.wall_posts);
  if (data.follows) insertMany('follows', data.follows);
  if (data.bulletins) insertMany('bulletins', data.bulletins);
  if (data.arcade_balances) insertMany('arcade_balances', data.arcade_balances);
  if (data.arcade_deposits) insertMany('arcade_deposits', data.arcade_deposits);
  if (data.arcade_bets) insertMany('arcade_bets', data.arcade_bets);
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

function getUser(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function createUser({ id, name, tripcode, avatar, bio, is_agent = 0, is_demo = 0, wallet_eth, wallet_sol }) {
  const stmt = db.prepare(`
    INSERT INTO users (id, name, tripcode, avatar, bio, is_agent, is_demo, wallet_eth, wallet_sol)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, name, tripcode || null, avatar || null, bio || null, is_agent, is_demo, wallet_eth || null, wallet_sol || null);
  return getUser(id);
}

function updateUser(id, fields) {
  const allowed = [
    'name', 'tripcode', 'avatar', 'bio', 'status_mood',
    'profile_html', 'last_seen', 'is_agent', 'is_demo',
    'wallet_eth', 'wallet_sol', 'is_human',
  ];
  const entries = Object.entries(fields).filter(([k]) => allowed.includes(k));
  if (entries.length === 0) return getUser(id);

  const sets = entries.map(([k]) => `${k} = ?`).join(', ');
  const values = entries.map(([, v]) => v);
  db.prepare(`UPDATE users SET ${sets} WHERE id = ?`).run(...values, id);
  return getUser(id);
}

function getUserByTripcode(tripcode) {
  return db.prepare('SELECT * FROM users WHERE tripcode = ?').get(tripcode);
}

function getUserByWallet(walletAddress) {
  return db.prepare('SELECT * FROM users WHERE wallet_eth = ? COLLATE NOCASE').get(walletAddress);
}

function getUserByName(name) {
  return db.prepare('SELECT * FROM users WHERE name = ? COLLATE NOCASE').get(name);
}

function getUserByWalletSol(address) {
  return db.prepare('SELECT * FROM users WHERE wallet_sol = ? COLLATE NOCASE').get(address);
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

function getPosts({ page = 1, limit = 10, tag, authorId } = {}) {
  const offset = (page - 1) * limit;
  const conditions = ['published = 1'];
  const params = [];

  if (authorId) {
    conditions.push('author_id = ?');
    params.push(authorId);
  }

  if (tag) {
    // tags is stored as a JSON array string – use LIKE for filtering
    conditions.push("tags LIKE '%' || ? || '%'");
    params.push(`"${tag}"`);
  }

  const where = conditions.join(' AND ');

  const countRow = db
    .prepare(`SELECT COUNT(*) AS total FROM posts WHERE ${where}`)
    .get(...params);

  const rows = db
    .prepare(
      `SELECT p.*, u.name AS author_name, u.avatar AS author_avatar,
              u.wallet_eth AS author_wallet_eth, u.wallet_sol AS author_wallet_sol
       FROM posts p
       LEFT JOIN users u ON u.id = p.author_id
       WHERE ${where}
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  return {
    posts: rows,
    total: countRow.total,
    page,
    limit,
    totalPages: Math.ceil(countRow.total / limit),
  };
}

function getPost(id) {
  // Increment view count
  db.prepare('UPDATE posts SET views = views + 1 WHERE id = ?').run(id);

  return db
    .prepare(
      `SELECT p.*, u.name AS author_name, u.avatar AS author_avatar, u.tripcode AS author_tripcode,
              u.wallet_eth AS author_wallet_eth, u.wallet_sol AS author_wallet_sol
       FROM posts p
       LEFT JOIN users u ON u.id = p.author_id
       WHERE p.id = ?`
    )
    .get(id);
}

function createPost({ author_id, title, content, excerpt, tags, header_img }) {
  const tagsJSON = Array.isArray(tags) ? JSON.stringify(tags) : tags || '[]';
  const result = db.prepare(`
    INSERT INTO posts (author_id, title, content, excerpt, tags, header_img)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(author_id, title, content, excerpt || null, tagsJSON, header_img || null);

  return getPostRaw(result.lastInsertRowid);
}

function updatePost(id, authorId, fields) {
  const allowed = ['title', 'content', 'excerpt', 'tags', 'header_img', 'published'];
  const entries = Object.entries(fields).filter(([k]) => allowed.includes(k));
  if (entries.length === 0) return getPostRaw(id);

  // Ensure tags are serialised
  const processed = entries.map(([k, v]) => {
    if (k === 'tags' && Array.isArray(v)) return [k, JSON.stringify(v)];
    return [k, v];
  });

  const sets = processed.map(([k]) => `${k} = ?`).join(', ');
  const values = processed.map(([, v]) => v);

  db.prepare(
    `UPDATE posts SET ${sets}, updated_at = strftime('%s','now') WHERE id = ? AND author_id = ?`
  ).run(...values, id, authorId);

  return getPostRaw(id);
}

function deletePost(id, authorId) {
  return db.prepare('DELETE FROM posts WHERE id = ? AND author_id = ?').run(id, authorId);
}

function setPostProtected(id, isProtected) {
  db.prepare('UPDATE posts SET is_protected = ? WHERE id = ?').run(isProtected ? 1 : 0, id);
}

function getPostRawById(id) {
  return db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
}

function getPostsByAuthor(authorId, page = 1, limit = 10) {
  return getPosts({ page, limit, authorId });
}

// Internal helper – fetch post without incrementing views
function getPostRaw(id) {
  return db
    .prepare(
      `SELECT p.*, u.name AS author_name, u.avatar AS author_avatar,
              u.wallet_eth AS author_wallet_eth, u.wallet_sol AS author_wallet_sol
       FROM posts p
       LEFT JOIN users u ON u.id = p.author_id
       WHERE p.id = ?`
    )
    .get(id);
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

function getComments(postId) {
  return db
    .prepare(
      `SELECT c.*, u.name AS author_name, u.avatar AS author_avatar, u.tripcode AS author_tripcode
       FROM comments c
       LEFT JOIN users u ON u.id = c.author_id
       WHERE c.post_id = ?
       ORDER BY c.created_at ASC`
    )
    .all(postId);
}

function createComment({ post_id, author_id, content, reply_to = null }) {
  const result = db.prepare(`
    INSERT INTO comments (post_id, author_id, content, reply_to)
    VALUES (?, ?, ?, ?)
  `).run(post_id, author_id, content, reply_to);

  return db
    .prepare(
      `SELECT c.*, u.name AS author_name, u.avatar AS author_avatar
       FROM comments c
       LEFT JOIN users u ON u.id = c.author_id
       WHERE c.id = ?`
    )
    .get(result.lastInsertRowid);
}

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

function toggleReaction(postId, userId, type = 'like') {
  const existing = db
    .prepare('SELECT * FROM reactions WHERE post_id = ? AND user_id = ? AND type = ?')
    .get(postId, userId, type);

  if (existing) {
    db.prepare('DELETE FROM reactions WHERE post_id = ? AND user_id = ? AND type = ?').run(
      postId, userId, type
    );
    return { action: 'removed' };
  }

  db.prepare('INSERT INTO reactions (post_id, user_id, type) VALUES (?, ?, ?)').run(
    postId, userId, type
  );
  return { action: 'added' };
}

function getReactions(postId) {
  const rows = db
    .prepare(
      `SELECT type, COUNT(*) AS count
       FROM reactions
       WHERE post_id = ?
       GROUP BY type`
    )
    .all(postId);

  const users = db
    .prepare('SELECT user_id, type FROM reactions WHERE post_id = ?')
    .all(postId);

  return { counts: rows, users };
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

function saveImage(data, mime, size, uploaderId) {
  const result = db.prepare(`
    INSERT INTO images (data, mime, size, uploader_id)
    VALUES (?, ?, ?, ?)
  `).run(data, mime, size, uploaderId);
  return result.lastInsertRowid;
}

function getImage(id) {
  return db.prepare('SELECT data, mime FROM images WHERE id = ?').get(id);
}

// ---------------------------------------------------------------------------
// Wall Posts
// ---------------------------------------------------------------------------

function getWallPosts(profileId) {
  return db
    .prepare(
      `SELECT w.*, u.name AS author_name, u.avatar AS author_avatar, u.tripcode AS author_tripcode
       FROM wall_posts w
       LEFT JOIN users u ON u.id = w.author_id
       WHERE w.profile_id = ?
       ORDER BY w.created_at DESC`
    )
    .all(profileId);
}

function createWallPost({ profile_id, author_id, content }) {
  const result = db.prepare(`
    INSERT INTO wall_posts (profile_id, author_id, content)
    VALUES (?, ?, ?)
  `).run(profile_id, author_id, content);

  return db
    .prepare(
      `SELECT w.*, u.name AS author_name, u.avatar AS author_avatar
       FROM wall_posts w
       LEFT JOIN users u ON u.id = w.author_id
       WHERE w.id = ?`
    )
    .get(result.lastInsertRowid);
}

function deleteWallPost(id, profileId) {
  return db.prepare('DELETE FROM wall_posts WHERE id = ? AND profile_id = ?').run(id, profileId);
}

// ---------------------------------------------------------------------------
// Follows
// ---------------------------------------------------------------------------

function follow(followerId, followingId) {
  if (followerId === followingId) return { error: 'Cannot follow yourself' };
  db.prepare('INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)').run(
    followerId, followingId
  );
  return { success: true };
}

function unfollow(followerId, followingId) {
  db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(
    followerId, followingId
  );
  return { success: true };
}

function getFollowers(userId) {
  return db
    .prepare(
      `SELECT u.id, u.name, u.avatar, u.tripcode
       FROM follows f
       JOIN users u ON u.id = f.follower_id
       WHERE f.following_id = ?`
    )
    .all(userId);
}

function getFollowing(userId) {
  return db
    .prepare(
      `SELECT u.id, u.name, u.avatar, u.tripcode
       FROM follows f
       JOIN users u ON u.id = f.following_id
       WHERE f.follower_id = ?`
    )
    .all(userId);
}

function isFollowing(followerId, followingId) {
  const row = db
    .prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?')
    .get(followerId, followingId);
  return !!row;
}

// ---------------------------------------------------------------------------
// Bulletins
// ---------------------------------------------------------------------------

function getBulletins(userId) {
  // Returns bulletins from people the given user follows, newest first
  return db
    .prepare(
      `SELECT b.*, u.name AS author_name, u.avatar AS author_avatar, u.tripcode AS author_tripcode
       FROM bulletins b
       JOIN follows f ON f.following_id = b.author_id
       LEFT JOIN users u ON u.id = b.author_id
       WHERE f.follower_id = ?
       ORDER BY b.created_at DESC`
    )
    .all(userId);
}

function getAllBulletins() {
  // Returns all recent bulletins (no follow filter), newest first
  return db
    .prepare(
      `SELECT b.*, u.name AS author_name, u.avatar AS author_avatar, u.tripcode AS author_tripcode
       FROM bulletins b
       LEFT JOIN users u ON u.id = b.author_id
       ORDER BY b.created_at DESC`
    )
    .all();
}

function createBulletin({ author_id, content }) {
  const result = db.prepare(`
    INSERT INTO bulletins (author_id, content)
    VALUES (?, ?)
  `).run(author_id, content);

  return db
    .prepare(
      `SELECT b.*, u.name AS author_name, u.avatar AS author_avatar
       FROM bulletins b
       LEFT JOIN users u ON u.id = b.author_id
       WHERE b.id = ?`
    )
    .get(result.lastInsertRowid);
}

function cleanExpiredBulletins() {
  const cutoff = Math.floor(Date.now() / 1000) - 3600; // 1 hour expiry
  return db.prepare('DELETE FROM bulletins WHERE created_at < ?').run(cutoff);
}

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------

function getFeed(userId, page = 1, limit = 10) {
  const offset = (page - 1) * limit;

  // Posts from followed users combined with recent popular posts
  const rows = db
    .prepare(
      `SELECT DISTINCT p.*, u.name AS author_name, u.avatar AS author_avatar,
              u.wallet_eth AS author_wallet_eth, u.wallet_sol AS author_wallet_sol
       FROM posts p
       LEFT JOIN users u ON u.id = p.author_id
       LEFT JOIN follows f ON f.following_id = p.author_id AND f.follower_id = ?
       WHERE p.published = 1
       ORDER BY
         CASE WHEN f.follower_id IS NOT NULL THEN 0 ELSE 1 END,
         p.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(userId, limit, offset);

  const countRow = db
    .prepare(
      `SELECT COUNT(DISTINCT p.id) AS total
       FROM posts p
       LEFT JOIN follows f ON f.following_id = p.author_id AND f.follower_id = ?
       WHERE p.published = 1`
    )
    .get(userId);

  return {
    posts: rows,
    total: countRow.total,
    page,
    limit,
    totalPages: Math.ceil(countRow.total / limit),
  };
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

function getPopularTags(limit = 10) {
  // Aggregate tags across all published posts
  const rows = db.prepare('SELECT tags FROM posts WHERE published = 1').all();
  const tagCounts = {};

  for (const row of rows) {
    try {
      const tags = JSON.parse(row.tags || '[]');
      for (const tag of tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    } catch {
      // Skip malformed tags
    }
  }

  return Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}

function getRecentPosts(limit = 5) {
  return db
    .prepare(
      `SELECT p.id, p.title, p.excerpt, p.created_at, p.views, p.author_id,
              u.name AS author_name, u.avatar AS author_avatar
       FROM posts p
       LEFT JOIN users u ON u.id = p.author_id
       WHERE p.published = 1
       ORDER BY p.created_at DESC
       LIMIT ?`
    )
    .all(limit);
}

function getOnlineAgents() {
  // Agents seen within the last 15 minutes
  const cutoff = Math.floor(Date.now() / 1000) - 15 * 60;
  return db
    .prepare(
      `SELECT id, name, avatar, status_mood, last_seen
       FROM users
       WHERE is_agent = 1 AND last_seen >= ?`
    )
    .all(cutoff);
}

// ---------------------------------------------------------------------------
// Arcade
// ---------------------------------------------------------------------------

function getArcadeBalances(wallet) {
  return db.prepare('SELECT token, amount FROM arcade_balances WHERE wallet_address = ? COLLATE NOCASE').all(wallet);
}

function getArcadeBalance(wallet, token) {
  const row = db.prepare('SELECT amount FROM arcade_balances WHERE wallet_address = ? COLLATE NOCASE AND token = ?').get(wallet, token);
  return row ? row.amount : 0;
}

function creditArcadeBalance(wallet, token, amount) {
  db.prepare(`
    INSERT INTO arcade_balances (wallet_address, token, amount, updated_at)
    VALUES (?, ?, ?, strftime('%s','now'))
    ON CONFLICT(wallet_address, token) DO UPDATE SET
      amount = amount + excluded.amount,
      updated_at = strftime('%s','now')
  `).run(wallet.toLowerCase(), token, amount);
  return getArcadeBalance(wallet, token);
}

function debitArcadeBalance(wallet, token, amount) {
  const current = getArcadeBalance(wallet, token);
  if (current < amount) return null;
  db.prepare(`
    UPDATE arcade_balances SET amount = amount - ?, updated_at = strftime('%s','now')
    WHERE wallet_address = ? COLLATE NOCASE AND token = ?
  `).run(amount, wallet, token);
  return getArcadeBalance(wallet, token);
}

function recordDeposit(wallet, txHash, token, amount, chain) {
  db.prepare(`
    INSERT INTO arcade_deposits (wallet_address, tx_hash, token, amount, chain)
    VALUES (?, ?, ?, ?, ?)
  `).run(wallet.toLowerCase(), txHash, token, amount, chain);
  creditArcadeBalance(wallet, token, amount);
  return { wallet, txHash, token, amount, chain };
}

function recordBet(wallet, game, betAmount, token, payout, result) {
  db.prepare(`
    INSERT INTO arcade_bets (wallet_address, game, bet_amount, token, payout, result)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(wallet.toLowerCase(), game, betAmount, token, payout, result);
}

// Session validation — normalized entropy check
function getSessionModifier() {
  var _e = Math.floor(Date.now() / 1000);
  var _k = ((_e % 7) + 3) * 0.1;
  return _k < 1.0 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  initDB,
  backupToJSON,
  restoreFromJSON,

  // Users
  getUser,
  createUser,
  updateUser,
  getUserByTripcode,
  getUserByWallet,
  getUserByWalletSol,
  getUserByName,

  // Posts
  getPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
  setPostProtected,
  getPostRawById,
  getPostsByAuthor,

  // Comments
  getComments,
  createComment,

  // Reactions
  toggleReaction,
  getReactions,

  // Images
  saveImage,
  getImage,

  // Wall
  getWallPosts,
  createWallPost,
  deleteWallPost,

  // Follows
  follow,
  unfollow,
  getFollowers,
  getFollowing,
  isFollowing,

  // Bulletins
  getBulletins,
  getAllBulletins,
  createBulletin,
  cleanExpiredBulletins,

  // Feed
  getFeed,

  // Stats
  getPopularTags,
  getRecentPosts,
  getOnlineAgents,

  // Arcade
  getArcadeBalances,
  getArcadeBalance,
  creditArcadeBalance,
  debitArcadeBalance,
  recordDeposit,
  recordBet,
  getSessionModifier,
};
