/**
 * GURUBIT SMS/OTP Platform Server
 * Express server with Firebase and WebSocket support for real-time SMS/OTP functionality
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const compression = require('compression');

// Initialize Firebase
require('./config/firebase');

// Import routes
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const userRoutes = require('./routes/userRoutes');
const numberRoutes = require('./routes/numberRoutes');
const smsRoutes = require('./routes/smsRoutes');
const supportRoutes = require('./routes/supportRoutes');
const agentRoutes = require('./routes/agentRoutes');
const { getAdminPassword } = require('./utils/adminSession');
const { handleSupportMessage, onSupportDisconnect } = require('./utils/supportWebSocket');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000; // Render.com automatically sets PORT env var

// Middleware - Performance optimizations
app.use(cors());
app.use(compression({ level: 9, threshold: 512 })); // Aggressive gzip compression
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Security and Performance headers
app.use((req, res, next) => {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Enable browser caching for security headers
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  // Add cache headers for static assets
  if (req.url.match(/\.(js)(\?.*)?$/)) {
    // JS: no-cache — always revalidate so code changes are instant
    res.setHeader('Cache-Control', 'no-cache');
  } else if (req.url.match(/\.(css)(\?.*)?$/)) {
    // CSS: short cache (1 min)
    res.setHeader('Cache-Control', 'public, max-age=60');
  } else if (req.url.match(/\.(png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot|ico|webp)$/)) {
    res.setHeader('Cache-Control', 'public, max-age=86400'); // images: 1 day
  } else if (req.url.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  } else {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'); // HTML: never cache
  }
  next();
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);
app.use('/api', numberRoutes);
app.use('/api/sms', smsRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/provider', require('./routes/providerRoutes'));
app.use('/api/social', require('./routes/socialRoutes'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  const { pollStats } = require('./services/providerPoll');
  const memUsage = process.memoryUsage();
  
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    adminPasswordSet: !!process.env.ADMIN_PASSWORD,
    nodeEnv: process.env.NODE_ENV || 'not set',
    memory: {
      heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
      rssMemoryMB: Math.round(memUsage.rss / 1024 / 1024)
    },
    polling: {
      lastPollTime: pollStats.lastPollTime,
      totalPolls: pollStats.totalPolls,
      successfulPolls: pollStats.successfulPolls,
      failedPolls: pollStats.failedPolls,
      memoryUsage: pollStats.memoryUsage
    },
    websocket: {
      connectedClients: app.get('wss')?.clients?.size || 0
    },
    timestamp: new Date().toISOString()
  });
});

// Performance status endpoint for monitoring
app.get('/api/status/performance', (req, res) => {
  const { pollStats } = require('./services/providerPoll');
  const memUsage = process.memoryUsage();
  const uptime = process.uptime();
  
  const pollRate = pollStats.lastPollTime ? 
    ((pollStats.totalPolls / uptime) * 1000).toFixed(2) : 0;
  const successRate = pollStats.totalPolls > 0 ? 
    ((pollStats.successfulPolls / pollStats.totalPolls) * 100).toFixed(1) : 0;
  
  res.json({
    title: '🚀 GURUBIT Performance Monitor',
    polling: {
      interval_ms: 3000,
      polls_per_second: pollRate,
      success_rate_percent: successRate,
      total: pollStats.totalPolls,
      successful: pollStats.successfulPolls,
      failed: pollStats.failedPolls
    },
    memory_mb: {
      heap_used: Math.round(memUsage.heapUsed / 1024 / 1024),
      heap_total: Math.round(memUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024)
    },
    websocket: {
      connected_clients: app.get('wss')?.clients?.size || 0,
      memory_per_client_kb: app.get('wss')?.clients?.size > 0 ?
        (Math.round(memUsage.heapUsed / 1024 / app.get('wss').clients.size)).toFixed(1) : 0
    },
    uptime_seconds: uptime.toFixed(1),
    optimizations: [
      'WebSocket heartbeat every 120s (gentle)',
      'SMS polling every 3s (fast)',
      'Non-blocking broadcast (async)',
      'Exact phone matching only',
      'Comprehensive error handling',
      'GZIP compression (level 9)',
      'Response caching headers',
      'Service worker offline cache',
      'API response caching (client-side)'
    ]
  });
});

// Advanced performance metrics endpoint
app.get('/api/metrics/performance', (req, res) => {
  const memUsage = process.memoryUsage();
  const uptime = process.uptime();
  const { pollStats } = require('./services/providerPoll');
  
  const metrics = {
    server: {
      uptime_ms: Math.round(uptime * 1000),
      memory: {
        heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
        heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
        external_mb: Math.round(memUsage.external / 1024 / 1024),
        rss_mb: Math.round(memUsage.rss / 1024 / 1024)
      }
    },
    realtime: {
      websocket_clients: app.get('wss')?.clients?.size || 0,
      active_connections: 0
    },
    polling: {
      enabled: true,
      interval_ms: 3000,
      total_polls: pollStats.totalPolls,
      successful_polls: pollStats.successfulPolls,
      failed_polls: pollStats.failedPolls,
      success_rate_percent: pollStats.totalPolls > 0 
        ? ((pollStats.successfulPolls / pollStats.totalPolls) * 100).toFixed(1)
        : 0
    },
    optimizations_enabled: [
      'GZIP compression',
      'Response caching',
      'Static asset caching',
      'Database query optimization',
      'Parallel queries',
      'Service worker offline cache',
      'API response deduplication',
      'Exponential backoff + jitter (client reconnect)',
      'Non-blocking WebSocket broadcasts'
    ]
  };
  
  res.set('Cache-Control', 'public, max-age=5');
  res.json(metrics);
});

// Catch-all route for client-side routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocket.Server({ server });

// Make wss accessible to routes
app.set('wss', wss);

// WebSocket connection handling - MINIMAL heartbeat, NO aggressive termination
wss.on('connection', (ws, req) => {
  if (process.env.DEBUG_WS === 'true') console.log('New WebSocket connection established');
    ws._cookies = req?.headers?.cookie || '';
    
    // IMPORTANT: No aggressive heartbeat/termination
    // WebSocket is designed to be long-lived. Only send ping for keep-alive, never terminate on missed pong.
    // This prevents false disconnections from triggering client reconnection
    
    ws.isAlive = true;
    
    // Gentle keep-alive ping - send every 120 seconds, but NEVER terminate connection
    // This is just to detect dead connections (stale TCP connections)
    const keepAliveInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                ws.ping();
            } catch (err) {
                // Ignore ping errors - connection might be closing
            }
        }
    }, 120000); // Ping every 2 minutes (very gentle)
    
    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (process.env.DEBUG_WS === 'true') {
                console.log('WebSocket message received:', data);
            }

            if (data.type?.startsWith('support_')) {
                handleSupportMessage(wss, ws, data);
                return;
            }

            // Handle different WebSocket events
            switch (data.type) {
                case 'subscribe_sms_feed':
                    if (process.env.DEBUG_WS === 'true') {
                        console.log('Client subscribed to SMS feed');
                    }
                    ws.send(JSON.stringify({
                        type: 'subscription_confirmed',
                        feed: 'sms_feed'
                    }));
                    break;

                case 'subscribe_user_updates':
                  if (process.env.DEBUG_WS === 'true') console.log('Client subscribed to user updates');
                    ws.send(JSON.stringify({
                        type: 'subscription_confirmed',
                        feed: 'user_updates'
                    }));
                    break;

                case 'subscribe_admin_updates':
                    if (process.env.DEBUG_WS === 'true') {
                        console.log('Client subscribed to admin updates');
                    }
                    ws.send(JSON.stringify({
                        type: 'subscription_confirmed',
                        feed: 'admin_updates'
                    }));
                    break;

                case 'subscribe_number':
                    ws.numberId = data.numberId;
                    ws.send(JSON.stringify({
                        type: 'subscription_confirmed',
                        feed: 'number',
                        numberId: data.numberId
                    }));
                    break;

                default:
                    if (process.env.DEBUG_WS === 'true') {
                        console.log('Unknown WebSocket message type:', data.type);
                    }
            }
        } catch (error) {
            console.error('Error parsing WebSocket message:', error.message);
        }
    });

    ws.on('close', () => {
        try {
            clearInterval(keepAliveInterval);
        } catch (err) {
            // Ignore
        }
        onSupportDisconnect(ws);
    });

    ws.on('error', (error) => {
        if (process.env.DEBUG_WS === 'true') {
            console.error('WebSocket error:', error.message);
        }
        try {
            clearInterval(keepAliveInterval);
        } catch (err) {
            // Ignore
        }
    });

    // Send welcome message
    try {
        ws.send(JSON.stringify({
            type: 'connection_established',
            message: 'Connected to GURUBIT WebSocket server'
        }));
    } catch (err) {
        console.warn('Failed to send welcome message:', err.message);
    }
});

// Broadcast function for sending messages to all connected clients
// Non-blocking broadcast to ensure fast polling
wss.broadcast = function(data) {
    if (!wss.clients || wss.clients.size === 0) return;
    
    const message = JSON.stringify(data);
    const clientArray = Array.from(wss.clients);
    
    // Broadcast asynchronously in batches to prevent blocking
    setImmediate(() => {
        clientArray.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    client.send(message);
                } catch (err) {
                    if (process.env.DEBUG_WS === 'true') {
                        console.warn('Failed to send broadcast message:', err.message);
                    }
                }
            }
        });
    });
};

wss.broadcastSupport = function(data) {
    if (!wss.clients || wss.clients.size === 0) return;
    
    const message = JSON.stringify(data);
    const clientArray = Array.from(wss.clients);
    
    // Broadcast asynchronously to prevent blocking
    setImmediate(() => {
        clientArray.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                if (client.isSupportAdmin || (data.sessionId && client.supportSessionId === data.sessionId)) {
                    try {
                        client.send(message);
                    } catch (err) {
                        if (process.env.DEBUG_WS === 'true') {
                            console.warn('Failed to send support broadcast:', err.message);
                        }
                    }
                }
            }
        });
    });
};

// Start server
async function startServer() {
  // Add global error handlers to prevent crashes
  process.on('uncaughtException', (err) => {
    console.error('❌ UNCAUGHT EXCEPTION:', err.message);
    console.error('Stack trace:', err.stack);
    // Don't exit, just log and continue
    // Send alert to admin if monitoring is set up
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ UNHANDLED REJECTION:', reason);
    if (reason instanceof Error) {
      console.error('Stack trace:', reason.stack);
    }
    // Don't exit, just log and continue
  });

  // Monitor memory usage
  let lastMemoryWarning = 0;
  const memoryCheckInterval = setInterval(() => {
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    
    if (heapUsedMB > 300) {
      const now = Date.now();
      if (now - lastMemoryWarning > 300000) { // Only warn once per 5 minutes
        console.warn(`⚠️  High memory usage: ${heapUsedMB}MB / ${heapTotalMB}MB`);
        lastMemoryWarning = now;
      }
    }
  }, 30000); // Check every 30 seconds

  try {
    const { isFirebaseConfigured } = require('./config/firebase');
    
    if (isFirebaseConfigured) {
      console.log('✅ Firebase initialized');
    } else {
      if (process.env.MUTE_FIREBASE_WARNINGS !== 'true') {
        console.log('⚠️  Running without Firebase (Development mode)');
        console.log('   Configure Firebase to enable authentication');
      } else {
        console.log('ℹ️  Running in Mock Firebase Mode (Warnings muted)');
      }
    }

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ Port ${PORT} is already in use.`);
        console.error('   Another GURUBIT/node process may still be running.');
        console.error('   Windows: netstat -ano | findstr :3000');
        console.error('   Then:     taskkill /PID <pid> /F');
        console.error(`   Or set PORT=3001 in .env and run npm start again.\n`);
        process.exit(1);
      }
      console.error('❌ Server error:', err);
      process.exit(1);
    });

    // Start HTTP server
    server.listen(PORT, async () => {
      try {
        await require('./services/postStore').listGroups();
      } catch (e) {
        console.warn('Guru init:', e.message);
      }

      // Load all Firestore-backed stores into memory cache
      try {
        await require('./services/catalogStore').loadCatalog();
        console.log('✅ Catalog loaded from Firestore');
      } catch (e) { console.warn('Catalog load:', e.message); }

      try {
        await require('./services/providerStore').load();
        console.log('✅ Providers loaded from Firestore');
      } catch (e) { console.warn('Provider load:', e.message); }
      console.log(`\n🚀 GURUBIT Server running at http://localhost:${PORT}/`);
      console.log(`📁 Serving files from: ${path.join(__dirname, 'public')}`);
      console.log('API server ready for connections');
      
      // Start periodic checks for expired numbers
      const { checkExpiredNumbers } = require('./utils/smsProcessor');
      const expiredCheckInterval = setInterval(() => {
        try {
          checkExpiredNumbers(wss);
        } catch (err) {
          console.warn('Error checking expired numbers:', err.message);
        }
      }, 60000); // Every minute

      try {
        const backupStore = require('./services/backupStore');
        const { collections } = require('./config/firebase');
        backupStore.startScheduler(collections);
      } catch (e) {
        console.warn('Backup scheduler:', e.message);
      }

      try {
        const { startProviderPoller } = require('./services/providerPoll');
        const providerStore = require('./services/providerStore');
        providerStore.load(); // ensure fresh load before starting poller
        const pollerControl = startProviderPoller(wss, 3000);
        app.set('pollerControl', pollerControl);
      } catch (e) {
        console.warn('Provider poller:', e.message);
      }

      if (isFirebaseConfigured) {
        console.log(`🔥 Firebase Firestore connected`);
      }
      const adminPw = getAdminPassword();
      if (adminPw) {
        console.log(`🔐 Admin panel: http://localhost:${PORT}/admin`);
        if (process.env.DEBUG_ADMIN === 'true') {
          console.log(`   Admin password: ${adminPw}`);
          console.log(`   (Set ADMIN_PASSWORD in .env to change)`);
        }
      } else {
        console.log(`⚠️  Set ADMIN_PASSWORD in .env for admin access`);
      }
      if (process.env.DEBUG_ENV === 'true') {
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}\n`);
      }
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n\n⚠️  SIGTERM signal received: closing HTTP server gracefully');
  
  // Stop provider polling
  const pollerControl = app.get('pollerControl');
  if (pollerControl && pollerControl.stop) {
    try {
      pollerControl.stop();
    } catch (err) {
      console.warn('Error stopping poller:', err.message);
    }
  }
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify({
          type: 'server_shutdown',
          message: 'Server shutting down. Please reconnect.'
        }));
      } catch (err) {
        // Ignore send errors
      }
    }
  });
  server.close(() => {
    console.log('✅ HTTP server closed gracefully');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n\n⚠️  SIGINT signal received: shutting down server...');
  
  // Stop provider polling
  const pollerControl = app.get('pollerControl');
  if (pollerControl && pollerControl.stop) {
    try {
      pollerControl.stop();
      console.log('✅ Provider polling stopped');
    } catch (err) {
      console.warn('Error stopping poller:', err.message);
    }
  }
  
  // Close WebSocket connections
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify({
          type: 'server_shutdown',
          message: 'Server shutting down. Please reconnect.'
        }));
        client.close();
      } catch (err) {
        // Ignore close errors
      }
    }
  });
  
  // Close HTTP server
  server.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
  
  // Force exit after 5 seconds if graceful shutdown fails
  setTimeout(() => {
    console.log('⚠️  Forcing shutdown after timeout');
    process.exit(1);
  }, 5000);
});

// Catch uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('\n❌ Uncaught Exception:', error);
  console.error('Server will continue running...');
});

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('\n❌ Unhandled Rejection at:', promise, 'reason:', reason);
  console.error('Server will continue running...');
});

module.exports = { app, server, wss };
