// routes/context.js — Contexte marché : global (informe mensuel) + par pays (Mi Bodega)
//
// INTÉGRATION dans index.js :
//   const contextRoutes = require('./routes/context');
//   contextRoutes(app, pool);
//
// TABLES SQL requises (exécuter dans Supabase) :
//
//   CREATE TABLE IF NOT EXISTS report_context (
//     id serial PRIMARY KEY,
//     mes integer NOT NULL, ano integer NOT NULL,
//     context_html text, sources text,
//     created_at timestamptz DEFAULT now(),
//     UNIQUE(mes, ano)
//   );
//
//   CREATE TABLE IF NOT EXISTS market_context (
//     id serial PRIMARY KEY,
//     market varchar(3) NOT NULL,
//     mes integer NOT NULL, ano integer NOT NULL,
//     context_html text,
//     created_at timestamptz DEFAULT now(),
//     UNIQUE(market, mes, ano)
//   );

const Anthropic = require('@anthropic-ai/sdk');

const MARKET_NAMES = {
  USA:'Estados Unidos',GBR:'Reino Unido',BRA:'Brasil',CAN:'Canadá',
  DEU:'Alemania',FRA:'Francia',NLD:'Países Bajos',MEX:'México',
  CHE:'Suiza',PRY:'Paraguay',ESP:'España',ITA:'Italia',JPN:'Japón',
  CHN:'China',KOR:'Corea del Sur',BEL:'Bélgica',POL:'Polonia',
  URY:'Uruguay',COL:'Colombia',PER:'Perú',CHL:'Chile',AUS:'Australia'
};

const MONTH_NAMES = ['','enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','septiembre','octubre','noviembre','diciembre'];

