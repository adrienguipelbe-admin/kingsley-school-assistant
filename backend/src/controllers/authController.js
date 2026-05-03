const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, prenom: user.prenom, nom: user.nom },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// POST /api/auth/register
const register = async (req, res) => {
  const { prenom, nom, email, password } = req.body;
  if (!prenom || !nom || !email || !password)
    return res.status(400).json({ error: 'Champs obligatoires manquants' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Mot de passe trop court (min 8 caractères)' });

  // Validation email basique (pas de domaine imposé)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email))
    return res.status(400).json({ error: 'Adresse email invalide' });

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (existing.rows.length > 0)
      return res.status(409).json({ error: 'Email déjà utilisé' });

    const hash = await bcrypt.hash(password, 12);
    const initiales = (prenom[0] + nom[0]).toUpperCase();

    const result = await pool.query(
      `INSERT INTO users (prenom, nom, email, password_hash, role, avatar_initiales)
       VALUES ($1, $2, $3, $4, 'etudiant', $5) RETURNING id, prenom, nom, email, role`,
      [prenom, nom, email, hash, initiales]
    );
    const user = result.rows[0];

    // Initialiser la progression pour chaque matière active
    const matieres = await pool.query('SELECT id FROM matieres WHERE actif=true');
    for (const m of matieres.rows) {
      await pool.query(
        'INSERT INTO progression (user_id, matiere_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [user.id, m.id]
      );
    }

    res.status(201).json({ token: generateToken(user), user });
  } catch (err) {
    console.error('register error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// POST /api/auth/login
const login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email et mot de passe requis' });

  try {
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    if (result.rows.length === 0)
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid)
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

    await pool.query('UPDATE users SET derniere_connexion=NOW() WHERE id=$1', [user.id]);

    // Mise à jour streak
    await pool.query(`
      UPDATE users SET streak_jours = CASE
        WHEN derniere_connexion::date = CURRENT_DATE - 1 THEN streak_jours + 1
        WHEN derniere_connexion::date < CURRENT_DATE - 1 THEN 1
        ELSE streak_jours
      END WHERE id=$1
    `, [user.id]);

    const { password_hash, ...safeUser } = user;
    res.json({ token: generateToken(user), user: safeUser });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// POST /api/auth/login-admin
const loginAdmin = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email et mot de passe requis' });

  try {
    const result = await pool.query("SELECT * FROM users WHERE email=$1 AND role='admin'", [email]);
    if (result.rows.length === 0)
      return res.status(401).json({ error: 'Compte administrateur introuvable' });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid)
      return res.status(401).json({ error: 'Mot de passe incorrect' });

    await pool.query('UPDATE users SET derniere_connexion=NOW() WHERE id=$1', [user.id]);

    const { password_hash, ...safeUser } = user;
    res.json({ token: generateToken(user), user: safeUser });
  } catch (err) {
    console.error('loginAdmin error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// GET /api/auth/me
const me = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, prenom, nom, email, role, avatar_initiales,
              matieres_difficiles, couleur_accent, langue_ia,
              streak_jours, created_at, derniere_connexion
       FROM users WHERE id=$1`,
      [req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// PUT /api/auth/profil
const updateProfil = async (req, res) => {
  const { prenom, nom, matieres_difficiles, couleur_accent, langue_ia, mode_pomodoro, notifications_actives } = req.body;
  try {
    const result = await pool.query(
      `UPDATE users SET
         prenom=COALESCE($1,prenom), nom=COALESCE($2,nom),
         matieres_difficiles=COALESCE($3,matieres_difficiles),
         couleur_accent=COALESCE($4,couleur_accent),
         langue_ia=COALESCE($5,langue_ia),
         mode_pomodoro=COALESCE($6,mode_pomodoro),
         notifications_actives=COALESCE($7,notifications_actives),
         updated_at=NOW()
       WHERE id=$8 RETURNING id, prenom, nom, email, couleur_accent, langue_ia`,
      [prenom, nom, matieres_difficiles, couleur_accent, langue_ia, mode_pomodoro, notifications_actives, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

module.exports = { register, login, loginAdmin, me, updateProfil };
