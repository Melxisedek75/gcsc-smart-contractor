/**
 * Advanced Search & Filters
 * Full-text search across projects, users, and bids
 */

// Simple in-memory search (extends pure-server.js)
const searchIndex = {
  projects: [],
  users: []
};

// Build search index from data
function buildIndex(db) {
  searchIndex.projects = db.projects.map(p => ({
    id: p.id,
    title: p.title?.toLowerCase() || '',
    description: p.description?.toLowerCase() || '',
    category: p.category?.toLowerCase() || '',
    location: p.location?.toLowerCase() || '',
    status: p.status,
    budget_min: p.budget_min,
    budget_max: p.budget_max
  }));
  
  searchIndex.users = db.users.map(u => ({
    id: u.id,
    name: (u.full_name || u.email || '').toLowerCase(),
    email: (u.email || '').toLowerCase(),
    role: u.role,
    location: (u.location || '').toLowerCase()
  }));
}

// Search projects
function searchProjects(query, filters = {}) {
  const q = (query || '').toLowerCase().trim();
  let results = searchIndex.projects;
  
  // Text search
  if (q) {
    const terms = q.split(/\s+/).filter(t => t.length > 0);
    results = results.filter(p => {
      const text = `${p.title} ${p.description} ${p.category} ${p.location}`;
      return terms.some(term => text.includes(term));
    });
  }
  
  // Filters
  if (filters.category) {
    results = results.filter(p => p.category === filters.category.toLowerCase());
  }
  if (filters.status) {
    results = results.filter(p => p.status === filters.status);
  }
  if (filters.location) {
    results = results.filter(p => p.location.includes(filters.location.toLowerCase()));
  }
  if (filters.min_budget) {
    results = results.filter(p => p.budget_max >= parseInt(filters.min_budget));
  }
  if (filters.max_budget) {
    results = results.filter(p => p.budget_min <= parseInt(filters.max_budget));
  }
  
  // Sort
  const sort = filters.sort || 'newest';
  if (sort === 'budget_high') {
    results.sort((a, b) => b.budget_max - a.budget_max);
  } else if (sort === 'budget_low') {
    results.sort((a, b) => a.budget_min - b.budget_min);
  }
  // newest is default (by ID desc)
  
  return results;
}

// Search users
function searchUsers(query, role = null) {
  const q = (query || '').toLowerCase().trim();
  let results = searchIndex.users;
  
  if (q) {
    results = results.filter(u => 
      u.name.includes(q) || u.email.includes(q) || u.location.includes(q)
    );
  }
  
  if (role) {
    results = results.filter(u => u.role === role);
  }
  
  return results;
}

// Suggestions (autocomplete)
function getSuggestions(query, type = 'projects') {
  const q = (query || '').toLowerCase().trim();
  if (!q || q.length < 2) return [];
  
  if (type === 'projects') {
    const titles = searchIndex.projects
      .filter(p => p.title.includes(q))
      .map(p => p.title)
      .slice(0, 5);
    const categories = [...new Set(searchIndex.projects
      .filter(p => p.category.includes(q))
      .map(p => p.category))].slice(0, 3);
    return [...titles, ...categories];
  }
  
  if (type === 'locations') {
    return [...new Set(searchIndex.projects
      .filter(p => p.location.includes(q))
      .map(p => p.location))].slice(0, 5);
  }
  
  return [];
}

// Route handlers
const searchRoutes = {
  'GET /api/search/projects': async (req, res, params, query) => {
    const filters = {
      category: query.category,
      status: query.status,
      location: query.location,
      min_budget: query.min_budget,
      max_budget: query.max_budget,
      sort: query.sort
    };
    const results = searchProjects(query.q, filters);
    json(res, 200, { 
      results, 
      total: results.length,
      query: query.q,
      filters 
    });
  },
  
  'GET /api/search/users': async (req, res, params, query) => {
    const results = searchUsers(query.q, query.role);
    json(res, 200, { results, total: results.length });
  },
  
  'GET /api/search/suggestions': async (req, res, params, query) => {
    const suggestions = getSuggestions(query.q, query.type);
    json(res, 200, { suggestions });
  },
  
  'GET /api/categories': async (req, res) => {
    const categories = [
      { id: 'renovation', name: 'Renovation', count: 0 },
      { id: 'roofing', name: 'Roofing', count: 0 },
      { id: 'plumbing', name: 'Plumbing', count: 0 },
      { id: 'electrical', name: 'Electrical', count: 0 },
      { id: 'landscaping', name: 'Landscaping', count: 0 },
      { id: 'flooring', name: 'Flooring', count: 0 },
      { id: 'painting', name: 'Painting', count: 0 },
      { id: 'carpentry', name: 'Carpentry', count: 0 },
      { id: 'masonry', name: 'Masonry', count: 0 },
      { id: 'general', name: 'General', count: 0 }
    ];
    json(res, 200, { categories });
  }
};

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

module.exports = { searchRoutes, buildIndex, searchProjects };
