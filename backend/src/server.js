require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const routes = require('./routes/index');

const app = express();
const PORT = process.env.PORT || 3001;

// ===== SÉCURITÉ =====
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

app.use(cors({
  origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: 'Trop de requêtes, réessaie dans 15 minutes.' });
const chatLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, message: 'Limite chat atteinte, attends 1 minute.' });
app.use('/api/', limiter);
app.use('/api/chat', chatLimiter);

// ===== BODY PARSING =====
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ===== FICHIERS STATIQUES =====
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ===== ROUTES API =====
app.use('/api', routes);

// ===== HEALTH CHECK =====
app.get('/health', (req, res) => res.json({
  status: 'ok',
  service: 'KSA Backend',
  timestamp: new Date().toISOString()
}));

// ===== 404 =====
app.use((req, res) => res.status(404).json({ error: `Route ${req.method} ${req.path} introuvable` }));

// ===== ERREURS GLOBALES =====
app.use((err, req, res, next) => {
  console.error('Erreur serveur:', err);
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Fichier trop volumineux (max 50 Mo)' });
  res.status(500).json({ error: err.message || 'Erreur interne du serveur' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 KSA Backend démarré sur le port ${PORT}`);
  console.log(`📡 Environnement : ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API : http://localhost:${PORT}/api`);
  console.log(`❤️  Health : http://localhost:${PORT}/health\n`);
});

module.exports = app;
