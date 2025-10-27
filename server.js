require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken'); // ← NOVO
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();

// ==========================================
// CONFIGURAÇÃO
// ==========================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const JWT_SECRET = process.env.JWT_SECRET; // ← NOVO
const LOGIN_URL = process.env.LOGIN_URL || 'http://localhost:3000'; // ← NOVO

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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Username', 'X-User-Name', 'X-User-IsAdmin']
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
    // 1. Pega o token da query string ou header
    const tokenQuery = req.query.token;
    const authHeader = req.headers.authorization;
    const tokenHeader = authHeader?.startsWith('Bearer ') 
        ? authHeader.slice(7) 
        : authHeader;
    
    // 2. Tenta pegar do header enviado pelo proxy
    const proxyUsername = req.headers['x-user-username'];
    
    const token = tokenQuery || tokenHeader;

    // 3. Se tem o header do proxy, confia (conexão veio do proxy)
    if (proxyUsername) {
        req.user = {
            username: req.headers['x-user-username'],
            name: req.headers['x-user-name'],
            isAdmin: req.headers['x-user-isadmin'] === 'true'
        };
        console.log(`✅ Acesso via proxy: ${req.user.name}`);
        return next();
    }

    // 4. Se não tem token, bloqueia
    if (!token) {
        console.log('❌ Acesso negado: sem token');
        return res.status(401).send(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Acesso Negado - Cotações</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        display: flex; justify-content: center; align-items: center;
                        min-height: 100vh;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        padding: 20px;
                    }
                    .container {
                        background: white; padding: 3rem; border-radius: 20px;
                        text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                        max-width: 500px; width: 100%; animation: slideUp 0.5s ease;
                    }
                    @keyframes slideUp {
                        from { opacity: 0; transform: translateY(30px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    .icon { font-size: 4rem; margin-bottom: 1rem; }
                    h1 { color: #e74c3c; margin-bottom: 1rem; font-size: 1.8rem; }
                    p { color: #666; margin-bottom: 2rem; line-height: 1.6; }
                    button {
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white; border: none; padding: 1rem 2.5rem;
                        border-radius: 10px; font-size: 1rem; font-weight: 600;
                        cursor: pointer; transition: all 0.3s;
                        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
                    }
                    button:hover { 
                        transform: translateY(-2px); 
                        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="icon">🔒</div>
                    <h1>Acesso Não Autorizado</h1>
                    <p>Esta aplicação requer autenticação.<br>Por favor, acesse através do sistema central.</p>
                    <button onclick="window.location.href='${LOGIN_URL}'">
                        Ir para Sistema de Login
                    </button>
                </div>
            </body>
            </html>
        `);
    }

    // 5. Valida o token JWT
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        
        // Remove token da query string para não aparecer na URL
        delete req.query.token;
        
        console.log(`✅ Acesso direto autenticado: ${decoded.name}`);
        next();
        
    } catch (error) {
        console.log('❌ Token inválido:', error.message);
        return res.status(403).send(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Sessão Expirada - Cotações</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        display: flex; justify-content: center; align-items: center;
                        min-height: 100vh;
                        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                        padding: 20px;
                    }
                    .container {
                        background: white; padding: 3rem; border-radius: 20px;
                        text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                        max-width: 500px; width: 100%; animation: slideUp 0.5s ease;
                    }
                    @keyframes slideUp {
                        from { opacity: 0; transform: translateY(30px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    .icon { font-size: 4rem; margin-bottom: 1rem; }
                    h1 { color: #e74c3c; margin-bottom: 1rem; font-size: 1.8rem; }
                    p { color: #666; margin-bottom: 2rem; line-height: 1.6; }
                    button {
                        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                        color: white; border: none; padding: 1rem 2.5rem;
                        border-radius: 10px; font-size: 1rem; font-weight: 600;
                        cursor: pointer; transition: all 0.3s;
                        box-shadow: 0 4px 15px rgba(245, 87, 108, 0.4);
                    }
                    button:hover { 
                        transform: translateY(-2px); 
                        box-shadow: 0 6px 20px rgba(245, 87, 108, 0.6);
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="icon">⚠️</div>
                    <h1>Sessão Expirada</h1>
                    <p>Seu token de acesso expirou ou é inválido.<br>Faça login novamente no sistema central.</p>
                    <button onclick="window.location.href='${LOGIN_URL}'">
                        Fazer Login Novamente
                    </button>
                </div>
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
        res.json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ==========================================
// APLICAR AUTENTICAÇÃO EM TODAS AS ROTAS
// ==========================================
app.use(verificarAutenticacao); // ← CRUCIAL: Protege tudo abaixo

// ==========================================
// SERVIR ARQUIVOS ESTÁTICOS (PROTEGIDO)
// ==========================================
const publicPath = path.join(__dirname, 'public');
console.log('📁 Pasta public:', publicPath);

app.use(express.static(publicPath, {
    index: 'index.html',
    dotfiles: 'deny',
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html');
        } else if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// ==========================================
// ROTAS DA API (PROTEGIDAS)
// ==========================================

// Listar todas as cotações
app.get('/api/cotacoes', async (req, res) => {
    try {
        console.log(`🔍 ${req.user.name} buscando cotações...`);
        const { data, error } = await supabase
            .from('cotacoes')
            .select('*')
            .order('timestamp', { ascending: false });

        if (error) {
            console.error('❌ Erro ao buscar:', error);
            throw error;
        }
        
        console.log(`✅ ${data.length} cotações encontradas`);
        res.json(data || []);
    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({ 
            error: 'Erro ao buscar cotações', 
            details: error.message 
        });
    }
});

// Buscar cotação específica
app.get('/api/cotacoes/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('cotacoes')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) {
            return res.status(404).json({ error: 'Cotação não encontrada' });
        }
        
        res.json(data);
    } catch (error) {
        res.status(500).json({ 
            error: 'Erro ao buscar cotação', 
            details: error.message 
        });
    }
});

// Criar nova cotação
app.post('/api/cotacoes', async (req, res) => {
    try {
        console.log(`📝 ${req.user.name} criando cotação:`, req.body);
        
        const novaCotacao = {
            ...req.body,
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            negocioFechado: req.body.negocioFechado || false,
            createdBy: req.user.name // ← Registra quem criou
        };

        const { data, error } = await supabase
            .from('cotacoes')
            .insert([novaCotacao])
            .select()
            .single();

        if (error) {
            console.error('❌ Erro ao criar:', error);
            throw error;
        }
        
        console.log('✅ Cotação criada:', data.id);
        res.status(201).json(data);
    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({ 
            error: 'Erro ao criar cotação', 
            details: error.message 
        });
    }
});

// Atualizar cotação
app.put('/api/cotacoes/:id', async (req, res) => {
    try {
        console.log(`✏️ ${req.user.name} atualizando cotação:`, req.params.id);
        
        const { data, error } = await supabase
            .from('cotacoes')
            .update({
                ...req.body,
                updatedAt: new Date().toISOString(),
                updatedBy: req.user.name // ← Registra quem atualizou
            })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) {
            return res.status(404).json({ error: 'Cotação não encontrada' });
        }
        
        console.log('✅ Cotação atualizada');
        res.json(data);
    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({ 
            error: 'Erro ao atualizar cotação', 
            details: error.message 
        });
    }
});

// Deletar cotação
app.delete('/api/cotacoes/:id', async (req, res) => {
    try {
        console.log(`🗑️ ${req.user.name} deletando cotação:`, req.params.id);
        
        const { error } = await supabase
            .from('cotacoes')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        
        console.log('✅ Cotação deletada');
        res.status(204).end();
    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({ 
            error: 'Erro ao excluir cotação', 
            details: error.message 
        });
    }
});

// Rota alternativa /app
app.get('/app', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// ==========================================
// ROTA 404
// ==========================================
app.use((req, res) => {
    console.log('❌ Rota não encontrada:', req.path);
    res.status(404).json({
        error: '404 - Rota não encontrada',
        path: req.path,
        user: req.user?.name
    });
});

// ==========================================
// TRATAMENTO DE ERROS
// ==========================================
app.use((error, req, res, next) => {
    console.error('💥 Erro no servidor:', error);
    res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
    });
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

// Verificar se pasta public existe
const fs = require('fs');
if (!fs.existsSync(publicPath)) {
    console.error('⚠️ AVISO: Pasta public/ não encontrada!');
}
