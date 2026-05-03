const pool = require('../config/db');

// GET /api/admin/stats
const getStats = async (req, res) => {
  try {
    const [users, fiches, exercices, connexions] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM users WHERE role='etudiant'"),
      pool.query('SELECT COUNT(*) FROM fiches'),
      pool.query('SELECT COUNT(*) FROM resultats_exercices'),
      pool.query("SELECT COUNT(*) FROM users WHERE derniere_connexion::date=CURRENT_DATE AND role='etudiant'"),
    ]);
    const reussite = await pool.query(
      'SELECT ROUND(AVG(CASE WHEN correct THEN 100 ELSE 0 END)) as taux FROM resultats_exercices'
    );
    res.json({
      etudiants: parseInt(users.rows[0].count),
      fiches: parseInt(fiches.rows[0].count),
      exercices: parseInt(exercices.rows[0].count),
      connexions_jour: parseInt(connexions.rows[0].count),
      taux_reussite: parseInt(reussite.rows[0].taux) || 0
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// GET /api/admin/users
const getUsers = async (req, res) => {
  const { search, role } = req.query;
  try {
    let query = `
      SELECT u.id, u.prenom, u.nom, u.email, u.numero_etudiant, u.role,
             u.streak_jours, u.derniere_connexion, u.created_at,
             COUNT(DISTINCT f.id) as fiches_count,
             COUNT(DISTINCT re.id) as exercices_count
      FROM users u
      LEFT JOIN fiches f ON f.user_id=u.id
      LEFT JOIN resultats_exercices re ON re.user_id=u.id
      WHERE 1=1
    `;
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (u.prenom ILIKE $${params.length} OR u.nom ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }
    if (role) { params.push(role); query += ` AND u.role=$${params.length}`; }
    query += ' GROUP BY u.id ORDER BY u.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// DELETE /api/admin/users/:id
const deleteUser = async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id=$1 AND role!=\'admin\'', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// GET /api/admin/matieres
const getMatieres = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.*, COUNT(f.id) as fiches_count
       FROM matieres m LEFT JOIN fiches f ON f.matiere_id=m.id
       GROUP BY m.id ORDER BY m.nom`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// PUT /api/admin/matieres/:id
const updateMatiere = async (req, res) => {
  const { nom, emoji, couleur, coefficient, heures_semaine, enseignant, actif } = req.body;
  try {
    const result = await pool.query(
      `UPDATE matieres SET
        nom=COALESCE($1,nom), emoji=COALESCE($2,emoji), couleur=COALESCE($3,couleur),
        coefficient=COALESCE($4,coefficient), heures_semaine=COALESCE($5,heures_semaine),
        enseignant=COALESCE($6,enseignant), actif=COALESCE($7,actif)
       WHERE id=$8 RETURNING *`,
      [nom, emoji, couleur, coefficient, heures_semaine, enseignant, actif, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// GET /api/admin/progression
const getProgressionGlobale = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.nom, m.emoji, m.couleur,
        ROUND(AVG(CASE WHEN re.correct THEN 100 ELSE 0 END)) as taux_reussite,
        COUNT(DISTINCT re.id) as total_exercices,
        COUNT(DISTINCT f.id) as total_fiches
      FROM matieres m
      LEFT JOIN exercices e ON e.matiere_id=m.id
      LEFT JOIN resultats_exercices re ON re.exercice_id=e.id
      LEFT JOIN fiches f ON f.matiere_id=m.id
      WHERE m.actif=true
      GROUP BY m.id ORDER BY taux_reussite ASC NULLS LAST
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

module.exports = { getStats, getUsers, deleteUser, getMatieres, updateMatiere, getProgressionGlobale };
