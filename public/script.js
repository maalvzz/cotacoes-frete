// ==========================================
// ======== CONFIGURAÇÃO ====================
// ==========================================
const PORTAL_URL = 'https://ir-comercio-portal-zcan.onrender.com';
const API_URL = 'https://cotacoes-frete-aikc.onrender.com/api/cotacoes';

const STORAGE_KEY = 'cotacoes_frete';
const POLLING_INTERVAL = 10000;

let cotacoes = [];
let isOnline = false;
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let isSubmitting = false;
let lastSyncTime = null;
let sessionToken = null;
let sessionCheckInterval = null;

const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

document.addEventListener('DOMContentLoaded', () => {
    verificarAutenticacao();
});

// ==========================================
// ======== VERIFICAR AUTENTICAÇÃO ==========
// ==========================================
function verificarAutenticacao() {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('sessionToken');

    if (tokenFromUrl) {
        sessionToken = tokenFromUrl;
        sessionStorage.setItem('cotacoesFreteSession', sessionToken);
        window.history.replaceState({}, document.title, window.location.pathname);
    } else {
        sessionToken = sessionStorage.getItem('cotacoesFreteSession');
    }

    if (!sessionToken) {
        mostrarTelaAcessoNegado();
        return;
    }

    verificarSessaoValida();
}

async function verificarSessaoValida() {
    try {
        const response = await fetch(`${PORTAL_URL}/api/verify-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken })
        });

        const data = await response.json();

        if (!data.valid) {
            sessionStorage.removeItem('cotacoesFreteSession');
            mostrarTelaAcessoNegado(data.message);
            return;
        }

        iniciarAplicacao();
    } catch (error) {
        console.error('Erro ao verificar sessão:', error);
        mostrarTelaAcessoNegado('Erro ao verificar autenticação');
    }
}

function iniciarAplicacao() {
    setTodayDate();
    loadCotacoes();
    updateMonthDisplay();
    startRealtimeSync();
    startSessionCheck();
}

// ==========================================
// ======== VERIFICAÇÃO PERIÓDICA DE SESSÃO =
// ==========================================
function startSessionCheck() {
    if (sessionCheckInterval) {
        clearInterval(sessionCheckInterval);
    }

    sessionCheckInterval = setInterval(async () => {
        try {
            const response = await fetch(`${PORTAL_URL}/api/verify-session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionToken })
            });

            const data = await response.json();

            if (!data.valid) {
                clearInterval(sessionCheckInterval);
                sessionStorage.removeItem('cotacoesFreteSession');
                mostrarTelaAcessoNegado('Sua sessão expirou');
            }
        } catch (error) {
            console.error('Erro ao verificar sessão:', error);
        }
    }, 30000);
}

