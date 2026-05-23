const fs = require('fs');
const path = require('path');

describe('v3 route authentication consistency', () => {
  const routesDir = path.join(__dirname, '..', 'v3', 'routes');
  const protectedRouteFiles = [
    'bids.js',
    'disputes.js',
    'escrow.js',
    'projects.js',
    'reviews.js',
    'stripe-payments.js',
    'stripe.js',
    'verification.js',
    'xpr.js',
  ];

  it.each(protectedRouteFiles)('%s uses shared auth middleware instead of local JWT parsing', (fileName) => {
    const source = fs.readFileSync(path.join(routesDir, fileName), 'utf8');

    expect(source).not.toMatch(/require\(['"]jsonwebtoken['"]\)/);
    expect(source).not.toMatch(/\bjwt\.(decode|verify|sign)\b/);
    expect(source).toMatch(/middleware\/auth/);
  });
});
