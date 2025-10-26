require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

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
// ROTAS PÚBLICAS
// ==========================================

// Rota raiz - Documentação da API
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
        // Testa conexão com Supabase
        const { error } = await supabase.from('cotacoes').select('count', { count: 'exact', head: true });
        
        res.json({ 
            status: error ? 'unhealthy' : 'healthy',
            database: error ? 'disconnected' : 'connected',
            supabase_url: supabaseUrl,
            timestamp: new Date().toISOString()
        });
        
        if (error) {
            console.error('❌ Erro no health check Supabase:', error);
        }
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

// HEAD - Verificar status
app.head('/api/cotacoes', (req, res) => {
    res.status(200).end();
});

// ==========================================
// ROTAS DE COTAÇÕES
// ==========================================

// GET - Listar todas as cotações
app.get('/api/cotacoes', async (req, res) => {
    try {
        console.log('📋 Buscando todas as cotações...');
        
        const { data, error } = await supabase
            .from('cotacoes')
            .select('*')
            .order('timestamp', { ascending: false });

        if (error) {
            console.error('❌ Erro ao buscar cotações:', error);
            throw error;
        }

        console.log(`✅ ${data?.length || 0} cotações encontradas`);
        res.json(data || []);
    } catch (error) {
        console.error('❌ Erro ao buscar cotações:', error);
        res.status(500).json({ 
            error: 'Erro ao buscar cotações',
            details: error.message 
        });
    }
});

// GET - Buscar cotação específica
app.get('/api/cotacoes/:id', async (req, res) => {
    try {
        console.log(`🔍 Buscando cotação ID: ${req.params.id}`);
        
        const { data, error } = await supabase
            .from('cotacoes')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                console.log('⚠️ Cotação não encontrada');
                return res.status(404).json({ error: 'Cotação não encontrada' });
            }
            console.error('❌ Erro ao buscar cotação:', error);
            throw error;
        }

        console.log('✅ Cotação encontrada');
        res.json(data);
    } catch (error) {
        console.error('❌ Erro ao buscar cotação:', error);
        res.status(500).json({ 
            error: 'Erro ao buscar cotação',
            details: error.message 
        });
    }
});

// POST - Criar nova cotação
app.post('/api/cotacoes', async (req, res) => {
    try {
        console.log('📝 Criando nova cotação...');
        console.log('Dados recebidos:', req.body);
        
        const novaCotacao = {
            ...req.body,
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            negocioFechado: req.body.negocioFechado || false
        };

        console.log('Dados a serem inseridos:', novaCotacao);

        const { data, error } = await supabase
            .from('cotacoes')
            .insert([novaCotacao])
            .select()
            .single();

        if (error) {
            console.error('❌ Erro ao inserir:', error);
            throw error;
        }

        console.log('✅ Cotação criada com sucesso:', data);
        res.status(201).json(data);
    } catch (error) {
        console.error('❌ Erro ao criar cotação:', error);
        res.status(500).json({ 
            error: 'Erro ao criar cotação',
            details: error.message 
        });
    }
});

// PUT - Atualizar cotação
app.put('/api/cotacoes/:id', async (req, res) => {
    try {
        console.log(`✏️ Atualizando cotação ID: ${req.params.id}`);
        console.log('Dados recebidos:', req.body);
        
        const { data, error } = await supabase
            .from('cotacoes')
            .update({
                ...req.body,
                updatedAt: new Date().toISOString()
            })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                console.log('⚠️ Cotação não encontrada para atualizar');
                return res.status(404).json({ error: 'Cotação não encontrada' });
            }
            console.error('❌ Erro ao atualizar:', error);
            throw error;
        }

        console.log('✅ Cotação atualizada com sucesso');
        res.json(data);
    } catch (error) {
        console.error('❌ Erro ao atualizar cotação:', error);
        res.status(500).json({ 
            error: 'Erro ao atualizar cotação',
            details: error.message 
        });
    }
});

// DELETE - Excluir cotação
app.delete('/api/cotacoes/:id', async (req, res) => {
    try {
        console.log(`🗑️ Deletando cotação ID: ${req.params.id}`);
        
        const { error } = await supabase
            .from('cotacoes')
            .delete()
            .eq('id', req.params.id);

        if (error) {
            console.error('❌ Erro ao deletar:', error);
            throw error;
        }

        console.log('✅ Cotação deletada com sucesso');
        res.status(204).end();
    } catch (error) {
        console.error('❌ Erro ao excluir cotação:', error);
        res.status(500).json({ 
            error: 'Erro ao excluir cotação',
            details: error.message 
        });
    }
});

// ==========================================
// TRATAMENTO DE ROTAS NÃO ENCONTRADAS
// ==========================================
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Rota não encontrada',
        message: `A rota ${req.method} ${req.path} não existe`
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
    console.log('🚀 =================================');
});