// ==========================================
// ======== TELA DE ACESSO NEGADO ===========
// ==========================================
function mostrarTelaAcessoNegado(mensagem = 'Este acesso é restrito a usuários autenticados pelo Portal.') {
    document.body.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background: linear-gradient(135deg, #F5F5F5 0%, #FFFFFF 100%); font-family: 'Inter', sans-serif;">
            <div style="text-align: center; padding: 3rem; background: white; border-radius: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.08); max-width: 500px;">
                <h1 style="font-size: 1.8rem; color: #1E1E1E; margin-bottom: 1rem;">NÃO AUTORIZADO</h1>
                <p style="color: #666; margin-bottom: 2rem; line-height: 1.6;">${mensagem}</p>
                <button onclick="voltarParaLogin()" style="padding: 1rem 2rem; background: linear-gradient(135deg, #ff5100 0%, #E67E00 100%); color: white; border: none; border-radius: 12px; font-size: 1rem; font-weight: 600; cursor: pointer; box-shadow: 0 8px 24px rgba(255, 140, 0, 0.4);">
                    Ir para o Login
                </button>
            </div>
        </div>
    `;
}

function voltarParaLogin() {
    window.location.href = PORTAL_URL;
}

// ==========================================
// ======== FUNÇÕES DA APLICAÇÃO ============
// ==========================================

function updateMonthDisplay() {
    document.getElementById('currentMonth').textContent = `${meses[currentMonth]} ${currentYear}`;
}

function changeMonth(direction) {
    currentMonth += direction;
    if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
    } else if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
    }
    updateMonthDisplay();
    filterCotacoes();
}

function startRealtimeSync() {
    setInterval(async () => {
        if (isOnline && !isSubmitting) {
            await checkForUpdates();
        }
    }, POLLING_INTERVAL);
}

async function checkForUpdates() {
    try {
        const response = await fetch(API_URL, {
            method: 'GET',
            cache: 'no-cache',
            headers: { 
                'Content-Type': 'application/json',
                'X-Session-Token': sessionToken
            }
        });

        if (response.status === 401) {
            sessionStorage.removeItem('cotacoesFreteSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }
        
        if (!response.ok) return;

        const serverData = await response.json();
        
        if (hasDataChanged(serverData)) {
            cotacoes = serverData;
            saveToLocalStorage(cotacoes);
            filterCotacoes();
            showRealtimeUpdate();
            lastSyncTime = new Date();
        }
    } catch (error) {
        console.error('Erro ao verificar atualizações:', error);
    }
}

function hasDataChanged(newData) {
    if (cotacoes.length !== newData.length) return true;

    const currentIds = new Set(cotacoes.map(c => String(c.id)));
    const newIds = new Set(newData.map(c => String(c.id)));

    if (currentIds.size !== newIds.size) return true;

    for (let id of newIds) if (!currentIds.has(id)) return true;

    for (let newItem of newData) {
        const oldItem = cotacoes.find(c => String(c.id) === String(newItem.id));
        if (oldItem && JSON.stringify(oldItem) !== JSON.stringify(newItem)) return true;
    }

    return false;
}

function showRealtimeUpdate() {
    const notification = document.createElement('div');
    notification.className = 'realtime-notification';
    notification.innerHTML = '✓ Dados atualizados';
    document.body.appendChild(notification);

    setTimeout(() => notification.classList.add('show'), 100);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

async function checkServerStatus() {
    try {
        const response = await fetch('https://cotacoes-frete-aikc.onrender.com/health', { 
            method: 'GET',
            cache: 'no-cache'
        });
        isOnline = response.ok;
        console.log('Status do servidor:', isOnline ? 'ONLINE' : 'OFFLINE');
        updateConnectionStatus();
        return isOnline;
    } catch (error) {
        console.error('Erro ao verificar status:', error);
        isOnline = false;
        updateConnectionStatus();
        return false;
    }
}

function updateConnectionStatus() {
    const statusDiv = document.getElementById('connectionStatus');
    if (!statusDiv) return;

    if (isOnline) {
        statusDiv.className = 'connection-status online';
        statusDiv.querySelector('span:last-child').textContent = 'Online';
    } else {
        statusDiv.className = 'connection-status offline';
        statusDiv.querySelector('span:last-child').textContent = 'Offline';
    }
}

function saveToLocalStorage(data) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        return true;
    } catch (error) {
        console.error('Erro ao salvar:', error);
        return false;
    }
}

function loadFromLocalStorage() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (error) {
        console.error('Erro ao carregar:', error);
        return [];
    }
}

function setTodayDate() {
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('dataCotacao');
    if (dateInput) {
        dateInput.value = today;
    }
}

async function loadCotacoes() {
    console.log('🔄 Carregando cotações...');
    const serverOnline = await checkServerStatus();
    console.log('📡 Servidor online:', serverOnline);
    
    try {
        if (serverOnline) {
            console.log('🌐 Fazendo requisição para:', API_URL);
            const response = await fetch(API_URL, {
                headers: {
                    'X-Session-Token': sessionToken
                }
            });
            console.log('📊 Response status:', response.status);

            if (response.status === 401) {
                sessionStorage.removeItem('cotacoesFreteSession');
                mostrarTelaAcessoNegado('Sua sessão expirou');
                return;
            }

            if (!response.ok) throw new Error('Erro ao carregar cotações');
            
            cotacoes = await response.json();
            console.log('✅ Cotações carregadas:', cotacoes.length, 'registros');
            console.log('📋 IDs das cotações:', cotacoes.map(c => ({ id: c.id, tipo: typeof c.id })));
            saveToLocalStorage(cotacoes);
            lastSyncTime = new Date();
        } else {
            console.log('⚠️ Carregando do localStorage...');
            cotacoes = loadFromLocalStorage();
            console.log('📦 Cotações do cache:', cotacoes.length, 'registros');
        }
        filterCotacoes();
    } catch (error) {
        console.error('❌ Erro:', error);
        cotacoes = loadFromLocalStorage();
        filterCotacoes();
        showMessage('Modo offline ativo', 'info');
    }
}

async function handleSubmit(event) {
    event.preventDefault();

    if (isSubmitting) return;

    isSubmitting = true;
    const submitBtn = document.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span id="submitIcon"></span> <span id="submitText">Salvando...</span>';

    const formData = getFormData();
    const editId = document.getElementById('editId').value;

    try {
        let tempId = null;
        let novaCotacao = null;
        
        if (editId) {
            // CORREÇÃO: Normalizar ID para comparação
            const index = cotacoes.findIndex(c => String(c.id) === String(editId));
            if (index !== -1) {
                cotacoes[index] = { ...formData, id: editId, timestamp: cotacoes[index].timestamp };
            }
        } else {
            tempId = 'temp_' + Date.now();
            novaCotacao = { ...formData, id: tempId, timestamp: new Date().toISOString() };
            cotacoes.unshift(novaCotacao);
        }
        
        saveToLocalStorage(cotacoes);
        filterCotacoes();
        showMessage(editId ? 'Cotação atualizada!' : 'Cotação registrada!', 'success');
        resetForm();
        
        const serverOnline = await checkServerStatus();
        if (serverOnline) {
            try {
                let response;
                if (editId) {
                    response = await fetch(`${API_URL}/${editId}`, {
                        method: 'PUT',
                        headers: { 
                            'Content-Type': 'application/json',
                            'X-Session-Token': sessionToken
                        },
                        body: JSON.stringify(formData)
                    });
                } else {
                    response = await fetch(API_URL, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'X-Session-Token': sessionToken
                        },
                        body: JSON.stringify(formData)
                    });
                }

                if (response.status === 401) {
                    sessionStorage.removeItem('cotacoesFreteSession');
                    mostrarTelaAcessoNegado('Sua sessão expirou');
                    return;
                }

                if (response.ok) {
                    const savedData = await response.json();
                    
                    if (tempId) {
                        const index = cotacoes.findIndex(c => String(c.id) === String(tempId));
                        if (index !== -1) {
                            cotacoes[index] = savedData;
                            saveToLocalStorage(cotacoes);
                            filterCotacoes();
                        }
                    }
                }
            } catch (error) {
                console.error('Erro ao sincronizar:', error);
                showMessage('Salvo localmente', 'info');
            }
        }
    } catch (error) {
        console.error('Erro:', error);
        showMessage('Erro ao processar cotação', 'error');
    } finally {
        isSubmitting = false;
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span id="submitIcon">✓</span> <span id="submitText">Registrar Cotação</span>';
    }
}

// ==========================================
// ======== EXPOR FUNÇÕES GLOBALMENTE =======
// ==========================================

window.editCotacao = function(id) {
    console.log('🔧 editCotacao chamada com ID:', id, 'Tipo:', typeof id);
    
    try {
        // CORREÇÃO PRINCIPAL: Normalizar ID para string na comparação
        const cotacao = cotacoes.find(c => String(c.id) === String(id));
        
        if (!cotacao) {
            console.error('❌ Cotação não encontrada com ID:', id);
            console.log('📋 IDs disponíveis:', cotacoes.map(c => ({ id: c.id, tipo: typeof c.id })));
            showMessage('Cotação não encontrada', 'error');
            return;
        }

        console.log('✅ Cotação encontrada:', cotacao);

        // Verificar se os elementos existem antes de tentar preenchê-los
        const elementos = {
            editId: document.getElementById('editId'),
            responsavelCotacao: document.getElementById('responsavelCotacao'),
            transportadora: document.getElementById('transportadora'),
            destino: document.getElementById('destino'),
            numeroCotacao: document.getElementById('numeroCotacao'),
            valorFrete: document.getElementById('valorFrete'),
            vendedor: document.getElementById('vendedor'),
            numeroDocumento: document.getElementById('numeroDocumento'),
            previsaoEntrega: document.getElementById('previsaoEntrega'),
            canalComunicacao: document.getElementById('canalComunicacao'),
            codigoColeta: document.getElementById('codigoColeta'),
            responsavelTransportadora: document.getElementById('responsavelTransportadora'),
            dataCotacao: document.getElementById('dataCotacao'),
            observacoes: document.getElementById('observacoes'),
            formTitle: document.getElementById('formTitle'),
            submitText: document.getElementById('submitText'),
            cancelBtn: document.getElementById('cancelBtn'),
            formCard: document.getElementById('formCard')
        };

        // Verificar elementos faltantes
        const elementosFaltantes = Object.keys(elementos).filter(key => !elementos[key]);
        if (elementosFaltantes.length > 0) {
            console.error('❌ Elementos não encontrados:', elementosFaltantes);
            showMessage('Erro: Formulário não carregado corretamente', 'error');
            return;
        }

        // Preencher o formulário - SEMPRE converter ID para string
        elementos.editId.value = String(id);
        elementos.responsavelCotacao.value = cotacao.responsavelCotacao;
        elementos.transportadora.value = cotacao.transportadora;
        elementos.destino.value = cotacao.destino || '';
        elementos.numeroCotacao.value = cotacao.numeroCotacao || '';
        elementos.valorFrete.value = cotacao.valorFrete;
        elementos.vendedor.value = cotacao.vendedor || '';
        elementos.numeroDocumento.value = cotacao.numeroDocumento || '';
        elementos.previsaoEntrega.value = cotacao.previsaoEntrega || '';
        elementos.canalComunicacao.value = cotacao.canalComunicacao || '';
        elementos.codigoColeta.value = cotacao.codigoColeta || '';
        elementos.responsavelTransportadora.value = cotacao.responsavelTransportadora || '';
        elementos.dataCotacao.value = cotacao.dataCotacao;
        elementos.observacoes.value = cotacao.observacoes || '';

        // Atualizar interface
        elementos.formTitle.textContent = 'Editar Cotação';
        elementos.submitText.textContent = 'Atualizar Cotação';
        elementos.cancelBtn.classList.remove('hidden');
        elementos.formCard.classList.remove('hidden');
        
        // Scroll para o topo
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        console.log('✅ Formulário preenchido e exibido com sucesso');
    } catch (error) {
        console.error('❌ Erro na função editCotacao:', error);
        showMessage('Erro ao carregar cotação para edição', 'error');
    }
};

window.deleteCotacao = async function(id) {
    console.log('🗑️ deleteCotacao chamada com ID:', id, 'Tipo:', typeof id);
    
    if (!confirm('Tem certeza que deseja excluir esta cotação?')) {
        console.log('❌ Exclusão cancelada pelo usuário');
        return;
    }
    
    // CORREÇÃO: Normalizar ID para comparação
    const cotacaoBackup = cotacoes.find(c => String(c.id) === String(id));
    cotacoes = cotacoes.filter(c => String(c.id) !== String(id));
    saveToLocalStorage(cotacoes);
    filterCotacoes();
    showMessage('Cotação excluída!', 'success');
    console.log('✅ Cotação excluída localmente');

    const serverOnline = await checkServerStatus();
    if (serverOnline) {
        try {
            console.log('🌐 Tentando excluir no servidor...');
            const response = await fetch(`${API_URL}/${id}`, { 
                method: 'DELETE',
                headers: {
                    'X-Session-Token': sessionToken
                }
            });

            if (response.status === 401) {
                sessionStorage.removeItem('cotacoesFreteSession');
                mostrarTelaAcessoNegado('Sua sessão expirou');
                return;
            }

            if (!response.ok) throw new Error('Erro ao excluir');
            console.log('✅ Cotação excluída no servidor');
        } catch (error) {
            console.error('❌ Erro ao excluir no servidor:', error);
            if (cotacaoBackup) {
                cotacoes.push(cotacaoBackup);
                cotacoes.sort((a, b) => new Date(b.timestamp || b.dataCotacao) - new Date(a.timestamp || a.dataCotacao));
                saveToLocalStorage(cotacoes);
                filterCotacoes();
                showMessage('Erro ao excluir. Registro restaurado.', 'error');
                console.log('⚠️ Cotação restaurada após erro');
            }
        }
    }
};

window.toggleNegocio = async function(id) {
    console.log('🔄 toggleNegocio chamada com ID:', id, 'Tipo:', typeof id);
    
    // CORREÇÃO: Normalizar ID para comparação
    const cotacao = cotacoes.find(c => String(c.id) === String(id));
    if (!cotacao) {
        console.error('❌ Cotação não encontrada');
        return;
    }
    
    const estadoAnterior = cotacao.negocioFechado;
    cotacao.negocioFechado = !cotacao.negocioFechado;
    saveToLocalStorage(cotacoes);
    filterCotacoes();
    showMessage(cotacao.negocioFechado ? 'Negócio fechado!' : 'Marcação removida!', 'success');
    console.log('✅ Status alterado localmente');

    const serverOnline = await checkServerStatus();
    if (serverOnline) {
        try {
            console.log('🌐 Sincronizando status com servidor...');
            const response = await fetch(`${API_URL}/${id}`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Session-Token': sessionToken
                },
                body: JSON.stringify(cotacao)
            });

            if (response.status === 401) {
                sessionStorage.removeItem('cotacoesFreteSession');
                mostrarTelaAcessoNegado('Sua sessão expirou');
                return;
            }

            if (!response.ok) throw new Error('Erro');
            console.log('✅ Status sincronizado com servidor');
        } catch (error) {
            console.error('❌ Erro ao sincronizar:', error);
            cotacao.negocioFechado = estadoAnterior;
            saveToLocalStorage(cotacoes);
            filterCotacoes();
            showMessage('Erro ao atualizar. Status revertido.', 'error');
            console.log('⚠️ Status revertido após erro');
        }
    }
};

function getFormData() {
    return {
        responsavelCotacao: document.getElementById('responsavelCotacao').value,
        transportadora: document.getElementById('transportadora').value,
        destino: document.getElementById('destino').value,
        numeroCotacao: document.getElementById('numeroCotacao').value || 'Não Informado',
        valorFrete: parseFloat(document.getElementById('valorFrete').value),
        vendedor: document.getElementById('vendedor').value || 'Não Informado',
        numeroDocumento: document.getElementById('numeroDocumento').value || 'Não Informado',
        previsaoEntrega: document.getElementById('previsaoEntrega').value || 'Não Informado',
        canalComunicacao: document.getElementById('canalComunicacao').value || 'Não Informado',
        codigoColeta: document.getElementById('codigoColeta').value || 'Não Informado',
        responsavelTransportadora: document.getElementById('responsavelTransportadora').value || 'Não Informado',
        dataCotacao: document.getElementById('dataCotacao').value,
        observacoes: document.getElementById('observacoes').value || '',
        negocioFechado: false
    };
}

function resetForm() {
    document.getElementById('cotacaoForm').reset();
    document.getElementById('editId').value = '';
    document.getElementById('formTitle').textContent = 'Nova Cotação';
    document.getElementById('submitIcon').textContent = '✓';
    document.getElementById('submitText').textContent = 'Registrar Cotação';
    document.getElementById('cancelBtn').classList.add('hidden');
    setTodayDate();
}

function cancelEdit() { 
    resetForm(); 
}

function toggleForm() {
    const formCard = document.getElementById('formCard');
    const button = event.currentTarget;
    formCard.classList.toggle('hidden');
    button.textContent = formCard.classList.contains('hidden') ? 'Nova Cotação' : 'Ocultar Formulário';
    if (!formCard.classList.contains('hidden')) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function filterCotacoes() {
    const searchTerm = document.getElementById('search').value.toLowerCase();
    const filterResp = document.getElementById('filterResponsavel').value;
    const filterTrans = document.getElementById('filterTransportadora').value;
    const filterStatus = document.getElementById('filterStatus').value;

    let filtered = cotacoes.filter(c => {
        const cotacaoDate = new Date(c.dataCotacao);
        return cotacaoDate.getMonth() === currentMonth && cotacaoDate.getFullYear() === currentYear;
    });

    if (searchTerm)
        filtered = filtered.filter(c =>
            c.transportadora.toLowerCase().includes(searchTerm) ||
            c.numeroCotacao.toLowerCase().includes(searchTerm) ||
            (c.vendedor && c.vendedor.toLowerCase().includes(searchTerm)) ||
            c.numeroDocumento.toLowerCase().includes(searchTerm) ||
            c.codigoColeta.toLowerCase().includes(searchTerm) ||
            c.responsavelTransportadora.toLowerCase().includes(searchTerm) ||
            (c.destino && c.destino.toLowerCase().includes(searchTerm))
        );

    if (filterResp) filtered = filtered.filter(c => c.responsavelCotacao === filterResp);
    if (filterTrans) filtered = filtered.filter(c => c.transportadora === filterTrans);

    if (filterStatus) {
        if (filterStatus === 'fechado') filtered = filtered.filter(c => c.negocioFechado);
        else if (filterStatus === 'aberto') filtered = filtered.filter(c => !c.negocioFechado);
    }

    renderCotacoes(filtered);
}

function renderCotacoes(filtered) {
    const container = document.getElementById('cotacoesContainer');
    if (filtered.length === 0) {
        container.innerHTML = `<p style="text-align:center;padding:2rem;color:var(--text-secondary);">Nenhuma cotação encontrada para ${meses[currentMonth]} de ${currentYear}.</p>`;
        return;
    }

    filtered.sort((a, b) => new Date(b.timestamp || b.dataCotacao) - new Date(a.timestamp || a.dataCotacao));
    
    // CORREÇÃO: Garantir que ID seja sempre string no onclick
    const tableHTML = `
        <table>
            <thead>
                <tr>
                    <th>Status</th><th>Resp.</th><th>Transportadora</th><th>Destino</th><th>Nº Cotação</th>
                    <th>Valor</th><th>Vendedor</th><th>Documento</th><th>Previsão</th>
                    <th>Código Coleta</th><th>Data</th><th>Ações</th>
                </tr>
            </thead>
            <tbody>
                ${filtered.map(c => `
                    <tr class="${c.negocioFechado ? 'negocio-fechado' : ''}">
                        <td><button class="small ${c.negocioFechado ? 'success' : 'secondary'}" onclick="window.toggleNegocio('${String(c.id)}')">✓</button></td>
                        <td><span class="badge ${c.negocioFechado ? 'fechado' : ''}">${c.responsavelCotacao}</span></td>
                        <td>${c.transportadora}</td><td>${c.destino || 'Não Informado'}</td>
                        <td>${c.numeroCotacao}</td><td class="valor">R$ ${c.valorFrete.toFixed(2)}</td>
                        <td>${c.vendedor}</td><td>${c.numeroDocumento}</td>
                        <td>${c.previsaoEntrega}</td><td>${c.codigoColeta}</td>
                        <td>${formatDate(c.dataCotacao)}</td>
                        <td class="actions">
                            <button class="small secondary" onclick="window.editCotacao('${String(c.id)}')">Editar</button>
                            <button class="small danger" onclick="window.deleteCotacao('${String(c.id)}')">Excluir</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>`;
    container.innerHTML = tableHTML;
}

function formatDate(dateString) {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('pt-BR');
}

function showMessage(message, type) {
    const div = document.createElement('div');
    div.className = `message ${type}`;
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(() => div.classList.add('show'), 100);
    setTimeout(() => {
        div.classList.remove('show');
        setTimeout(() => div.remove(), 300);
    }, 3000);
}
