// CONFIGURAÇÃO
const PORTAL_URL = 'https://ir-comercio-portal-zcan.onrender.com';
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3001/api'
    : `${window.location.origin}/api`;

let cotacoes = [];
let isOnline = false;
let lastDataHash = '';
let sessionToken = null;
let currentTab = 0;
const tabs = ['tab-geral', 'tab-transportadora', 'tab-detalhes'];

// LOG APENAS NO INÍCIO
console.log('🚀 Cotações de Frete iniciada');

document.addEventListener('DOMContentLoaded', () => {
    verificarAutenticacao();
});

// ============================================
// AUTENTICAÇÃO
// ============================================
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

    inicializarApp();
}

function mostrarTelaAcessoNegado(mensagem = 'NÃO AUTORIZADO') {
    document.body.innerHTML = `
        <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            background: var(--bg-primary);
            color: var(--text-primary);
            text-align: center;
            padding: 2rem;
        ">
            <h1 style="font-size: 2.2rem; margin-bottom: 1rem;">${mensagem}</h1>
            <p style="color: var(--text-secondary); margin-bottom: 2rem;">
                Somente usuários autenticados podem acessar esta área.
            </p>
            <a href="${PORTAL_URL}" style="
                display: inline-block;
                background: var(--btn-register);
                color: white;
                padding: 14px 32px;
                border-radius: 8px;
                text-decoration: none;
                font-weight: 600;
            ">Ir para o Portal</a>
        </div>
    `;
}

function inicializarApp() {
    checkServerStatus();
    setInterval(checkServerStatus, 15000);
    startPolling();
}

