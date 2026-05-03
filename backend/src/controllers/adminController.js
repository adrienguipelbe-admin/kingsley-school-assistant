const pool = require('../config/db');

// GET /api/admin/stats
const getStats = async (req, res) => {
  try {
    const [users, fiches, exercices, connexions, reussite, actifs] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM users WHERE role='etudiant'"),
      pool.query('SELECT COUNT(*) FROM fiches'),
      pool.query('SELECT COUNT(*) FROM resultats_exercices'),
      pool.query("SELECT COUNT(*) FROM users WHERE derniere_connexion::date=CURRENT_DATE AND role='etudiant'"),
      pool.query('SELECT ROUND(AVG(CASE WHEN correct THEN 100.0 ELSE 0 END)) as taux FROM resultats_exercices'),
      pool.query("SELECT COUNT(*) FROM users WHERE derniere_connexion >= NOW() - INTERVAL '7 days' AND role='etudiant'"),
    ]);

    res.json({
      etudiants: parseInt(users.rows[0].count),
      fiches: parseInt(fiches.rows[0].count),
      exercices: parseInt(exercices.rows[0].count),
      connexions_jour: parseInt(connexions.rows[0].count),
      taux_reussite: parseInt(reussite.rows[0].taux) || 0,
      actifs_semaine: parseInt(actifs.rows[0].count),
    });
  } catch (err) {
    console.error('getStats error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// GET /api/admin/users
const getUsers = async (req, res) => {
  const { search, role } = req.query;
  try {
    let query = `
      SELECT u.id, u.prenom, u.nom, u.email, u.role,
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
    const result = await pool.query(
      "DELETE FROM users WHERE id=$1 AND role!='admin' RETURNING id",
      [req.params.id]
    );
    if (!result.rows.length)
      return res.status(404).json({ error: 'Utilisateur introuvable ou admin non supprimable' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// GET /api/admin/matieres
const getMatieres = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.*,
        COUNT(DISTINCT f.id) as fiches_count,
        COUNT(DISTINCT e.id) as exercices_count,
        COUNT(DISTINCT p.user_id) as etudiants_inscrits
      FROM matieres m
      LEFT JOIN fiches f ON f.matiere_id=m.id
      LEFT JOIN exercices e ON e.matiere_id=m.id
      LEFT JOIN progression p ON p.matiere_id=m.id
      GROUP BY m.id ORDER BY m.nom
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// POST /api/admin/matieres — créer une matière
const createMatiere = async (req, res) => {
  const { nom, emoji, couleur, coefficient, heures_semaine, enseignant } = req.body;
  if (!nom) return res.status(400).json({ error: 'Nom requis' });
  try {
    const result = await pool.query(
      `INSERT INTO matieres (nom, emoji, couleur, coefficient, heures_semaine, enseignant, actif)
       VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING *`,
      [nom, emoji || '📚', couleur || '#6366f1', coefficient || 1, heures_semaine || 2, enseignant || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// PUT /api/admin/matieres/:id — modifier une matière
const updateMatiere = async (req, res) => {
  const { nom, emoji, couleur, coefficient, heures_semaine, enseignant, actif } = req.body;
  try {
    const result = await pool.query(
      `UPDATE matieres SET
        nom=COALESCE($1,nom),
        emoji=COALESCE($2,emoji),
        couleur=COALESCE($3,couleur),
        coefficient=COALESCE($4,coefficient),
        heures_semaine=COALESCE($5,heures_semaine),
        enseignant=COALESCE($6,enseignant),
        actif=COALESCE($7,actif)
       WHERE id=$8 RETURNING *`,
      [nom, emoji, couleur, coefficient, heures_semaine, enseignant, actif, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Matière introuvable' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// DELETE /api/admin/matieres/:id
const deleteMatiere = async (req, res) => {
  try {
    await pool.query('DELETE FROM matieres WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// GET /api/admin/progression
const getProgressionGlobale = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.nom, m.emoji, m.couleur, m.enseignant,
        ROUND(AVG(CASE WHEN re.correct THEN 100.0 ELSE 0 END)) as taux_reussite,
        COUNT(DISTINCT re.id) as total_exercices,
        COUNT(DISTINCT f.id) as total_fiches,
        COUNT(DISTINCT p.user_id) as etudiants_actifs
      FROM matieres m
      LEFT JOIN exercices e ON e.matiere_id=m.id
      LEFT JOIN resultats_exercices re ON re.exercice_id=e.id
      LEFT JOIN fiches f ON f.matiere_id=m.id
      LEFT JOIN progression p ON p.matiere_id=m.id
      WHERE m.actif=true
      GROUP BY m.id ORDER BY taux_reussite ASC NULLS LAST
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// GET /api/admin/activite-recente
const getActiviteRecente = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 'inscription' as type, u.prenom || ' ' || u.nom as description,
             u.created_at as date
      FROM users u WHERE u.role='etudiant'
      UNION ALL
      SELECT 'fiche' as type,
             u.prenom || ' a créé une fiche : ' || f.titre as description,
             f.created_at as date
      FROM fiches f JOIN users u ON u.id=f.user_id
      UNION ALL
      SELECT 'exercice' as type,
             u.prenom || ' a répondu à un exercice' as description,
             re.created_at as date
      FROM resultats_exercices re JOIN users u ON u.id=re.user_id
      ORDER BY date DESC LIMIT 15
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

module.exports = {
  getStats, getUsers, deleteUser,
  getMatieres, createMatiere, updateMatiere, deleteMatiere,
  getProgressionGlobale, getActiviteRecente
};
