// ✅ Altere para a URL real do seu Portal Central
const PORTAL_URL = 'https://portal-central-ircomercio.onrender.com';
const API_URL = 'https://cotacoes-frete.onrender.com/api/cotacoes';

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
    // Pegar token da URL
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('sessionToken');

    if (tokenFromUrl) {
        sessionToken = tokenFromUrl;
        sessionStorage.setItem('cotacoesFreteSession', sessionToken);
        // Limpar URL sem recarregar a página
        window.history.replaceState({}, document.title, window.location.pathname);
    } else {
        sessionToken = sessionStorage.getItem('cotacoesFreteSession');
    }

    if (!sessionToken) {
        mostrarTelaAcessoNegado();
        return;
    }

    // Verificar se a sessão é válida
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

        // Sessão válida - carregar aplicação
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

    // Verificar a cada 30 segundos
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
function mostrarTelaAcessoNegado(mensagem = 'Acesso não autorizado') {
    document.body.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background: linear-gradient(135deg, #F5F5F5 0%, #FFFFFF 100%); font-family: 'Inter', sans-serif;">
            <div style="text-align: center; padding: 3rem; background: white; border-radius: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.08); max-width: 500px;">
                <div style="font-size: 4rem; margin-bottom: 1rem;">🔒</div>
                <h1 style="font-size: 1.8rem; color: #1E1E1E; margin-bottom: 1rem;">Acesso Restrito</h1>
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

    const currentIds = new Set(cotacoes.map(c => c.id));
    const newIds = new Set(newData.map(c => c.id));

    if (currentIds.size !== newIds.size) return true;

    for (let id of newIds) if (!currentIds.has(id)) return true;

    for (let newItem of newData) {
        const oldItem = cotacoes.find(c => c.id === newItem.id);
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
        const response = await fetch('https://cotacoes-frete.onrender.com/health', { 
            method: 'GET',
            cache: 'no-cache'
        });
        isOnline = response.ok;
        updateConnectionStatus();
        return isOnline;
    } catch (error) {
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
    document.getElementById('dataCotacao').value = today;
}

async function loadCotacoes() {
    const serverOnline = await checkServerStatus();
    try {
        if (serverOnline) {
            const response = await fetch(API_URL, {
                headers: {
                    'X-Session-Token': sessionToken
                }
            });

            if (response.status === 401) {
                sessionStorage.removeItem('cotacoesFreteSession');
                mostrarTelaAcessoNegado('Sua sessão expirou');
                return;
            }

            if (!response.ok) throw new Error('Erro ao carregar cotações');
            cotacoes = await response.json();
            saveToLocalStorage(cotacoes);
            lastSyncTime = new Date();
        } else {
            cotacoes = loadFromLocalStorage();
        }
        filterCotacoes();
    } catch (error) {
        console.error('Erro:', error);
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
            const index = cotacoes.findIndex(c => c.id === editId);
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
                        const index = cotacoes.findIndex(c => c.id === tempId);
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

function editCotacao(id) {
    const cotacao = cotacoes.find(c => c.id === id);
    if (!cotacao) return;

    document.getElementById('editId').value = id;
    document.getElementById('responsavelCotacao').value = cotacao.responsavelCotacao;
    document.getElementById('transportadora').value = cotacao.transportadora;
    document.getElementById('destino').value = cotacao.destino || '';
    document.getElementById('numeroCotacao').value = cotacao.numeroCotacao || '';
    document.getElementById('valorFrete').value = cotacao.valorFrete;
    document.getElementById('vendedor').value = cotacao.vendedor || '';
    document.getElementById('numeroDocumento').value = cotacao.numeroDocumento || '';
    document.getElementById('previsaoEntrega').value = cotacao.previsaoEntrega || '';
    document.getElementById('canalComunicacao').value = cotacao.canalComunicacao || '';
    document.getElementById('codigoColeta').value = cotacao.codigoColeta || '';
    document.getElementById('responsavelTransportadora').value = cotacao.responsavelTransportadora || '';
    document.getElementById('dataCotacao').value = cotacao.dataCotacao;
    document.getElementById('observacoes').value = cotacao.observacoes || '';

    document.getElementById('formTitle').textContent = 'Editar Cotação';
    document.getElementById('submitText').textContent = 'Atualizar Cotação';
    document.getElementById('cancelBtn').classList.remove('hidden');
    document.getElementById('formCard').classList.remove('hidden');
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteCotacao(id) {
    if (!confirm('Tem certeza que deseja excluir esta cotação?')) return;
    
    const cotacaoBackup = cotacoes.find(c => c.id === id);
    cotacoes = cotacoes.filter(c => c.id !== id);
    saveToLocalStorage(cotacoes);
    filterCotacoes();
    showMessage('Cotação excluída!', 'success');

    const serverOnline = await checkServerStatus();
    if (serverOnline) {
        try {
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
        } catch (error) {
            console.error('Erro:', error);
            if (cotacaoBackup) {
                cotacoes.push(cotacaoBackup);
                cotacoes.sort((a, b) => new Date(b.timestamp || b.dataCotacao) - new Date(a.timestamp || a.dataCotacao));
                saveToLocalStorage(cotacoes);
                filterCotacoes();
                showMessage('Erro ao excluir. Registro restaurado.', 'error');
            }
        }
    }
}

async function toggleNegocio(id) {
    const cotacao = cotacoes.find(c => c.id === id);
    if (!cotacao) return;
    
    const estadoAnterior = cotacao.negocioFechado;
    cotacao.negocioFechado = !cotacao.negocioFechado;
    saveToLocalStorage(cotacoes);
    filterCotacoes();
    showMessage(cotacao.negocioFechado ? 'Negócio fechado!' : 'Marcação removida!', 'success');

    const serverOnline = await checkServerStatus();
    if (serverOnline) {
        try {
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
        } catch (error) {
            cotacao.negocioFechado = estadoAnterior;
            saveToLocalStorage(cotacoes);
            filterCotacoes();
            showMessage('Erro ao atualizar. Status revertido.', 'error');
        }
    }
}

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

function cancelEdit() { resetForm(); }

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
                        <td><button class="small ${c.negocioFechado ? 'success' : 'secondary'}" onclick="toggleNegocio('${c.id}')">✓</button></td>
                        <td><span class="badge ${c.negocioFechado ? 'fechado' : ''}">${c.responsavelCotacao}</span></td>
                        <td>${c.transportadora}</td><td>${c.destino || 'Não Informado'}</td>
                        <td>${c.numeroCotacao}</td><td class="valor">R$ ${c.valorFrete.toFixed(2)}</td>
                        <td>${c.vendedor}</td><td>${c.numeroDocumento}</td>
                        <td>${c.previsaoEntrega}</td><td>${c.codigoColeta}</td>
                        <td>${formatDate(c.dataCotacao)}</td>
                        <td class="actions">
                            <button class="small secondary" onclick="editCotacao('${c.id}')">Editar</button>
                            <button class="small danger" onclick="deleteCotacao('${c.id}')">Excluir</button>
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
