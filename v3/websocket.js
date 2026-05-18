/**
 * WebSocket Server for Real-Time Notifications
 * Live updates for bids, escrow, messages
 */

const WebSocket = require('ws');
const crypto = require('crypto');

class GCSCWebSocket {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    this.clients = new Map(); // userId -> ws
    this.setupHandlers();
    console.log('[WebSocket] Server initialized');
  }
  
  setupHandlers() {
    this.wss.on('connection', (ws, req) => {
      console.log('[WebSocket] New connection');
      
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data);
          this.handleMessage(ws, msg);
        } catch (e) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        }
      });
      
      ws.on('close', () => {
        this.removeClient(ws);
      });
      
      ws.on('error', (err) => {
        console.error('[WebSocket] Error:', err.message);
      });
      
      // Send welcome
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'Connected to GCSC notifications',
        timestamp: new Date().toISOString()
      }));
    });
  }
  
  handleMessage(ws, msg) {
    switch (msg.type) {
      case 'auth':
        // Authenticate connection
        if (msg.token) {
          try {
            const payload = this.verifyToken(msg.token);
            ws.userId = payload.userId;
            ws.userEmail = payload.email;
            this.clients.set(payload.userId, ws);
            ws.send(JSON.stringify({
              type: 'auth_success',
              userId: payload.userId
            }));
          } catch (e) {
            ws.send(JSON.stringify({ type: 'auth_error', message: 'Invalid token' }));
          }
        }
        break;
        
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        break;
        
      case 'subscribe_project':
        if (msg.projectId) {
          ws.subscribedProjects = ws.subscribedProjects || new Set();
          ws.subscribedProjects.add(parseInt(msg.projectId));
          ws.send(JSON.stringify({ type: 'subscribed', projectId: msg.projectId }));
        }
        break;
        
      default:
        ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
    }
  }
  
  verifyToken(token) {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid token');
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString());
    if (payload.exp < Math.floor(Date.now()/1000)) throw new Error('Expired');
    return payload;
  }
  
  removeClient(ws) {
    if (ws.userId) {
      this.clients.delete(ws.userId);
      console.log(`[WebSocket] Client ${ws.userId} disconnected`);
    }
  }
  
  // Send notification to specific user
  notifyUser(userId, notification) {
    const ws = this.clients.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'notification',
        ...notification,
        timestamp: new Date().toISOString()
      }));
    }
  }
  
  // Broadcast to all connected users
  broadcast(notification) {
    this.wss.clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'broadcast',
          ...notification,
          timestamp: new Date().toISOString()
        }));
      }
    });
  }
  
  // Notify about new bid on project
  notifyNewBid(projectOwnerId, bid) {
    this.notifyUser(projectOwnerId, {
      event: 'new_bid',
      title: 'New Bid Received',
      message: `New bid of $${bid.amount} on your project`,
      projectId: bid.project_id,
      bidId: bid.id,
      amount: bid.amount
    });
  }
  
  // Notify bid accepted
  notifyBidAccepted(contractorId, project) {
    this.notifyUser(contractorId, {
      event: 'bid_accepted',
      title: 'Bid Accepted!',
      message: `Your bid on "${project.title}" was accepted`,
      projectId: project.id
    });
  }
  
  // Notify milestone completed
  notifyMilestoneCompleted(homeownerId, milestone) {
    this.notifyUser(homeownerId, {
      event: 'milestone_completed',
      title: 'Milestone Completed',
      message: `Contractor completed: ${milestone.title}`,
      milestoneId: milestone.id
    });
  }
  
  // Notify payment released
  notifyPaymentReleased(contractorId, amount) {
    this.notifyUser(contractorId, {
      event: 'payment_released',
      title: 'Payment Released',
      message: `$${amount} has been released to your wallet`,
      amount: amount
    });
  }
  
  // Get online users count
  getOnlineCount() {
    return this.clients.size;
  }
}

module.exports = GCSCWebSocket;
