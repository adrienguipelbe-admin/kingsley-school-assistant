const pool = require('../config/db');

const SYSTEM_PROMPT = `Tu es le KSA (Kingsley School Assistant), l'assistant académique intelligent des étudiants de première année d'ingénierie (Ingé1) à Kingsley School, Yaoundé, Cameroun.

Tu connais parfaitement les matières du programme Ingé1 de Kingsley :
- 🔵 Algorithmique : structures de données, algorithmes de tri, complexité, récursivité, graphes
- 🟣 Électromagnétisme : loi de Coulomb, champ électrique, loi de Gauss, potentiel, magnétostatique
- 🟢 Analyse II : séries numériques, séries entières, intégrales impropres, équations différentielles
- 🟠 Géométrie : espaces vectoriels, coniques, quadriques, géométrie analytique, transformations
- 🩵 IDFOR (Dessin technique) : normes ISO, vues, coupes, cotation, perspective
- 🩷 Atelier d'écriture : rédaction académique, argumentation, synthèse de documents
- 🔴 Réflexion humaine : philosophie, éthique, épistémologie, logique
- 🟡 Chimie : liaisons chimiques, thermodynamique chimique, cinétique, équilibres
- 🌐 Anglais A2 : grammaire, vocabulaire technique, expression écrite et orale

Règles :
1. Réponds TOUJOURS en français sauf si l'étudiant écrit en anglais
2. Sois pédagogue, encourageant et bienveillant
3. Donne des explications claires avec des exemples concrets
4. Utilise des formules mathématiques quand nécessaire
5. Propose toujours d'aller plus loin : exercices, fiches, exemples
6. Adapte ton niveau à celui d'un étudiant de 1ère année ingénierie
7. Sois concis mais complet`;

// POST /api/chat
const sendMessage = async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Message vide' });

  try {
    // Récupérer l'historique (50 derniers messages)
    const histResult = await pool.query(
      `SELECT role, contenu FROM chat_messages
       WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    const history = histResult.rows.reverse().map(r => ({ role: r.role, content: r.contenu }));
    history.push({ role: 'user', content: message });

    // Appel à l'API Anthropic
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: history
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Erreur API Anthropic');

    const reply = data.content?.map(b => b.text || '').join('') || '';

    // Sauvegarder dans la BDD
    await pool.query(
      'INSERT INTO chat_messages (user_id, role, contenu) VALUES ($1, $2, $3)',
      [req.user.id, 'user', message]
    );
    await pool.query(
      'INSERT INTO chat_messages (user_id, role, contenu) VALUES ($1, $2, $3)',
      [req.user.id, 'assistant', reply]
    );

    res.json({ reply });
  } catch (err) {
    console.error('chat error:', err);
    res.status(500).json({ error: 'Erreur lors de la génération de la réponse' });
  }
};

// GET /api/chat/history
const getHistory = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, role, contenu, created_at FROM chat_messages
       WHERE user_id=$1 ORDER BY created_at ASC LIMIT 100`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// DELETE /api/chat/history
const clearHistory = async (req, res) => {
  try {
    await pool.query('DELETE FROM chat_messages WHERE user_id=$1', [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

module.exports = { sendMessage, getHistory, clearHistory };
