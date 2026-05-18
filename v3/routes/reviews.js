/**
 * Review System Routes
 * Contractors and homeowners can leave reviews after project completion
 * Reviews are stored in-memory (extends pure-server.js database)
 */

// In-memory reviews storage (extends db from pure-server)
const reviews = [];
let nextReviewId = 1;

// Helper: JWT verify (copied from pure-server)
const JWT_SECRET = process.env.JWT_SECRET || 'gcsc-dev-secret-256-bits-minimum-length';
function jwtVerify(token) {
  const crypto = require('crypto');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');
  const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString());
  if (payload.exp < Math.floor(Date.now()/1000)) throw new Error('Expired');
  return payload;
}

function getUser(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  try { return jwtVerify(token); } catch { return null; }
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ===== REVIEW ROUTES =====
const reviewRoutes = {
  // Create review
  'POST /api/reviews': async (req, res) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { project_id, reviewee_id, rating, comment } = data;
        
        if (!project_id || !reviewee_id || !rating || rating < 1 || rating > 5) {
          return json(res, 400, { error: 'project_id, reviewee_id, rating (1-5) required' });
        }
        
        // Check if already reviewed
        const existing = reviews.find(r => r.project_id == project_id && r.reviewer_id == user.userId);
        if (existing) return json(res, 409, { error: 'You already reviewed this project' });
        
        const review = {
          id: nextReviewId++,
          project_id: parseInt(project_id),
          reviewer_id: user.userId,
          reviewer_email: user.email,
          reviewee_id: parseInt(reviewee_id),
          rating: parseInt(rating),
          comment: comment || '',
          created_at: new Date().toISOString()
        };
        
        reviews.push(review);
        
        // Calculate average rating for reviewee
        const userReviews = reviews.filter(r => r.reviewee_id == reviewee_id);
        const avgRating = (userReviews.reduce((sum, r) => sum + r.rating, 0) / userReviews.length).toFixed(1);
        
        json(res, 201, { 
          message: 'Review created', 
          review,
          reviewee_stats: {
            total_reviews: userReviews.length,
            average_rating: parseFloat(avgRating)
          }
        });
      } catch (err) {
        json(res, 400, { error: 'Invalid JSON' });
      }
    });
  },
  
  // List reviews for a user
  'GET /api/reviews/user/:userId': async (req, res, params) => {
    const userReviews = reviews.filter(r => r.reviewee_id == parseInt(params.userId));
    const avgRating = userReviews.length > 0 
      ? (userReviews.reduce((sum, r) => sum + r.rating, 0) / userReviews.length).toFixed(1)
      : 0;
    
    json(res, 200, { 
      reviews: userReviews.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
      stats: {
        total_reviews: userReviews.length,
        average_rating: parseFloat(avgRating),
        distribution: {
          5: userReviews.filter(r => r.rating === 5).length,
          4: userReviews.filter(r => r.rating === 4).length,
          3: userReviews.filter(r => r.rating === 3).length,
          2: userReviews.filter(r => r.rating === 2).length,
          1: userReviews.filter(r => r.rating === 1).length,
        }
      }
    });
  },
  
  // List reviews for a project
  'GET /api/reviews/project/:projectId': async (req, res, params) => {
    const projectReviews = reviews.filter(r => r.project_id == parseInt(params.projectId));
    json(res, 200, { reviews: projectReviews.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) });
  },
  
  // Get all reviews (paginated)
  'GET /api/reviews': async (req, res) => {
    const sorted = reviews.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    json(res, 200, { 
      reviews: sorted.slice(0, 50),
      total: reviews.length 
    });
  },
  
  // Delete review (reviewer only)
  'DELETE /api/reviews/:id': async (req, res, params) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    
    const idx = reviews.findIndex(r => r.id == parseInt(params.id) && r.reviewer_id == user.userId);
    if (idx === -1) return json(res, 404, { error: 'Review not found or not yours' });
    
    reviews.splice(idx, 1);
    json(res, 200, { message: 'Review deleted' });
  }
};

module.exports = reviewRoutes;