// ============================================
// CONEXÃO E STATUS
// ============================================
async function checkServerStatus() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${API_URL}/cotacoes`, {
            method: 'HEAD',
            headers: { 'X-Session-Token': sessionToken },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (response.status === 401) {
            sessionStorage.removeItem('cotacoesFreteSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return false;
        }

        const wasOffline = !isOnline;
        isOnline = response.ok;
        
        if (wasOffline && isOnline) {
            console.log('✅ Servidor ONLINE');
            await loadCotacoes();
        } else if (!wasOffline && !isOnline) {
            console.log('❌ Servidor OFFLINE');
        }
        
        updateConnectionStatus();
        return isOnline;
    } catch (error) {
        if (isOnline) {
            console.log('❌ Erro de conexão:', error.message);
        }
        isOnline = false;
        updateConnectionStatus();
        return false;
    }
}

function updateConnectionStatus() {
    const statusElement = document.getElementById('connectionStatus');
    if (statusElement) {
        statusElement.className = isOnline ? 'connection-status online' : 'connection-status offline';
    }
}

// ============================================
// CARREGAMENTO DE DADOS
// ============================================
async function loadCotacoes() {
    if (!isOnline) return;

    try {
        const response = await fetch(`${API_URL}/cotacoes`, {
            headers: { 'X-Session-Token': sessionToken }
        });

        if (response.status === 401) {
            sessionStorage.removeItem('cotacoesFreteSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) return;

        const data = await response.json();
        const newHash = JSON.stringify(data.map(c => c.id));

        if (newHash !== lastDataHash) {
            cotacoes = data;
            lastDataHash = newHash;
            console.log(`📊 ${data.length} cotações carregadas`);
            updateTransportadorasFilter();
            filterCotacoes();
        }
    } catch (error) {
        // Silencioso
    }
}

function startPolling() {
    loadCotacoes();
    setInterval(() => {
        if (isOnline) loadCotacoes();
    }, 10000);
}

// ============================================
// MODAL DE FORMULÁRIO COM ABAS
// ============================================
window.toggleForm = function() {
    showFormModal(null);
};

function showFormModal(editingId = null) {
    const isEditing = editingId !== null;
    const cotacao = isEditing ? cotacoes.find(c => c.id === editingId) : null;

    const modalHTML = `
        <div class="modal-overlay" id="formModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">${isEditing ? 'Editar Cotação' : 'Nova Cotação'}</h3>
                    <button class="close-modal" onclick="closeFormModal()">×</button>
                </div>
                
                <div class="tabs-container">
                    <div class="tabs-nav">
                        <button class="tab-btn active" onclick="switchTab(0)">Geral</button>
                        <button class="tab-btn" onclick="switchTab(1)">Transportadora</button>
                        <button class="tab-btn" onclick="switchTab(2)">Detalhes</button>
                    </div>

                    <form id="cotacaoForm">
                        <input type="hidden" id="editId" value="${editingId || ''}">
                        
                        <!-- ABA GERAL -->
                        <div class="tab-content active" id="tab-geral">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="responsavel">Responsável pela Cotação *</label>
                                    <input type="text" id="responsavel" value="${cotacao?.responsavel || ''}" required>
                                </div>
                                <div class="form-group">
                                    <label for="documento">Documento *</label>
                                    <input type="text" id="documento" value="${cotacao?.documento || ''}" required>
                                </div>
                                <div class="form-group">
                                    <label for="vendedor">Vendedor</label>
                                    <input type="text" id="vendedor" value="${cotacao?.vendedor || ''}">
                                </div>
                            </div>
                        </div>

                        <!-- ABA TRANSPORTADORA -->
                        <div class="tab-content" id="tab-transportadora">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="transportadora">Transportadora *</label>
                                    <input type="text" id="transportadora" value="${cotacao?.transportadora || ''}" required>
                                </div>
                                <div class="form-group">
                                    <label for="destino">Destino *</label>
                                    <input type="text" id="destino" value="${cotacao?.destino || ''}" required>
                                </div>
                                <div class="form-group">
                                    <label for="numeroCotacao">Número da Cotação</label>
                                    <input type="text" id="numeroCotacao" value="${cotacao?.numeroCotacao || ''}">
                                </div>
                                <div class="form-group">
                                    <label for="valorFrete">Valor do Frete (R$) *</label>
                                    <input type="number" id="valorFrete" step="0.01" min="0" value="${cotacao?.valorFrete || ''}" required>
                                </div>
                                <div class="form-group">
                                    <label for="previsaoEntrega">Previsão de Entrega</label>
                                    <input type="text" id="previsaoEntrega" value="${cotacao?.previsaoEntrega || ''}" placeholder="Ex: 3 a 5 dias úteis">
                                </div>
                                <div class="form-group">
                                    <label for="canalComunicacao">Canal de Comunicação</label>
                                    <input type="text" id="canalComunicacao" value="${cotacao?.canalComunicacao || ''}" placeholder="Ex: WhatsApp, E-mail">
                                </div>
                                <div class="form-group">
                                    <label for="codigoColeta">Código de Coleta</label>
                                    <input type="text" id="codigoColeta" value="${cotacao?.codigoColeta || ''}">
                                </div>
                                <div class="form-group">
                                    <label for="responsavelTransportadora">Responsável da Transportadora</label>
                                    <input type="text" id="responsavelTransportadora" value="${cotacao?.responsavelTransportadora || ''}">
                                </div>
                            </div>
                        </div>

                        <!-- ABA DETALHES -->
                        <div class="tab-content" id="tab-detalhes">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="dataCotacao">Data da Cotação *</label>
                                    <input type="date" id="dataCotacao" value="${cotacao?.dataCotacao || new Date().toISOString().split('T')[0]}" required>
                                </div>
                                <div class="form-group" style="grid-column: 1 / -1;">
                                    <label for="observacoes">Observações</label>
                                    <textarea id="observacoes" rows="4">${cotacao?.observacoes || ''}</textarea>
                                </div>
                            </div>
                        </div>

                        <div class="modal-actions">
                            <button type="button" class="secondary" id="btnVoltar" onclick="previousTab()">Voltar</button>
                            <button type="button" class="secondary" onclick="closeFormModal()">Cancelar</button>
                            <button type="button" class="secondary" id="btnProximo" onclick="nextTab()">Próximo</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    const modal = document.getElementById('formModal');
    const form = document.getElementById('cotacaoForm');

    currentTab = 0;
    updateNavigationButtons();

    form.addEventListener('submit', handleSubmit);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeFormModal(); });

    setTimeout(() => document.getElementById('responsavel').focus(), 100);
}

function closeFormModal() {
    const modal = document.getElementById('formModal');
    if (modal) {
        modal.style.animation = 'fadeOut 0.2s ease forwards';
        setTimeout(() => modal.remove(), 200);
    }
}