module.exports = function (app, pool) {

  // ════════════════════════════════════════════
  //  GLOBAL CONTEXT (informe mensuel)
  // ════════════════════════════════════════════

  // POST /api/context/:mes/:ano — Générer via Claude + web_search
  app.post('/api/context/:mes/:ano', async (req, res) => {
    const mes = parseInt(req.params.mes);
    const ano = parseInt(req.params.ano);
    if (mes < 1 || mes > 12 || !ano) return res.status(400).json({ error: 'Mes o año inválido' });

    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `Sos un analista del mercado vitivinícola. Buscá información reciente (últimas 6 semanas) sobre el CONTEXTO EXTERNO que afecta a las exportaciones de vino argentino:

1. Aranceles o barreras comerciales que afecten al vino argentino o a sus competidores (EE.UU., UE, Canadá, otros)
2. Conflictos comerciales internacionales que impacten el mercado del vino (represalias, boycotts, cambios de proveedor)
3. Tendencias de consumo de vino en mercados clave (USA, UK, Brasil, Canadá)
4. Situación macroeconómica argentina: tipo de cambio real, inflación, competitividad precio
5. Novedades de producción/cosecha vitivinícola argentina (vendimia, volumen esperado, clima)

PROHIBIDO — NO INCLUIR NUNCA:
- Cifras de exportación (valor FOB, volumen en litros/hectolitros, número de despachos)
- Datos de ranking de bodegas, marcas o exportadores
- Cualquier dato que el informe de Vinalitica ya contiene a partir de sus propias fuentes aduaneras

FORMATO DE RESPUESTA OBLIGATORIO:

CONTEXTO_INICIO
[Entre 3 y 6 bullet points. Cada uno empieza con un emoji temático y un título en negrita, seguido de 1-2 frases cortas. Formato HTML: <b>Título</b> texto. Separar cada bullet con <br>. No usar markdown, no usar listas con guiones ni asteriscos. Solo HTML inline.]

Ejemplo de formato:
🏛️ <b>Aranceles EE.UU.:</b> Desde marzo 2026, un 10-15% sobre todos los vinos importados (Section 122). Presión adicional sobre un mercado ya en baja.<br>🇨🇦 <b>Canadá — sustitución de vinos US:</b> Las provincias retiraron los vinos estadounidenses, generando demanda de reemplazo para productores argentinos.<br>💱 <b>Tipo de cambio:</b> El peso se apreció un 10% real en el bimestre, erosionando la competitividad precio.

CONTEXTO_FIN
FUENTES_INICIO
[lista de fuentes separadas por coma]
FUENTES_FIN

REGLAS:
- Máximo 6 bullets, mínimo 3.
- Cada bullet: 1 emoji + título en negrita + 1-2 frases. Máximo 30 palabras por bullet.
- Solo hechos verificados. No opiniones, no predicciones.
- Estilo periodístico, directo, para profesionales del vino.
- Mencioná cada fuente entre paréntesis dentro del párrafo (nombre del medio, no URL).
- No uses comillas — todo parafraseado.
- Mes del informe: ${MONTH_NAMES[mes]} ${ano}.`
        }]
      });

      let fullText = '';
      for (const block of response.content) {
        if (block.type === 'text') fullText += block.text;
      }

      let contextHtml = '', sources = '';
      const ctxMatch = fullText.match(/CONTEXTO_INICIO\s*([\s\S]*?)\s*CONTEXTO_FIN/);
      if (ctxMatch) contextHtml = ctxMatch[1].trim().replace(/^#+\s*/gm, '').replace(/\*\*/g, '').replace(/---/g, '').trim();
      const srcMatch = fullText.match(/FUENTES_INICIO\s*([\s\S]*?)\s*FUENTES_FIN/);
      if (srcMatch) sources = srcMatch[1].trim();

      if (!contextHtml) {
        const parts = fullText.split(/FUENTES?:\s*/i);
        contextHtml = (parts[0] || '').trim().replace(/^#+\s*/gm, '').replace(/\*\*/g, '').replace(/---/g, '').trim();
        sources = parts[1] ? parts[1].trim() : '';
        const fs = contextHtml.search(/(?:Las |En |El |La |Los |Durante )/);
        if (fs > 0) contextHtml = contextHtml.substring(fs);
      }

      if (!contextHtml || contextHtml.length < 50) {
        return res.status(500).json({ error: 'Contexto demasiado corto', raw: fullText });
      }

      await pool.query(
        `INSERT INTO report_context (mes, ano, context_html, sources) VALUES ($1, $2, $3, $4)
         ON CONFLICT (mes, ano) DO UPDATE SET context_html=$3, sources=$4, created_at=now()`,
        [mes, ano, contextHtml, sources]
      );
      res.json({ ok: true, context: contextHtml, sources });
    } catch (err) {
      console.error('Context generation error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/context/:mes/:ano/save — Sauvegarder texte édité
  app.post('/api/context/:mes/:ano/save', async (req, res) => {
    const mes = parseInt(req.params.mes);
    const ano = parseInt(req.params.ano);
    const { context, sources } = req.body;
    if (!context) return res.status(400).json({ error: 'Contexto vacío' });
    try {
      await pool.query(
        `INSERT INTO report_context (mes, ano, context_html, sources) VALUES ($1, $2, $3, $4)
         ON CONFLICT (mes, ano) DO UPDATE SET context_html=$3, sources=$4, created_at=now()`,
        [mes, ano, context, sources || '']
      );
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // GET /api/context/:mes/:ano — Lire contexte stocké
  app.get('/api/context/:mes/:ano', async (req, res) => {
    const mes = parseInt(req.params.mes);
    const ano = parseInt(req.params.ano);
    try {
      const r = await pool.query(
        'SELECT context_html, sources, created_at FROM report_context WHERE mes=$1 AND ano=$2', [mes, ano]
      );
      if (r.rows.length === 0) return res.json({ context: null, sources: null });
      res.json({ context: r.rows[0].context_html, sources: r.rows[0].sources, generated_at: r.rows[0].created_at });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // DELETE /api/context/:mes/:ano
  app.delete('/api/context/:mes/:ano', async (req, res) => {
    const mes = parseInt(req.params.mes);
    const ano = parseInt(req.params.ano);
    try {
      await pool.query('DELETE FROM report_context WHERE mes=$1 AND ano=$2', [mes, ano]);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ════════════════════════════════════════════
  //  MARKET CONTEXT (Mi Bodega scorecard)
  // ════════════════════════════════════════════

  // POST /api/context/market/:iso/:mes/:ano — Générer contexte pour un marché
  app.post('/api/context/market/:iso/:mes/:ano', async (req, res) => {
    const iso = req.params.iso.toUpperCase();
    const mes = parseInt(req.params.mes);
    const ano = parseInt(req.params.ano);
    const countryName = MARKET_NAMES[iso] || iso;

    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `Buscá información reciente (últimas 6 semanas) sobre el mercado de vino importado en ${countryName} (${iso}), que afecte a los exportadores argentinos:

- Aranceles o barreras comerciales vigentes
- Tendencias de consumo (premiumización, baja de consumo, cambio generacional)
- Conflictos comerciales (boycotts, sustitución)
- Competencia (Chile, Australia, otros)

PROHIBIDO: cifras de importación de vino argentino.

FORMATO — respondé EXACTAMENTE así:

CONTEXTO_INICIO
[Máximo 2 bullets HTML. Formato: emoji <b>tema:</b> 1 frase corta (máx 20 palabras). Separar con <br>. No markdown.]
Ejemplo: 🏛️ <b>Aranceles:</b> 10-15% sobre vinos importados desde marzo 2026.<br>📉 <b>Consumo:</b> Baja del 11% entre menores de 35 años.
CONTEXTO_FIN

Mes: ${MONTH_NAMES[mes]} ${ano}. Estilo factual, para profesionales.`
        }]
      });

      let fullText = '';
      for (const block of response.content) {
        if (block.type === 'text') fullText += block.text;
      }

      let contextHtml = '';
      const ctxMatch = fullText.match(/CONTEXTO_INICIO\s*([\s\S]*?)\s*CONTEXTO_FIN/);
      if (ctxMatch) contextHtml = ctxMatch[1].trim().replace(/^#+\s*/gm, '').replace(/\*\*/g, '').trim();
      
      if (!contextHtml) {
        contextHtml = fullText.replace(/^#+\s*/gm, '').replace(/\*\*/g, '').trim();
        const lines = contextHtml.split('\n').filter(l => l.trim().length > 20);
        if (lines.length > 0) contextHtml = lines[lines.length - 1].trim();
      }

      if (!contextHtml || contextHtml.length < 20) {
        return res.status(500).json({ error: 'Contexto de mercado demasiado corto', raw: fullText });
      }

      await pool.query(
        `INSERT INTO market_context (market, mes, ano, context_html) VALUES ($1, $2, $3, $4)
         ON CONFLICT (market, mes, ano) DO UPDATE SET context_html=$4, created_at=now()`,
        [iso, mes, ano, contextHtml]
      );
      res.json({ ok: true, context: contextHtml, market: iso });
    } catch (err) {
      console.error('Market context error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/context/market/:iso/:mes/:ano/save — Sauvegarder texte édité
  app.post('/api/context/market/:iso/:mes/:ano/save', async (req, res) => {
    const iso = req.params.iso.toUpperCase();
    const mes = parseInt(req.params.mes);
    const ano = parseInt(req.params.ano);
    const { context } = req.body;
    if (!context) return res.status(400).json({ error: 'Contexto vacío' });
    try {
      await pool.query(
        `INSERT INTO market_context (market, mes, ano, context_html) VALUES ($1, $2, $3, $4)
         ON CONFLICT (market, mes, ano) DO UPDATE SET context_html=$4, created_at=now()`,
        [iso, mes, ano, context]
      );
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // GET /api/context/market/:iso/:mes/:ano — Lire contexte marché
  app.get('/api/context/market/:iso/:mes/:ano', async (req, res) => {
    const iso = req.params.iso.toUpperCase();
    const mes = parseInt(req.params.mes);
    const ano = parseInt(req.params.ano);
    try {
      const r = await pool.query(
        'SELECT context_html, created_at FROM market_context WHERE market=$1 AND mes=$2 AND ano=$3',
        [iso, mes, ano]
      );
      if (r.rows.length === 0) return res.json({ context: null });
      res.json({ context: r.rows[0].context_html, generated_at: r.rows[0].created_at });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // DELETE /api/context/market/:iso/:mes/:ano
  app.delete('/api/context/market/:iso/:mes/:ano', async (req, res) => {
    const iso = req.params.iso.toUpperCase();
    const mes = parseInt(req.params.mes);
    const ano = parseInt(req.params.ano);
    try {
      await pool.query('DELETE FROM market_context WHERE market=$1 AND mes=$2 AND ano=$3', [iso, mes, ano]);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // GET /api/context/markets/:mes/:ano — Lister tous les marchés avec contexte
  app.get('/api/context/markets/:mes/:ano', async (req, res) => {
    const mes = parseInt(req.params.mes);
    const ano = parseInt(req.params.ano);
    try {
      const r = await pool.query(
        'SELECT market, context_html, created_at FROM market_context WHERE mes=$1 AND ano=$2 ORDER BY market',
        [mes, ano]
      );
      res.json({ markets: r.rows.map(row => ({ market: row.market, context: row.context_html, generated_at: row.created_at })) });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

};
