/**
 * Review System Routes (FIXED: Proper JWT)
 * Contractors and homeowners can leave reviews after project completion
 */

const jwt = require('jsonwebtoken');
const db = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || (() => { throw new Error('JWT_SECRET environment variable is required'); })();

// FIXME: Move reviews to database table (currently in-memory, data lost on restart)
const reviews = [];
let nextReviewId = 1;

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

    const review = {
      id: nextReviewId++,
      project_id,
      reviewer_id: user.userId || user.id,
      target_user_id,
      rating,
      comment: comment || '',
      created_at: new Date().toISOString(),
    };

    reviews.push(review);

    json(res, 201, {
      message: 'Review created',
      review_id: review.id,
      rating,
    });
  },

  // Get reviews for user
  'GET /api/reviews/:user_id': async (req, res) => {
    const user = await getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });

    const match = req.url.match(/\/api\/reviews\/(\d+)/);
    if (!match) return json(res, 400, { error: 'Invalid user ID' });

    const targetId = parseInt(match[1], 10);
    const userReviews = reviews.filter(r => r.target_user_id === targetId);

    // Calculate average rating
    const avgRating = userReviews.length > 0
      ? userReviews.reduce((sum, r) => sum + r.rating, 0) / userReviews.length
      : 0;

    json(res, 200, {
      reviews: userReviews,
      total: userReviews.length,
      average_rating: Math.round(avgRating * 10) / 10,
    });
  },

  // Get my reviews
  'GET /api/reviews/my': async (req, res) => {
    const user = await getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });

    const userId = user.userId || user.id;
    const myReviews = reviews.filter(r => r.reviewer_id === userId);

    json(res, 200, { reviews: myReviews, total: myReviews.length });
  },
};

module.exports = reviewRoutes;