// ============================================
// SISTEMA DE ABAS
// ============================================
function switchTab(index) {
    currentTab = index;
    
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });
    
    tabContents.forEach((content, i) => {
        content.classList.toggle('active', i === index);
    });
    
    updateNavigationButtons();
}

function nextTab() {
    if (currentTab < tabs.length - 1) {
        // Validar campos obrigatórios da aba atual antes de avançar
        const currentTabElement = document.getElementById(tabs[currentTab]);
        const requiredInputs = currentTabElement.querySelectorAll('[required]');
        let allValid = true;

        requiredInputs.forEach(input => {
            if (!input.value.trim()) {
                input.focus();
                allValid = false;
                showMessage('Preencha todos os campos obrigatórios', 'error');
            }
        });

        if (allValid) {
            currentTab++;
            switchTab(currentTab);
        }
    } else {
        // Submeter formulário
        document.getElementById('cotacaoForm').dispatchEvent(new Event('submit'));
    }
}

function previousTab() {
    if (currentTab > 0) {
        currentTab--;
        switchTab(currentTab);
    }
}

function updateNavigationButtons() {
    const btnVoltar = document.getElementById('btnVoltar');
    const btnProximo = document.getElementById('btnProximo');
    
    if (btnVoltar) {
        btnVoltar.style.display = currentTab === 0 ? 'none' : 'inline-flex';
    }
    
    if (btnProximo) {
        if (currentTab === tabs.length - 1) {
            btnProximo.textContent = document.getElementById('editId').value ? 'Atualizar' : 'Salvar';
            btnProximo.className = 'save';
        } else {
            btnProximo.textContent = 'Próximo';
            btnProximo.className = 'secondary';
        }
    }
}

// ============================================
// SUBMIT DO FORMULÁRIO
// ============================================
async function handleSubmit(e) {
    e.preventDefault();

    const formData = {
        responsavel: document.getElementById('responsavel').value.trim(),
        documento: document.getElementById('documento').value.trim(),
        vendedor: document.getElementById('vendedor').value.trim(),
        transportadora: document.getElementById('transportadora').value.trim(),
        destino: document.getElementById('destino').value.trim(),
        numeroCotacao: document.getElementById('numeroCotacao').value.trim(),
        valorFrete: parseFloat(document.getElementById('valorFrete').value),
        previsaoEntrega: document.getElementById('previsaoEntrega').value.trim(),
        canalComunicacao: document.getElementById('canalComunicacao').value.trim(),
        codigoColeta: document.getElementById('codigoColeta').value.trim(),
        responsavelTransportadora: document.getElementById('responsavelTransportadora').value.trim(),
        dataCotacao: document.getElementById('dataCotacao').value,
        observacoes: document.getElementById('observacoes').value.trim()
    };

    const editId = document.getElementById('editId').value;
    const tempId = editId || 'temp_' + Date.now();
    const optimisticData = { ...formData, id: tempId, timestamp: new Date().toISOString() };

    if (editId) {
        const index = cotacoes.findIndex(c => c.id === editId);
        if (index !== -1) cotacoes[index] = optimisticData;
        showMessage('Cotação atualizada!', 'success');
    } else {
        cotacoes.push(optimisticData);
        showMessage('Cotação criada!', 'success');
    }

    updateTransportadorasFilter();
    filterCotacoes();
    closeFormModal();
    syncWithServer(formData, editId, tempId);
}

