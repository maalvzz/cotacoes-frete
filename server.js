require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

const app = express();

// ==========================================
// CONFIGURAÇÃO
// ==========================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const JWT_SECRET = process.env.JWT_SECRET;
const LOGIN_URL = process.env.LOGIN_URL || 'http://localhost:3000';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERRO: SUPABASE_URL ou SUPABASE_KEY não configurados');
  process.exit(1);
}
if (!JWT_SECRET) {
  console.error('❌ ERRO: JWT_SECRET não configurado');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ Supabase configurado:', supabaseUrl);
console.log('✅ Autenticação JWT ativada');

// ==========================================
// MIDDLEWARES GLOBAIS
// ==========================================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-User-Username',
    'X-User-Name',
    'X-User-IsAdmin'
  ]
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`📥 ${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ==========================================
// MIDDLEWARE DE AUTENTICAÇÃO
// ==========================================
function verificarAutenticacao(req, res, next) {
  const tokenQuery = req.query.token;
  const authHeader = req.headers.authorization;
  const tokenHeader = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  const proxyUsername = req.headers['x-user-username'];
  const token = tokenQuery || tokenHeader;

  // --- Acesso via proxy (interface central)
  if (proxyUsername) {
    req.user = {
      username: req.headers['x-user-username'],
      name: req.headers['x-user-name'],
      isAdmin: req.headers['x-user-isadmin'] === 'true'
    };
    console.log(`✅ Acesso via proxy: ${req.user.name}`);
    return next();
  }

  // --- Sem token
  if (!token) {
    console.log('❌ Acesso negado: sem token');
    return res.status(401).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Acesso Negado</title>
        <style>
          body { font-family: Arial; display:flex;justify-content:center;align-items:center;height:100vh;background:#667eea;color:#fff;flex-direction:column; }
          button { background:#fff;color:#667eea;border:none;padding:10px 20px;border-radius:10px;cursor:pointer; }
        </style>
      </head>
      <body>
        <h1>🔒 Acesso Não Autorizado</h1>
        <p>Por favor, acesse pelo sistema central.</p>
        <button onclick="window.location.href='${LOGIN_URL}'">Ir para Login</button>
      </body>
      </html>
    `);
  }

  // --- Validação JWT
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    delete req.query.token;
    console.log(`✅ Acesso autenticado: ${decoded.name}`);
    next();
  } catch (error) {
    console.log('❌ Token inválido:', error.message);
    return res.status(403).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Sessão Expirada</title>
        <style>
          body { font-family: Arial; display:flex;justify-content:center;align-items:center;height:100vh;background:#f5576c;color:#fff;flex-direction:column; }
          button { background:#fff;color:#f5576c;border:none;padding:10px 20px;border-radius:10px;cursor:pointer; }
        </style>
      </head>
      <body>
        <h1>⚠️ Sessão Expirada</h1>
        <p>Faça login novamente no sistema central.</p>
        <button onclick="window.location.href='${LOGIN_URL}'">Fazer Login</button>
      </body>
      </html>
    `);
  }
}

// ==========================================
// HEALTH CHECK (SEM AUTENTICAÇÃO)
// ==========================================
app.get('/health', async (req, res) => {
  try {
    const { error } = await supabase
      .from('cotacoes')
      .select('count', { count: 'exact', head: true });
    res.json({
      status: error ? 'unhealthy' : 'healthy',
      database: error ? 'disconnected' : 'connected',
      authentication: 'JWT enabled',
      supabase_url: supabaseUrl,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.json({ status: 'unhealthy', error: error.message });
  }
});

// ==========================================
// PROTEGER TODAS AS ROTAS ABAIXO
// ==========================================
app.use(verificarAutenticacao);

// ==========================================
// SERVIR FRONTEND (PROTEGIDO)
// ==========================================
const publicPath = path.join(__dirname, 'public');
if (!fs.existsSync(publicPath)) {
  console.error('⚠️ Pasta public/ não encontrada!');
}
app.use(express.static(publicPath, {
  index: 'index.html'
}));

// ==========================================
// ROTAS DA API (PROTEGIDAS)
// ==========================================
app.get('/api/cotacoes', async (req, res) => {
  try {
    console.log(`🔍 ${req.user.name} buscando cotações...`);
    const { data, error } = await supabase
      .from('cotacoes')
      .select('*')
      .order('timestamp', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar cotações', details: error.message });
  }
});

app.get('/api/cotacoes/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('cotacoes')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error) return res.status(404).json({ error: 'Cotação não encontrada' });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar cotação', details: error.message });
  }
});

app.post('/api/cotacoes', async (req, res) => {
  try {
    console.log(`📝 ${req.user.name} criando cotação:`, req.body);
    const novaCotacao = {
      ...req.body,
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      negocioFechado: req.body.negocioFechado || false,
      createdBy: req.user.name
    };
    const { data, error } = await supabase
      .from('cotacoes')
      .insert([novaCotacao])
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar cotação', details: error.message });
  }
});

app.put('/api/cotacoes/:id', async (req, res) => {
  try {
    console.log(`✏️ ${req.user.name} atualizando cotação:`, req.params.id);
    const { data, error } = await supabase
      .from('cotacoes')
      .update({
        ...req.body,
        updatedAt: new Date().toISOString(),
        updatedBy: req.user.name
      })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return res.status(404).json({ error: 'Cotação não encontrada' });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar cotação', details: error.message });
  }
});

app.delete('/api/cotacoes/:id', async (req, res) => {
  try {
    console.log(`🗑️ ${req.user.name} deletando cotação:`, req.params.id);
    const { error } = await supabase
      .from('cotacoes')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir cotação', details: error.message });
  }
});

// ==========================================
// ROTA 404
// ==========================================
app.use((req, res) => {
  console.log('❌ Rota não encontrada:', req.path);
  res.status(404).json({ error: '404 - Rota não encontrada', path: req.path });
});

// ==========================================
// TRATAMENTO DE ERROS
// ==========================================
app.use((error, req, res, next) => {
  console.error('💥 Erro no servidor:', error);
  res.status(500).json({ error: 'Erro interno do servidor', message: error.message });
});

// ==========================================
// INICIAR SERVIDOR
// ==========================================
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n🚀 ================================');
  console.log(`🚀 Servidor COTAÇÕES rodando na porta ${PORT}`);
  console.log(`📊 Database: Supabase`);
  console.log(`🔐 Autenticação: JWT ativada`);
  console.log(`🔗 Supabase URL: ${supabaseUrl}`);
  console.log(`📁 Public folder: ${publicPath}`);
  console.log(`🌐 Interface: http://localhost:${PORT}`);
  console.log(`🔧 API: http://localhost:${PORT}/api/cotacoes`);
  console.log('🚀 ================================\n');
});
