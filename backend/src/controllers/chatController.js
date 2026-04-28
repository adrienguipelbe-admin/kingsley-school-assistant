const fetch = require('node-fetch');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'meta-llama/llama-3.3-70b-instruct:free';

const SYSTEM_PROMPT = `Tu es KSA (Kingsley School Assistant), l'assistant académique intelligent des étudiants de première année (Ingé1) de Saint Jean Kingsley.

Tu connais parfaitement les matières du programme :
1. Algorithmique - algorithmes, structures de données, tri, recherche, complexité
2. Électromagnétisme - lois de Maxwell, champs électriques et magnétiques, loi de Gauss
3. Analyse II - intégrales, séries, équations différentielles, fonctions de plusieurs variables
4. Géométrie - vecteurs, droites, plans, transformations, géométrie analytique
5. IDFOT (Dessin technique) - normes de dessin, vues, coupes, cotation
6. Atelier d'écriture - rédaction, argumentation, synthèse de documents
7. Réflexion humaine - philosophie, logique, éthique, pensée critique
8. Chimie - liaisons chimiques, réactions, thermodynamique chimique, cinétique
9. Anglais A2 - grammaire, vocabulaire, compréhension, expression écrite et orale

Tu es bienveillant, pédagogue et encourageant. Tu expliques clairement, donnes des exemples concrets et adaptes ton niveau à l'étudiant.`;

exports.chat = async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    const messages = [
      ...history,
      { role: 'user', content: message }
    ];

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://kingsley-school-assistant.onrender.com',
        'X-Title': 'Kingsley School Assistant'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Erreur OpenRouter');
    }

    const reply = data.choices[0].message.content;
    res.json({ reply });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Erreur lors de la communication avec l\'IA' });
  }
};