// ============================================
// SINCRONIZAÇÃO COM SERVIDOR
// ============================================
async function syncWithServer(formData, editId = null, tempId = null) {
    if (!isOnline) return;

    try {
        const url = editId ? `${API_URL}/cotacoes/${editId}` : `${API_URL}/cotacoes`;
        const method = editId ? 'PUT' : 'POST';

        const response = await fetch(url, { 
            method, 
            headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken }, 
            body: JSON.stringify(formData) 
        });

        if (response.status === 401) {
            sessionStorage.removeItem('cotacoesFreteSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }
        
        if (!response.ok) throw new Error(`Erro ${response.status}`);
        
        const savedData = await response.json();

        if (editId) {
            const index = cotacoes.findIndex(c => c.id === editId);
            if (index !== -1) cotacoes[index] = savedData;
        } else {
            const tempIndex = cotacoes.findIndex(c => c.id === tempId);
            if (tempIndex !== -1) cotacoes[tempIndex] = savedData;
        }

        lastDataHash = JSON.stringify(cotacoes.map(c => c.id));
        updateTransportadorasFilter();
        filterCotacoes();
    } catch (error) {
        if (!editId) {
            cotacoes = cotacoes.filter(c => c.id !== tempId);
            filterCotacoes();
        }
        showMessage('Erro ao salvar', 'error');
    }
}

// ============================================
// EDIÇÃO E EXCLUSÃO
// ============================================
window.editCotacao = function(id) {
    showFormModal(id);
};

window.deleteCotacao = async function(id) {
    if (!confirm('Tem certeza que deseja excluir esta cotação?')) return;

    const deletedCotacao = cotacoes.find(c => c.id === id);
    cotacoes = cotacoes.filter(c => c.id !== id);
    updateTransportadorasFilter();
    filterCotacoes();
    showMessage('Cotação excluída!', 'error');

    if (isOnline) {
        try {
            const response = await fetch(`${API_URL}/cotacoes/${id}`, { 
                method: 'DELETE',
                headers: { 'X-Session-Token': sessionToken }
            });

            if (response.status === 401) {
                sessionStorage.removeItem('cotacoesFreteSession');
                mostrarTelaAcessoNegado('Sua sessão expirou');
                return;
            }

            if (!response.ok) throw new Error('Erro ao deletar');
        } catch (error) {
            if (deletedCotacao) {
                cotacoes.push(deletedCotacao);
                updateTransportadorasFilter();
                filterCotacoes();
                showMessage('Erro ao excluir', 'error');
            }
        }
    }
};

// ============================================
// VISUALIZAÇÃO
// ============================================
window.viewCotacao = function(id) {
    const cotacao = cotacoes.find(c => c.id === id);
    if (!cotacao) return;

    const modalHTML = `
        <div class="modal-overlay" id="viewModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">Detalhes da Cotação</h3>
                    <button class="close-modal" onclick="closeViewModal()">×</button>
                </div>
                
                <div class="tabs-container">
                    <div class="tabs-nav">
                        <button class="tab-btn active" onclick="switchViewTab(0)">Geral</button>
                        <button class="tab-btn" onclick="switchViewTab(1)">Transportadora</button>
                        <button class="tab-btn" onclick="switchViewTab(2)">Detalhes</button>
                    </div>

                    <!-- ABA GERAL -->
                    <div class="tab-content active" id="view-tab-geral">
                        <div class="info-section">
                            <h4>Informações Gerais</h4>
                            <p><strong>Responsável:</strong> ${cotacao.responsavel}</p>
                            <p><strong>Documento:</strong> ${cotacao.documento}</p>
                            ${cotacao.vendedor ? `<p><strong>Vendedor:</strong> ${cotacao.vendedor}</p>` : ''}
                        </div>
                    </div>

                    <!-- ABA TRANSPORTADORA -->
                    <div class="tab-content" id="view-tab-transportadora">
                        <div class="info-section">
                            <h4>Dados da Transportadora</h4>
                            <p><strong>Transportadora:</strong> ${cotacao.transportadora}</p>
                            <p><strong>Destino:</strong> ${cotacao.destino}</p>
                            ${cotacao.numeroCotacao ? `<p><strong>Número da Cotação:</strong> ${cotacao.numeroCotacao}</p>` : ''}
                            <p><strong>Valor do Frete:</strong> R$ ${parseFloat(cotacao.valorFrete).toFixed(2)}</p>
                            ${cotacao.previsaoEntrega ? `<p><strong>Previsão de Entrega:</strong> ${cotacao.previsaoEntrega}</p>` : ''}
                            ${cotacao.canalComunicacao ? `<p><strong>Canal de Comunicação:</strong> ${cotacao.canalComunicacao}</p>` : ''}
                            ${cotacao.codigoColeta ? `<p><strong>Código de Coleta:</strong> ${cotacao.codigoColeta}</p>` : ''}
                            ${cotacao.responsavelTransportadora ? `<p><strong>Responsável:</strong> ${cotacao.responsavelTransportadora}</p>` : ''}
                        </div>
                    </div>

                    <!-- ABA DETALHES -->
                    <div class="tab-content" id="view-tab-detalhes">
                        <div class="info-section">
                            <h4>Detalhes Adicionais</h4>
                            <p><strong>Data da Cotação:</strong> ${formatDate(cotacao.dataCotacao)}</p>
                            ${cotacao.observacoes ? `<p><strong>Observações:</strong> ${cotacao.observacoes}</p>` : ''}
                        </div>
                    </div>
                </div>

                <div class="modal-actions">
                    <button class="secondary" onclick="closeViewModal()">Fechar</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    const modal = document.getElementById('viewModal');
    modal.addEventListener('click', (e) => { if (e.target === modal) closeViewModal(); });
};

function closeViewModal() {
    const modal = document.getElementById('viewModal');
    if (modal) {
        modal.style.animation = 'fadeOut 0.2s ease forwards';
        setTimeout(() => modal.remove(), 200);
    }
}

window.switchViewTab = function(index) {
    const tabButtons = document.querySelectorAll('#viewModal .tab-btn');
    const tabContents = document.querySelectorAll('#viewModal .tab-content');
    
    tabButtons.forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });
    
    tabContents.forEach((content, i) => {
        content.classList.toggle('active', i === index);
    });
};

// ============================================
// FILTROS E RENDERIZAÇÃO
// ============================================
function updateTransportadorasFilter() {
    const transportadoras = new Set();
    cotacoes.forEach(c => {
        if (c.transportadora && c.transportadora.trim()) {
            transportadoras.add(c.transportadora.trim());
        }
    });

    const select = document.getElementById('filterTransportadora');
    if (select) {
        const currentValue = select.value;
        select.innerHTML = '<option value="">Todas</option>';
        Array.from(transportadoras).sort().forEach(t => {
            const option = document.createElement('option');
            option.value = t;
            option.textContent = t;
            select.appendChild(option);
        });
        select.value = currentValue;
    }
}

function filterCotacoes() {
    const searchTerm = document.getElementById('search').value.toLowerCase();
    const filterTransportadora = document.getElementById('filterTransportadora').value;
    
    let filtered = cotacoes;

    if (filterTransportadora) {
        filtered = filtered.filter(c => c.transportadora === filterTransportadora);
    }

    if (searchTerm) {
        filtered = filtered.filter(c => 
            c.transportadora.toLowerCase().includes(searchTerm) ||
            c.destino.toLowerCase().includes(searchTerm) ||
            c.documento.toLowerCase().includes(searchTerm) ||
            (c.numeroCotacao && c.numeroCotacao.toLowerCase().includes(searchTerm)) ||
            (c.responsavel && c.responsavel.toLowerCase().includes(searchTerm))
        );
    }

    filtered.sort((a, b) => new Date(b.dataCotacao) - new Date(a.dataCotacao));
    renderCotacoes(filtered);
}

function renderCotacoes(cotacoesToRender) {
    const container = document.getElementById('cotacoesContainer');
    
    if (!cotacoesToRender || cotacoesToRender.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">Nenhuma cotação encontrada</div>';
        return;
    }

    const table = `
        <div style="overflow-x: auto;">
            <table>
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Transportadora</th>
                        <th>Destino</th>
                        <th>Documento</th>
                        <th>Valor</th>
                        <th>Previsão</th>
                        <th style="text-align: center;">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${cotacoesToRender.map(c => `
                        <tr>
                            <td>${formatDate(c.dataCotacao)}</td>
                            <td><strong>${c.transportadora}</strong></td>
                            <td>${c.destino}</td>
                            <td>${c.documento}</td>
                            <td><strong>R$ ${parseFloat(c.valorFrete).toFixed(2)}</strong></td>
                            <td>${c.previsaoEntrega || '-'}</td>
                            <td class="actions-cell" style="text-align: center;">
                                <button onclick="viewCotacao('${c.id}')" class="action-btn view">Ver</button>
                                <button onclick="editCotacao('${c.id}')" class="action-btn edit">Editar</button>
                                <button onclick="deleteCotacao('${c.id}')" class="action-btn delete">Excluir</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = table;
}

// ============================================
// UTILIDADES
// ============================================
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('pt-BR');
}

function showMessage(message, type) {
    const messageDiv = document.getElementById('statusMessage');
    if (!messageDiv) return;
    messageDiv.textContent = message;
    messageDiv.className = `status-message ${type} show`;
    setTimeout(() => { messageDiv.className = `status-message ${type}`; }, 3000);
}
