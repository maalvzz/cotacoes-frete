// middleware/auth.js
const jwt = require('jsonwebtoken');

// Mesma SECRET_KEY usada no sistema central
const SECRET_KEY = process.env.JWT_SECRET || process.env.API_TOKEN;

if (!SECRET_KEY) {
    console.error('⚠️ AVISO: JWT_SECRET ou API_TOKEN não definido!');
}

function verificarAutenticacao(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
        console.error('❌ Tentativa de acesso sem token');
        return res.status(401).json({ 
            error: 'Token não fornecido',
            message: 'Cabeçalho Authorization ausente' 
        });
    }

    // Extrair token do formato "Bearer TOKEN"
    const token = authHeader.startsWith('Bearer ') 
        ? authHeader.slice(7) 
        : authHeader;

    if (!token) {
        console.error('❌ Token vazio');
        return res.status(401).json({ 
            error: 'Token não fornecido',
            message: 'Token vazio' 
        });
    }

    try {
        // Primeiro tenta validar como JWT
        const decoded = jwt.verify(token, SECRET_KEY);
        
        // Adiciona informações do usuário à requisição
        req.user = {
            username: decoded.username,
            name: decoded.name,
            isAdmin: decoded.isAdmin || false
        };
        
        console.log(`✅ Autenticação JWT bem-sucedida: ${decoded.name} (${decoded.username})`);
        next();
        
    } catch (jwtError) {
        // Se falhar como JWT, tenta validar como token fixo (fallback)
        if (process.env.API_TOKEN && token === process.env.API_TOKEN) {
            console.log('✅ Autenticação via API_TOKEN fixo (fallback)');
            req.user = { 
                username: 'api', 
                name: 'API User', 
                isAdmin: true 
            };
            next();
        } else {
            console.error('❌ Token inválido:', jwtError.message);
            return res.status(403).json({ 
                error: 'Token inválido ou expirado',
                message: 'Faça login novamente no sistema central',
                details: jwtError.message 
            });
        }
    }
}

module.exports = { verificarAutenticacao };
