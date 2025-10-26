require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();

// ==========================================
// CONFIGURAÇÃO DO SUPABASE
// ==========================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ ERRO: SUPABASE_URL ou SUPABASE_KEY não configurados no .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ Supabase configurado:', supabaseUrl);

// ==========================================
// MIDDLEWARES
// ==========================================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Log de todas as requisições
app.use((req, res, next) => {
    console.log(`📥 ${req.method} ${req.path}`);
    next();
});

// ==========================================
// ROTAS PÚBLICAS (API)
// ==========================================

// Rota raiz (documentação básica da API)
app.get('/', (req, res) => {
    res.json({
        message: '🚀 API de Cotações de Frete',
        version: '2.0.0',
        status: 'online',
        database: 'Supabase',
        cache: 'Desativado',
        authentication: 'Desativada',
        endpoints: {
            health: 'GET /health',
            interface: 'GET /app',
            cotacoes: {
                listar: 'GET /api/cotacoes',
                criar: 'POST /api/cotacoes',
                buscar: 'GET /api/cotacoes/:id',
                atualizar: 'PUT /api/cotacoes/:id',
                deletar: 'DELETE /api/cotacoes/:id'
            }
        },
        timestamp: new Date().toISOString()
    });
});

// Health check
app.get('/health', async (req, res) => {
    try {
        const { error } = await supabase.from('cotacoes').select('count', { count: 'exact', head: true });
        res.json({
            status: error ? 'unhealthy' : 'healthy',
            database: error ? 'disconnected' : 'connected',
            supabase_url: supabaseUrl,
            timestamp: new Date().toISOString()
        });
        if (error) console.error('❌ Erro no health check Supabase:', error);
    } catch (error) {
        console.error('❌ Erro no health check:', error);
        res.json({
            status: 'unhealthy',
            database: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// HEAD
app.head('/api/cotacoes', (req, res) => res.status(200).end());

// ==========================================
// ROTAS DE COTAÇÕES
// ==========================================
app.get('/api/cotacoes', async (req, res) => {
    try {
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
        const novaCotacao = {
            ...req.body,
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            negocioFechado: req.body.negocioFechado || false
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
        const { data, error } = await supabase
            .from('cotacoes')
            .update({
                ...req.body,
                updatedAt: new Date().toISOString()
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
        const { error } = await supabase.from('cotacoes').delete().eq('id', req.params.id);
        if (error) throw error;
        res.status(204).end();
    } catch (error) {
        res.status(500).json({ error: 'Erro ao excluir cotação', details: error.message });
    }
});

// ==========================================
// FRONTEND - SERVIR INTERFACE
// ==========================================
// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Rota raiz agora serve a interface (em vez de JSON)
app.get('/', (req, res) => {
    // Se for requisição de navegador, serve HTML
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        // Se for API, retorna JSON
        res.json({
            message: '🚀 API de Cotações de Frete',
            version: '2.0.0',
            status: 'online',
            database: 'Supabase',
            endpoints: {
                interface: 'GET / (navegador)',
                health: 'GET /health',
                cotacoes: {
                    listar: 'GET /api/cotacoes',
                    criar: 'POST /api/cotacoes',
                    buscar: 'GET /api/cotacoes/:id',
                    atualizar: 'PUT /api/cotacoes/:id',
                    deletar: 'DELETE /api/cotacoes/:id'
                }
            },
            timestamp: new Date().toISOString()
        });
    }
});

// ==========================================
// TRATAMENTO DE ROTAS NÃO ENCONTRADAS
// ==========================================
app.use((req, res) => {
    res.status(404).json({
        error: 'Rota não encontrada',
        message: `A rota ${req.method} ${req.path} não existe`,
        hint: 'Acesse /app para ver a interface do usuário'
    });
});

// ==========================================
// INICIAR SERVIDOR
// ==========================================
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 =================================');
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📊 Banco de dados: Supabase`);
    console.log(`🔗 URL: ${supabaseUrl}`);
    console.log(`🔓 Autenticação: DESATIVADA`);
    console.log(`🌐 Interface: https://cotacoes-frete.onrender.com/app`);
    console.log('🚀 =================================');
});
