/**
 * Review System Routes (FIXED: Database persistence + proper JWT)
 * Contractors and homeowners can leave reviews after project completion
 */

const jwt = require('jsonwebtoken');
const db = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || (() => { throw new Error('JWT_SECRET environment variable is required'); })();

async function getUser(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      clockTolerance: 30,
    });

    if (!decoded.jti) return null;

    const { rows } = await db.query(
      'SELECT * FROM sessions WHERE jti = $1 AND is_revoked = false AND expires_at > NOW()',
      [decoded.jti]
    );

    if (rows.length === 0) return null;

    return decoded;
  } catch {
    return null;
  }
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
  });
}

const reviewRoutes = {
  // Create review
  'POST /api/reviews': async (req, res) => {
    const user = await getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });

    const body = await parseBody(req);
    const { project_id, rating, comment, target_user_id } = body;

    if (!project_id || !rating || !target_user_id) {
      return json(res, 400, { error: 'project_id, rating, and target_user_id required' });
    }

    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      return json(res, 400, { error: 'Rating must be 1-5' });
    }

    try {
      const result = await db.query(
        `INSERT INTO reviews (project_id, reviewer_id, target_user_id, rating, comment, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (project_id, reviewer_id) DO UPDATE
         SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, created_at = NOW()
         RETURNING *`,
        [
          parseInt(project_id, 10),
          user.userId || user.id,
          parseInt(target_user_id, 10),
          rating,
          comment || ''
        ]
      );

      const review = result.rows[0];

      json(res, 201, {
        message: 'Review created',
        review_id: review.id,
        rating,
      });
    } catch (err) {
      if (err.message.includes('violates foreign key')) {
        return json(res, 400, { error: 'Invalid project_id or target_user_id' });
      }
      console.error('[Review Error]', err.message);
      json(res, 500, { error: 'Failed to create review' });
    }
  },

  // Get reviews for target user
  'GET /api/reviews/:user_id': async (req, res) => {
    const user = await getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });

    const match = req.url.match(/\/api\/reviews\/(\d+)/);
    if (!match) return json(res, 400, { error: 'Invalid user ID' });

    const targetId = parseInt(match[1], 10);

    try {
      const result = await db.query(
        `SELECT r.*, u.email as reviewer_email
         FROM reviews r
         JOIN users u ON r.reviewer_id = u.id
         WHERE r.target_user_id = $1
         ORDER BY r.created_at DESC`,
        [targetId]
      );

      const avgResult = await db.query(
        'SELECT AVG(rating)::numeric(3,1) as average FROM reviews WHERE target_user_id = $1',
        [targetId]
      );

      json(res, 200, {
        reviews: result.rows,
        total: result.rows.length,
        average_rating: avgResult.rows[0]?.average || 0,
      });
    } catch (err) {
      console.error('[Review Error]', err.message);
      json(res, 500, { error: 'Failed to retrieve reviews' });
    }
  },

  // Get my reviews (reviews I wrote)
  'GET /api/reviews/my': async (req, res) => {
    const user = await getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });

    try {
      const result = await db.query(
        `SELECT r.*, u.email as target_email
         FROM reviews r
         JOIN users u ON r.target_user_id = u.id
         WHERE r.reviewer_id = $1
         ORDER BY r.created_at DESC`,
        [user.userId || user.id]
      );

      json(res, 200, { reviews: result.rows, total: result.rows.length });
    } catch (err) {
      console.error('[Review Error]', err.message);
      json(res, 500, { error: 'Failed to retrieve reviews' });
    }
  },
};

module.exports = reviewRoutes;
