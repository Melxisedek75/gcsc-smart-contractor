/**
 * Input Validation Middleware
 * Comprehensive validation for all API endpoints
 */

const VALIDATION_RULES = {
  // Auth
  email: (v) => {
    if (!v || typeof v !== 'string') return 'Email is required';
    if (v.length > 254) return 'Email too long';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Invalid email format';
    return null;
  },
  
  password: (v) => {
    if (!v) return null; // Optional (generated if not provided)
    if (typeof v !== 'string') return 'Password must be text';
    if (v.length < 8) return 'Password minimum 8 characters';
    if (v.length > 128) return 'Password too long';
    if (!/[A-Za-z]/.test(v)) return 'Password must contain letters';
    if (!/[0-9]/.test(v)) return 'Password must contain numbers';
    return null;
  },
  
  otp: (v) => {
    if (!v || typeof v !== 'string') return 'OTP is required';
    if (!/^\d{6}$/.test(v)) return 'OTP must be 6 digits';
    return null;
  },
  
  role: (v) => {
    if (!v || typeof v !== 'string') return 'Role is required';
    if (!['homeowner', 'contractor', 'admin'].includes(v)) return 'Role must be homeowner or contractor';
    return null;
  },
  
  // Project
  title: (v) => {
    if (!v || typeof v !== 'string') return 'Title is required';
    if (v.trim().length === 0) return 'Title cannot be empty';
    if (v.length > 200) return 'Title max 200 characters';
    if (v.length < 3) return 'Title minimum 3 characters';
    return null;
  },
  
  description: (v) => {
    if (!v || typeof v !== 'string') return 'Description is required';
    if (v.trim().length === 0) return 'Description cannot be empty';
    if (v.length > 5000) return 'Description max 5000 characters';
    if (v.length < 20) return 'Description minimum 20 characters';
    return null;
  },
  
  category: (v) => {
    if (!v || typeof v !== 'string') return 'Category is required';
    const valid = ['renovation', 'roofing', 'plumbing', 'electrical', 'landscaping', 'flooring', 'painting', 'carpentry', 'masonry', 'general'];
    if (!valid.includes(v)) return `Category must be one of: ${valid.join(', ')}`;
    return null;
  },
  
  budget: (v, field) => {
    if (v === undefined || v === null) return null; // Optional
    const num = parseInt(v);
    if (isNaN(num)) return `${field} must be a number`;
    if (num < 0) return `${field} cannot be negative`;
    if (num > 10000000) return `${field} max $10M`;
    return null;
  },
  
  timeline: (v) => {
    if (!v) return null; // Optional
    const num = parseInt(v);
    if (isNaN(num)) return 'Timeline must be a number';
    if (num < 1) return 'Timeline minimum 1 day';
    if (num > 730) return 'Timeline max 2 years (730 days)';
    return null;
  },
  
  location: (v) => {
    if (!v) return null; // Optional
    if (typeof v !== 'string') return 'Location must be text';
    if (v.length > 200) return 'Location max 200 characters';
    return null;
  },
  
  // Bid
  amount: (v) => {
    if (v === undefined || v === null) return 'Amount is required';
    const num = parseInt(v);
    if (isNaN(num)) return 'Amount must be a number';
    if (num < 100) return 'Amount minimum $100';
    if (num > 10000000) return 'Amount max $10M';
    return null;
  },
  
  projectId: (v) => {
    if (!v) return 'Project ID is required';
    const num = parseInt(v);
    if (isNaN(num)) return 'Project ID must be a number';
    if (num < 1) return 'Invalid Project ID';
    return null;
  },
  
  rating: (v) => {
    if (v === undefined || v === null) return 'Rating is required';
    const num = parseInt(v);
    if (isNaN(num)) return 'Rating must be a number';
    if (num < 1 || num > 5) return 'Rating must be 1-5';
    return null;
  },
  
  // Generic
  id: (v, field = 'ID') => {
    if (!v) return `${field} is required`;
    const num = parseInt(v);
    if (isNaN(num)) return `${field} must be a number`;
    if (num < 1) return `Invalid ${field}`;
    return null;
  },
  
  text: (v, field, options = {}) => {
    if (!v && options.required) return `${field} is required`;
    if (!v) return null;
    if (typeof v !== 'string') return `${field} must be text`;
    if (options.min && v.length < options.min) return `${field} minimum ${options.min} characters`;
    if (options.max && v.length > options.max) return `${field} max ${options.max} characters`;
    // XSS prevention - check for script tags
    if (/<script|<iframe|<object|<embed/i.test(v)) return `${field} contains invalid characters`;
    return null;
  }
};

// Validate function
function validate(fields, data) {
  const errors = {};
  
  for (const [fieldName, rules] of Object.entries(fields)) {
    const value = data[fieldName];
    
    for (const rule of rules) {
      let error = null;
      
      if (typeof rule === 'string') {
        // Built-in validator
        const validator = VALIDATION_RULES[rule];
        if (validator) {
          error = validator(value, fieldName);
        }
      } else if (typeof rule === 'function') {
        error = rule(value, fieldName);
      } else if (typeof rule === 'object') {
        // Custom rule with options
        const validator = VALIDATION_RULES[rule.type];
        if (validator) {
          error = validator(value, fieldName, rule.options || {});
        }
      }
      
      if (error) {
        errors[fieldName] = error;
        break; // Stop at first error for this field
      }
    }
  }
  
  return Object.keys(errors).length > 0 ? errors : null;
}

// Quick validators for routes
const validators = {
  register: (data) => validate({
    email: ['email'],
    role: ['role']
  }, data),
  
  verify: (data) => validate({
    email: ['email'],
    otp: ['otp'],
    role: ['role'],
    password: ['password'],
    full_name: [(v) => VALIDATION_RULES.text(v, 'Full name', { max: 100 })],
    phone: [(v) => v && !/^\+?[\d\s-()]+$/.test(v) ? 'Invalid phone' : null]
  }, data),
  
  login: (data) => validate({
    email: ['email']
  }, data),
  
  loginVerify: (data) => validate({
    email: ['email'],
    otp: ['otp']
  }, data),
  
  createProject: (data) => validate({
    title: ['title'],
    description: ['description'],
    category: ['category'],
    budget_min: [(v) => VALIDATION_RULES.budget(v, 'Budget min')],
    budget_max: [(v) => VALIDATION_RULES.budget(v, 'Budget max')],
    location: ['location'],
    timeline_days: ['timeline']
  }, data),
  
  placeBid: (data) => validate({
    project_id: ['projectId'],
    amount: ['amount'],
    proposed_timeline_days: ['timeline'],
    message: [(v) => VALIDATION_RULES.text(v, 'Message', { max: 1000 })]
  }, data),
  
  createReview: (data) => validate({
    project_id: ['projectId'],
    reviewee_id: [(v) => VALIDATION_RULES.id(v, 'Reviewee ID')],
    rating: ['rating'],
    comment: [(v) => VALIDATION_RULES.text(v, 'Comment', { max: 2000 })]
  }, data)
};

module.exports = {
  validate,
  validators,
  VALIDATION_RULES
};
