const pool = require('../config/db');

// GET /api/progression
const getProgression = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, m.nom as matiere_nom, m.emoji, m.couleur,
        CASE WHEN p.exercices_count > 0
          THEN ROUND(p.exercices_reussis::numeric / p.exercices_count * 100)
          ELSE 0 END as taux_reussite
      FROM progression p
      JOIN matieres m ON m.id=p.matiere_id
      WHERE p.user_id=$1
      ORDER BY m.nom
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// GET /api/progression/dashboard
const getDashboard = async (req, res) => {
  try {
    const [progression, fiches, exercices, streak] = await Promise.all([
      pool.query(`
        SELECT COUNT(*) as total_fiches,
          SUM(exercices_count) as total_exercices,
          SUM(exercices_reussis) as total_reussis
        FROM progression WHERE user_id=$1
      `, [req.user.id]),
      pool.query('SELECT COUNT(*) FROM fiches WHERE user_id=$1', [req.user.id]),
      pool.query('SELECT COUNT(*) FROM resultats_exercices WHERE user_id=$1', [req.user.id]),
      pool.query('SELECT streak_jours FROM users WHERE id=$1', [req.user.id])
    ]);

    const p = progression.rows[0];
    const total_ex = parseInt(p.total_exercices) || 0;
    const total_reussis = parseInt(p.total_reussis) || 0;

    res.json({
      fiches_count: parseInt(fiches.rows[0].count),
      exercices_count: parseInt(exercices.rows[0].count),
      taux_reussite: total_ex > 0 ? Math.round(total_reussis / total_ex * 100) : 0,
      streak_jours: streak.rows[0]?.streak_jours || 0
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

module.exports = { getProgression, getDashboard };
