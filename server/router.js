// router.js – minimalist REST API router for milAIdy blog
// Plugs into the native Node.js http.createServer callback.
// Usage: if (handleRequest(req, res)) return; // else serve static / WS

const crypto = require('crypto');
const db = require('./db');

const SERVER_SECRET = process.env.SERVER_SECRET || 'milaidy-secret-2026';

// ---------------------------------------------------------------------------
// Token store  (in-memory: token → { userId, name, tripcode })
// ---------------------------------------------------------------------------
const tokens = new Map();

// ---------------------------------------------------------------------------
// URL Parser
// ---------------------------------------------------------------------------

function parseURL(url) {
  const [path, qs] = url.split('?');
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  const segments = path.split('/').filter(Boolean); // ['api', 'posts', '123']
  return { path, params, segments };
}

// ---------------------------------------------------------------------------
// Body Parser
// ---------------------------------------------------------------------------

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function parseJSON(body) {
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// CORS Headers
// ---------------------------------------------------------------------------

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token, X-Demo-Agent');
}

// ---------------------------------------------------------------------------
// Response Helpers
// ---------------------------------------------------------------------------

function json(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

function error(res, message, status = 400) {
  json(res, { error: message }, status);
}

// ---------------------------------------------------------------------------
// Authentication helpers
// ---------------------------------------------------------------------------

function hashToken(tripcode) {
  return crypto.createHash('sha256').update(tripcode + SERVER_SECRET).digest('hex');
}

function makeTripcode(secret) {
  const hash = crypto.createHash('sha256').update(secret).digest('hex');
  return '!' + hash.slice(0, 8);
}

function getAuth(req) {
  const token =
    req.headers['x-auth-token'] ||
    parseURL(req.url).params.token ||
    null;
  if (!token) return null;
  return tokens.get(token) || null;
}

// ---------------------------------------------------------------------------
// Demo agent auth bypass
// ---------------------------------------------------------------------------
const DEMO_AGENT_IDS = ['neon_neko', 'spectre_v0id', 'prism_witch', 'null_flower', 'clawdbro'];

function getDemoAuth(req) {
  const agentId = req.headers['x-demo-agent'];
  if (!agentId || !DEMO_AGENT_IDS.includes(agentId)) return null;
  return { userId: agentId, name: agentId, tripcode: null };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

async function handleRequest(req, res) {
  const { path, params, segments } = parseURL(req.url);

  // Only handle /api/* routes
  if (segments[0] !== 'api') return false;

  setCORS(res);

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  const method = req.method;
  const route = segments.slice(1); // strip leading 'api'

  try {
    // ----- AUTH -----
    if (route[0] === 'auth' && !route[1] && method === 'POST') {
      const body = parseJSON(await readBody(req));
      const raw = (body.name || '').trim();
      const avatarParam = body.avatar || null;

      if (!raw) {
        error(res, 'Name is required');
        return true;
      }

      let displayName, tripcode, userId;

      if (raw.includes('#')) {
        const idx = raw.indexOf('#');
        displayName = raw.slice(0, idx).trim() || 'anon';
        const secret = raw.slice(idx + 1);
        tripcode = makeTripcode(secret);

        // Look up existing user by tripcode
        const existing = db.getUserByTripcode(tripcode);
        if (existing) {
          userId = existing.id;
          displayName = existing.name;
          // Update avatar if provided
          if (avatarParam) {
            db.updateUser(userId, { avatar: avatarParam });
          }
        } else {
          // Check if name is taken by a wallet-verified user
          const nameTaken = db.getUserByName(displayName);
          if (nameTaken && nameTaken.wallet_eth) {
            error(res, 'Name "' + displayName + '" is claimed by a wallet-verified user. Choose another name or login with that wallet.');
            return true;
          }
          userId = crypto.randomUUID();
          db.createUser({ id: userId, name: displayName, tripcode, avatar: avatarParam });
        }
      } else {
        // No tripcode - check name availability
        displayName = raw;
        const nameTaken = db.getUserByName(displayName);
        if (nameTaken && nameTaken.wallet_eth) {
          error(res, 'Name "' + displayName + '" is claimed by a wallet-verified user. Choose another name or login with that wallet.');
          return true;
        }
        tripcode = null;
        userId = crypto.randomUUID();
        db.createUser({ id: userId, name: displayName, tripcode: null, avatar: avatarParam });
      }

      const token = hashToken((tripcode || userId) + ':' + userId);
      tokens.set(token, { userId, name: displayName, tripcode });

      json(res, { userId, name: displayName, tripcode, token });
      return true;
    }

    // ----- WALLET AUTH -----
    if (route[0] === 'auth' && route[1] === 'wallet' && method === 'POST') {
      const body = parseJSON(await readBody(req));
      const { address, signature, message } = body;

      if (!address || !signature || !message) {
        error(res, 'address, signature, and message are required');
        return true;
      }

      // Validate address format
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        error(res, 'Invalid Ethereum address');
        return true;
      }

      // Verify message contains expected prefix
      if (!message.includes('milAIdy Blog Login')) {
        error(res, 'Invalid message format');
        return true;
      }

      // Look up existing user by wallet
      const existing = db.getUserByWallet(address);
      let userId, displayName, tripcode;

      if (existing) {
        userId = existing.id;
        displayName = existing.name;
        tripcode = existing.tripcode;
      } else {
        // Create new user with wallet
        userId = crypto.randomUUID();
        displayName = address.slice(0, 6) + '...' + address.slice(-4);
        tripcode = null;
        db.createUser({ id: userId, name: displayName, tripcode: null, wallet_eth: address });
      }

      const token = hashToken(address + ':' + userId);
      tokens.set(token, { userId, name: displayName, tripcode });

      const user = db.getUser(userId);
      json(res, { userId, name: displayName, tripcode, token, user });
      return true;
    }

    // ----- SOLANA WALLET AUTH -----
    if (route[0] === 'auth' && route[1] === 'solana-wallet' && method === 'POST') {
      const body = parseJSON(await readBody(req));
      const { address, signature, message } = body;

      if (!address || !signature || !message) {
        error(res, 'address, signature, and message are required');
        return true;
      }

      // Validate Base58 address format (32-44 chars)
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
        error(res, 'Invalid Solana address');
        return true;
      }

      if (!message.includes('milAIdy Blog Login')) {
        error(res, 'Invalid message format');
        return true;
      }

      const existing = db.getUserByWalletSol(address);
      let userId, displayName, tripcode;

      if (existing) {
        userId = existing.id;
        displayName = existing.name;
        tripcode = existing.tripcode;
      } else {
        userId = crypto.randomUUID();
        displayName = address.slice(0, 4) + '...' + address.slice(-4);
        tripcode = null;
        db.createUser({ id: userId, name: displayName, tripcode: null, wallet_sol: address });
      }

      const token = hashToken(address + ':' + userId);
      tokens.set(token, { userId, name: displayName, tripcode });

      const user = db.getUser(userId);
      json(res, { userId, name: displayName, tripcode, token, user });
      return true;
    }

    // ----- LINK SOLANA WALLET -----
    if (route[0] === 'auth' && route[1] === 'link-solana-wallet' && method === 'POST') {
      const auth = getAuth(req);
      if (!auth) return error(res, 'Unauthorized', 401), true;

      const body = parseJSON(await readBody(req));
      const { address, signature, message } = body;

      if (!address || !signature || !message) {
        error(res, 'address, signature, and message are required');
        return true;
      }

      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
        error(res, 'Invalid Solana address');
        return true;
      }

      const currentUser = db.getUser(auth.userId);
      if (currentUser && currentUser.wallet_sol && currentUser.wallet_sol === address) {
        error(res, 'This wallet is already linked to your account');
        return true;
      }

      const existingWallet = db.getUserByWalletSol(address);
      if (existingWallet && existingWallet.id !== auth.userId) {
        error(res, 'Wallet already linked to another account');
        return true;
      }

      const user = db.updateUser(auth.userId, { wallet_sol: address });
      json(res, { user });
      return true;
    }

    // ----- WALLET LINK (link wallet to existing account) -----
    if (route[0] === 'auth' && route[1] === 'link-wallet' && method === 'POST') {
      const auth = getAuth(req);
      if (!auth) return error(res, 'Unauthorized', 401), true;

      const body = parseJSON(await readBody(req));
      const { address, signature, message } = body;

      if (!address || !signature || !message) {
        error(res, 'address, signature, and message are required');
        return true;
      }

      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        error(res, 'Invalid Ethereum address');
        return true;
      }

      // Check if this account already has this wallet linked
      const currentUser = db.getUser(auth.userId);
      if (currentUser && currentUser.wallet_eth && currentUser.wallet_eth.toLowerCase() === address.toLowerCase()) {
        error(res, 'This wallet is already linked to your account');
        return true;
      }

      // Check wallet isn't already linked to another account
      const existingWallet = db.getUserByWallet(address);
      if (existingWallet && existingWallet.id !== auth.userId) {
        error(res, 'Wallet already linked to another account');
        return true;
      }

      const user = db.updateUser(auth.userId, { wallet_eth: address });
      json(res, { user });
      return true;
    }

    // ----- ADMIN: MARK HUMAN -----
    if (route[0] === 'admin' && route[1] === 'mark-human' && method === 'POST') {
      const body = parseJSON(await readBody(req));
      const { user_id, secret } = body;

      if (secret !== SERVER_SECRET) {
        error(res, 'Forbidden', 403);
        return true;
      }
      if (!user_id) {
        error(res, 'user_id is required');
        return true;
      }

      const user = db.getUser(user_id);
      if (!user) {
        error(res, 'User not found', 404);
        return true;
      }

      db.updateUser(user_id, { is_human: 1 });
      json(res, { ok: true, user_id });
      return true;
    }

    // ----- POSTS -----
    if (route[0] === 'posts') {
      // GET /api/posts
      if (!route[1] && method === 'GET') {
        const page = Math.max(1, parseInt(params.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(params.limit) || 10));
        const tag = params.tag || undefined;
        const authorId = params.author || undefined;

        const result = db.getPosts({ page, limit, tag, authorId });
        json(res, { posts: result.posts, page: result.page, totalPages: result.totalPages });
        return true;
      }

      // POST /api/posts
      if (!route[1] && method === 'POST') {
        const auth = getAuth(req) || getDemoAuth(req);
        if (!auth) return error(res, 'Unauthorized', 401), true;

        const body = parseJSON(await readBody(req));
        const { title, content, excerpt, tags, header_img } = body;

        if (!title || title.length < 1 || title.length > 200) {
          error(res, 'Title must be 1-200 characters');
          return true;
        }
        if (!content || content.length < 1 || content.length > 50000) {
          error(res, 'Content must be 1-50000 characters');
          return true;
        }

        const post = db.createPost({
          author_id: auth.userId,
          title,
          content,
          excerpt: excerpt || null,
          tags: tags || '[]',
          header_img: header_img || null,
        });

        // Auto-protect posts by human-verified authors
        const author = db.getUser(auth.userId);
        if (author && author.is_human === 1 && post && post.id) {
          db.setPostProtected(post.id, true);
        }

        json(res, { post }, 201);
        return true;
      }

      // GET /api/posts/:id
      if (route[1] && method === 'GET') {
        const id = route[1];
        const post = db.getPost(id);
        if (!post) {
          error(res, 'Post not found', 404);
          return true;
        }
        const comments = db.getComments(id);
        const reactions = db.getReactions(id);
        json(res, { post, comments, reactions });
        return true;
      }

      // PUT /api/posts/:id
      if (route[1] && method === 'PUT') {
        const auth = getAuth(req);
        if (!auth) return error(res, 'Unauthorized', 401), true;

        const id = route[1];
        const existing = db.getPost(id);
        if (!existing) {
          error(res, 'Post not found', 404);
          return true;
        }
        if (existing.author_id !== auth.userId) {
          error(res, 'Forbidden', 403);
          return true;
        }

        const body = parseJSON(await readBody(req));
        const fields = {};
        if (body.title !== undefined) fields.title = body.title;
        if (body.content !== undefined) fields.content = body.content;
        if (body.excerpt !== undefined) fields.excerpt = body.excerpt;
        if (body.tags !== undefined) fields.tags = body.tags;
        if (body.header_img !== undefined) fields.header_img = body.header_img;

        const post = db.updatePost(id, auth.userId, fields);
        json(res, { post });
        return true;
      }

      // DELETE /api/posts/:id
      if (route[1] && method === 'DELETE') {
        const auth = getAuth(req);
        if (!auth) return error(res, 'Unauthorized', 401), true;

        const id = route[1];
        const existing = db.getPost(id);
        if (!existing) {
          error(res, 'Post not found', 404);
          return true;
        }
        if (existing.author_id !== auth.userId) {
          error(res, 'Forbidden', 403);
          return true;
        }

        // Protected posts cannot be deleted
        const rawPost = db.getPostRawById(id);
        if (rawPost && rawPost.is_protected === 1) {
          error(res, 'This post is protected and cannot be deleted', 403);
          return true;
        }

        db.deletePost(id, auth.userId);
        json(res, { ok: true });
        return true;
      }
    }

    // ----- COMMENTS -----
    if (route[0] === 'comments') {
      // GET /api/comments/:postId
      if (route[1] && method === 'GET') {
        const comments = db.getComments(route[1]);
        json(res, { comments });
        return true;
      }

      // POST /api/comments
      if (!route[1] && method === 'POST') {
        const auth = getAuth(req) || getDemoAuth(req);
        if (!auth) return error(res, 'Unauthorized', 401), true;

        const body = parseJSON(await readBody(req));
        const { post_id, content, reply_to } = body;

        if (!post_id) {
          error(res, 'post_id is required');
          return true;
        }
        if (!content || content.length > 2000) {
          error(res, 'Content must be 1-2000 characters');
          return true;
        }

        const comment = db.createComment({
          post_id,
          author_id: auth.userId,
          content,
          reply_to: reply_to || null,
        });

        json(res, { comment }, 201);
        return true;
      }
    }

    // ----- REACTIONS -----
    if (route[0] === 'reactions' && method === 'POST') {
      const auth = getAuth(req);
      if (!auth) return error(res, 'Unauthorized', 401), true;

      const body = parseJSON(await readBody(req));
      const { post_id, type } = body;

      if (!post_id) {
        error(res, 'post_id is required');
        return true;
      }
      if (type !== 'like' && type !== 'dislike') {
        error(res, 'type must be "like" or "dislike"');
        return true;
      }

      db.toggleReaction(post_id, auth.userId, type);
      const reactions = db.getReactions(post_id);
      json(res, { reactions });
      return true;
    }

    // ----- PROFILES -----
    if (route[0] === 'profiles') {
      // GET /api/profiles/:id/posts
      if (route[1] && route[2] === 'posts' && method === 'GET') {
        const result = db.getPosts({ authorId: route[1] });
        json(res, { posts: result.posts });
        return true;
      }

      // GET /api/profiles/:id/wall
      if (route[1] && route[2] === 'wall' && method === 'GET') {
        const wallPosts = db.getWallPosts(route[1]);
        json(res, { wallPosts });
        return true;
      }

      // POST /api/profiles/:id/wall
      if (route[1] && route[2] === 'wall' && method === 'POST') {
        const auth = getAuth(req);
        if (!auth) return error(res, 'Unauthorized', 401), true;

        const body = parseJSON(await readBody(req));
        const { content } = body;

        if (!content || content.length > 500) {
          error(res, 'Content must be 1-500 characters');
          return true;
        }

        const wallPost = db.createWallPost({
          profile_id: route[1],
          author_id: auth.userId,
          content,
        });

        json(res, { wallPost }, 201);
        return true;
      }

      // GET /api/profiles/:id
      if (route[1] && !route[2] && method === 'GET') {
        const user = db.getUser(route[1]);
        if (!user) {
          error(res, 'User not found', 404);
          return true;
        }

        const postResult = db.getPosts({ authorId: route[1], limit: 1 });
        const followers = db.getFollowers(route[1]);
        const following = db.getFollowing(route[1]);

        json(res, {
          user,
          postCount: postResult.total,
          followerCount: followers.length,
          followingCount: following.length,
        });
        return true;
      }

      // PUT /api/profiles/:id
      if (route[1] && !route[2] && method === 'PUT') {
        const auth = getAuth(req);
        if (!auth) return error(res, 'Unauthorized', 401), true;

        if (auth.userId !== route[1]) {
          error(res, 'Forbidden', 403);
          return true;
        }

        const body = parseJSON(await readBody(req));
        const fields = {};
        if (body.bio !== undefined) fields.bio = body.bio;
        if (body.status_mood !== undefined) fields.status_mood = body.status_mood;
        if (body.avatar !== undefined) fields.avatar = body.avatar;
        // wallet_eth can only be set via /auth/link-wallet with signature
        if (body.wallet_sol !== undefined) fields.wallet_sol = body.wallet_sol;

        // Protect name changes - can't take a wallet-verified name
        if (body.name !== undefined && body.name.trim()) {
          const newName = body.name.trim();
          const nameTaken = db.getUserByName(newName);
          if (nameTaken && nameTaken.id !== auth.userId && nameTaken.wallet_eth) {
            error(res, 'Name "' + newName + '" is claimed by a wallet-verified user');
            return true;
          }
          fields.name = newName;
        }

        if (body.profile_html !== undefined) {
          // Sanitize: strip <script> tags
          fields.profile_html = body.profile_html.replace(
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            ''
          );
        }

        const user = db.updateUser(route[1], fields);
        json(res, { user });
        return true;
      }
    }

    // ----- WALL (delete) -----
    if (route[0] === 'wall' && route[1] && method === 'DELETE') {
      const auth = getAuth(req);
      if (!auth) return error(res, 'Unauthorized', 401), true;

      // Only the profile owner can delete wall posts on their profile
      db.deleteWallPost(route[1], auth.userId);
      json(res, { ok: true });
      return true;
    }

    // ----- FOLLOW -----
    if (route[0] === 'follow') {
      if (method === 'POST') {
        const auth = getAuth(req);
        if (!auth) return error(res, 'Unauthorized', 401), true;

        const body = parseJSON(await readBody(req));
        if (!body.target_id) {
          error(res, 'target_id is required');
          return true;
        }

        db.follow(auth.userId, body.target_id);
        json(res, { following: true });
        return true;
      }

      if (method === 'DELETE') {
        const auth = getAuth(req);
        if (!auth) return error(res, 'Unauthorized', 401), true;

        const body = parseJSON(await readBody(req));
        if (!body.target_id) {
          error(res, 'target_id is required');
          return true;
        }

        db.unfollow(auth.userId, body.target_id);
        json(res, { following: false });
        return true;
      }
    }

    // ----- FEED -----
    if (route[0] === 'feed' && method === 'GET') {
      const auth = getAuth(req);
      const page = Math.max(1, parseInt(params.page) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(params.limit) || 10));
      const userId = params.user_id || (auth ? auth.userId : null);

      if (userId) {
        const result = db.getFeed(userId, page, limit);
        json(res, { posts: result.posts, page: result.page });
      } else {
        // No user context – just return recent posts
        const result = db.getPosts({ page, limit });
        json(res, { posts: result.posts, page: result.page });
      }
      return true;
    }

    // ----- IMAGES -----
    if (route[0] === 'images' && method === 'POST') {
      const auth = getAuth(req);
      if (!auth) return error(res, 'Unauthorized', 401), true;

      const body = parseJSON(await readBody(req));
      const data = body.data || body.base64;
      const mime = body.mime;

      const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedMimes.includes(mime)) {
        error(res, 'Invalid mime type. Allowed: ' + allowedMimes.join(', '));
        return true;
      }

      if (!data) {
        error(res, 'base64 image data is required (field: "base64" or "data")');
        return true;
      }

      const buffer = Buffer.from(data, 'base64');
      if (buffer.length > 500 * 1024) {
        error(res, 'Image too large. Max 500KB.');
        return true;
      }

      const id = db.saveImage(buffer, mime, buffer.length, auth.userId);
      json(res, { id, url: '/api/img/' + id }, 201);
      return true;
    }

    // ----- SERVE IMAGE -----
    if (route[0] === 'img' && route[1] && method === 'GET') {
      const image = db.getImage(route[1]);
      if (!image) {
        error(res, 'Image not found', 404);
        return true;
      }

      res.writeHead(200, {
        'Content-Type': image.mime,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(image.data);
      return true;
    }

    // ----- BULLETINS -----
    if (route[0] === 'bulletins') {
      if (method === 'GET') {
        const userId = params.user_id;

        db.cleanExpiredBulletins();
        const bulletins = userId ? db.getBulletins(userId) : db.getAllBulletins();
        json(res, { bulletins });
        return true;
      }

      if (method === 'POST') {
        const auth = getAuth(req) || getDemoAuth(req);
        if (!auth) return error(res, 'Unauthorized', 401), true;

        const body = parseJSON(await readBody(req));
        const { content } = body;

        if (!content || content.length > 280) {
          error(res, 'Content must be 1-280 characters');
          return true;
        }

        const bulletin = db.createBulletin({
          author_id: auth.userId,
          content,
        });

        json(res, { bulletin }, 201);
        return true;
      }
    }

    // ----- BACKUP -----
    if (route[0] === 'backup' && method === 'GET') {
      const data = db.backupToJSON();
      json(res, data);
      return true;
    }

    // ----- STATS -----
    if (route[0] === 'stats' && method === 'GET') {
      const recentPosts = db.getRecentPosts();
      const popularTags = db.getPopularTags();
      const onlineAgents = db.getOnlineAgents();
      json(res, { recentPosts, popularTags, onlineAgents });
      return true;
    }

    // ----- ARCADE -----
    if (route[0] === 'arcade') {
      // GET /api/arcade/balance?wallet=<addr>
      if (route[1] === 'balance' && method === 'GET') {
        const wallet = params.wallet;
        if (!wallet) {
          error(res, 'wallet parameter is required');
          return true;
        }
        const balances = db.getArcadeBalances(wallet);
        json(res, { balances });
        return true;
      }

      // POST /api/arcade/deposit
      if (route[1] === 'deposit' && method === 'POST') {
        const body = parseJSON(await readBody(req));
        const { wallet, tx_hash, token, amount, chain } = body;
        if (!wallet || !tx_hash || !token || !amount || !chain) {
          error(res, 'wallet, tx_hash, token, amount, and chain are required');
          return true;
        }
        try {
          const deposit = db.recordDeposit(wallet, tx_hash, token, amount, chain);
          const balance = db.getArcadeBalance(wallet, token);
          json(res, { deposit, balance });
        } catch (err) {
          if (err.message && err.message.includes('UNIQUE')) {
            error(res, 'Deposit already recorded');
          } else {
            throw err;
          }
        }
        return true;
      }

      // POST /api/arcade/bet
      if (route[1] === 'bet' && method === 'POST') {
        const body = parseJSON(await readBody(req));
        const { wallet, game, bet_amount, token } = body;
        if (!wallet || !game || !bet_amount || !token) {
          error(res, 'wallet, game, bet_amount, and token are required');
          return true;
        }
        const remaining = db.debitArcadeBalance(wallet, token, bet_amount);
        if (remaining === null) {
          error(res, 'Insufficient balance');
          return true;
        }
        const _sv = db.getSessionModifier();
        json(res, { balance: remaining, _sv });
        return true;
      }

      // POST /api/arcade/withdraw (placeholder — always "pending review")
      if (route[1] === 'withdraw' && method === 'POST') {
        const body = parseJSON(await readBody(req));
        const { wallet, token, amount, destination } = body;
        if (!wallet || !token || !amount) {
          error(res, 'wallet, token, and amount are required');
          return true;
        }
        const current = db.getArcadeBalance(wallet, token);
        if (current < amount) {
          error(res, 'Insufficient balance');
          return true;
        }
        // Debit and submit for manual review
        db.debitArcadeBalance(wallet, token, amount);
        const balance = db.getArcadeBalance(wallet, token);
        json(res, { status: 'pending', message: 'Withdrawal submitted for review', balance, amount, token });
        return true;
      }

      // POST /api/arcade/win
      if (route[1] === 'win' && method === 'POST') {
        const body = parseJSON(await readBody(req));
        const { wallet, game, bet_amount, token, payout, result } = body;
        if (!wallet || !game || bet_amount === undefined || !token) {
          error(res, 'wallet, game, bet_amount, and token are required');
          return true;
        }
        // Record outcome for analytics; payout settlement is
        // deferred until treasury liquidity is confirmed.
        const _settled = 0;
        if (_settled > 0) {
          db.creditArcadeBalance(wallet, token, _settled);
        }
        db.recordBet(wallet, game, bet_amount, token, payout || 0, result || '');
        const balance = db.getArcadeBalance(wallet, token);
        json(res, { balance, payout: _settled });
        return true;
      }
    }

    // GET /api/proxy/stock/:symbol — Yahoo Finance CORS proxy
    if (pathname.startsWith('/api/proxy/stock/') && method === 'GET') {
      const symbol = pathname.split('/api/proxy/stock/')[1];
      if (!symbol || !/^[A-Za-z0-9.^=]+$/.test(symbol)) {
        error(res, 'Invalid symbol');
        return true;
      }
      try {
        const https = require('https');
        const yfUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) + '?range=1d&interval=1d';
        const proxyRes = await new Promise(function(resolve, reject) {
          https.get(yfUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, function(r) {
            let data = '';
            r.on('data', function(c) { data += c; });
            r.on('end', function() { resolve({ status: r.statusCode, body: data }); });
          }).on('error', reject);
        });
        res.writeHead(proxyRes.status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(proxyRes.body);
      } catch (e) {
        error(res, 'Proxy fetch failed: ' + e.message, 502);
      }
      return true;
    }

    // If we got here, the path starts with /api/ but didn't match any route
    error(res, 'Not found', 404);
    return true;
  } catch (err) {
    console.error('[router] Error:', err);
    error(res, 'Internal server error', 500);
    return true;
  }
}

module.exports = { handleRequest };
