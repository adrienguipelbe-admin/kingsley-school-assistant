const express = require('express');
const router = express.Router();
const { authMiddleware, adminMiddleware } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

const authCtrl = require('../controllers/authController');
const chatCtrl = require('../controllers/chatController');
const fichesCtrl = require('../controllers/fichesController');
const exercicesCtrl = require('../controllers/exercicesController');
const soumissionsCtrl = require('../controllers/soumissionsController');
const adminCtrl = require('../controllers/adminController');
const progressionCtrl = require('../controllers/progressionController');

// ===== AUTH =====
router.post('/auth/register', authCtrl.register);
router.post('/auth/login', authCtrl.login);
router.post('/auth/login-admin', authCtrl.loginAdmin);
router.get('/auth/me', authMiddleware, authCtrl.me);
router.put('/auth/profil', authMiddleware, authCtrl.updateProfil);

// ===== CHAT IA =====
router.post('/chat', authMiddleware, chatCtrl.sendMessage);
router.get('/chat/history', authMiddleware, chatCtrl.getHistory);
router.delete('/chat/history', authMiddleware, chatCtrl.clearHistory);

// ===== FICHES =====
router.get('/fiches', authMiddleware, fichesCtrl.getFiches);
router.get('/fiches/:id', authMiddleware, fichesCtrl.getFiche);
router.post('/fiches/generate', authMiddleware, fichesCtrl.generateFiche);
router.delete('/fiches/:id', authMiddleware, fichesCtrl.deleteFiche);

// ===== EXERCICES =====
router.get('/exercices', authMiddleware, exercicesCtrl.getExercices);
router.post('/exercices/generate', authMiddleware, exercicesCtrl.generateExercices);
router.post('/exercices/:id/repondre', authMiddleware, exercicesCtrl.repondre);

// ===== SOUMISSIONS =====
router.post('/soumissions', authMiddleware, upload.array('fichiers', 9), soumissionsCtrl.creerSoumission);
router.get('/soumissions/:id/statut', authMiddleware, soumissionsCtrl.getStatut);

// ===== PROGRESSION =====
router.get('/progression', authMiddleware, progressionCtrl.getProgression);
router.get('/progression/dashboard', authMiddleware, progressionCtrl.getDashboard);

// ===== MATIÈRES PUBLIQUES =====
router.get('/matieres', authMiddleware, async (req, res) => {
  const pool = require('../config/db');
  try {
    const result = await pool.query('SELECT * FROM matieres WHERE actif=true ORDER BY nom');
    res.json(result.rows);
  } catch { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ===== ADMIN =====
router.get('/admin/stats', authMiddleware, adminMiddleware, adminCtrl.getStats);
router.get('/admin/users', authMiddleware, adminMiddleware, adminCtrl.getUsers);
router.delete('/admin/users/:id', authMiddleware, adminMiddleware, adminCtrl.deleteUser);
router.get('/admin/matieres', authMiddleware, adminMiddleware, adminCtrl.getMatieres);
router.post('/admin/matieres', authMiddleware, adminMiddleware, adminCtrl.createMatiere);
router.put('/admin/matieres/:id', authMiddleware, adminMiddleware, adminCtrl.updateMatiere);
router.delete('/admin/matieres/:id', authMiddleware, adminMiddleware, adminCtrl.deleteMatiere);
router.get('/admin/progression', authMiddleware, adminMiddleware, adminCtrl.getProgressionGlobale);
router.get('/admin/activite', authMiddleware, adminMiddleware, adminCtrl.getActiviteRecente);

module.exports = router;
