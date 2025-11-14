// ============================================
// CONFIGURAÇÃO
// ============================================
const PORTAL_URL = 'https://ir-comercio-portal-zcan.onrender.com';
const API_URL = 'https://cotacoes-frete-aikc.onrender.com/api';

let cotacoes = [];
let isOnline = false;
let lastDataHash = '';
let sessionToken = null;
let currentTab = 0;
const tabs = ['tab-geral', 'tab-transportadora', 'tab-detalhes'];

console.log('🚀 Cotações de Frete iniciada');
console.log('📡 API URL:', API_URL);

// ============================================
// INICIALIZAÇÃO
// ============================================
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
        console.log('✅ Token capturado da URL');
    } else {
        sessionToken = sessionStorage.getItem('cotacoesFreteSession');
        console.log('✅ Token do sessionStorage');
    }

    if (!sessionToken) {
        console.log('❌ Sem token - redirecionando');
        mostrarTelaAcessoNegado();
        return;
    }

    console.log('✅ Autenticado - iniciando app');
    inicializarApp();
}

function mostrarTelaAcessoNegado(mensagem = 'NÃO AUTORIZADO') {
    document.body.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: var(--bg-primary); color: var(--text-primary); text-align: center; padding: 2rem;">
            <h1 style="font-size: 2.2rem; margin-bottom: 1rem;">${mensagem}</h1>
            <p style="color: var(--text-secondary); margin-bottom: 2rem;">Somente usuários autenticados podem acessar esta área.</p>
            <a href="${PORTAL_URL}" style="display: inline-block; background: var(--btn-register); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">Ir para o Portal</a>
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
        const response = await fetch(`${API_URL}/cotacoes`, {
            method: 'GET',
            headers: { 
                'X-Session-Token': sessionToken,
                'Accept': 'application/json'
            },
            mode: 'cors'
        });

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
        }
        
        updateConnectionStatus();
        return isOnline;
    } catch (error) {
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
            method: 'GET',
            headers: { 
                'X-Session-Token': sessionToken,
                'Accept': 'application/json'
            },
            mode: 'cors'
        });

        if (response.status === 401) {
            sessionStorage.removeItem('cotacoesFreteSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) {
            console.error('❌ Erro ao carregar:', response.status);
            return;
        }

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
        console.error('❌ Erro ao carregar cotações:', error);
    }
}

function startPolling() {
    loadCotacoes();
    setInterval(() => {
        if (isOnline) loadCotacoes();
    }, 10000);
}

// ============================================
// TOGGLE NEGÓCIO FECHADO
// ============================================
window.toggleNegocioFechado = async function(id) {
    const idStr = String(id);
    const cotacao = cotacoes.find(c => String(c.id) === idStr);
    if (!cotacao) return;

    const novoStatus = !cotacao.negocioFechado;
    cotacao.negocioFechado = novoStatus;
    filterCotacoes();
    
    showMessage(`Negócio marcado como ${novoStatus ? 'fechado' : 'aberto'}!`, 'success');

    if (isOnline) {
        try {
            const response = await fetch(`${API_URL}/cotacoes/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-Token': sessionToken,
                    'Accept': 'application/json'
                },
                body: JSON.stringify(cotacao),
                mode: 'cors'
            });

            if (!response.ok) throw new Error('Erro ao atualizar');

            const savedData = await response.json();
            const index = cotacoes.findIndex(c => c.id === id);
            if (index !== -1) cotacoes[index] = savedData;
        } catch (error) {
            console.error('❌ Erro ao toggle:', error);
            cotacao.negocioFechado = !novoStatus;
            filterCotacoes();
            showMessage('Erro ao atualizar status', 'error');
        }
    }
};

// ============================================
// FORMULÁRIO - ABRIR/FECHAR
// ============================================
window.toggleForm = function() {
    showFormModal(null);
};

function showFormModal(editingId = null) {
    const isEditing = editingId !== null;
    let cotacao = null;
    
    if (isEditing) {
        const idStr = String(editingId);
        cotacao = cotacoes.find(c => String(c.id) === idStr);
        
        if (!cotacao) {
            console.error('❌ Cotação não encontrada no modal!', 'Buscando:', idStr);
            showMessage('Cotação não encontrada!', 'error');
            return;
        }
        console.log('✅ Carregando cotação no formulário:', cotacao);
    }

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

                    <form id="cotacaoForm" onsubmit="handleSubmit(event)">
                        <input type="hidden" id="editId" value="${editingId || ''}">
                        
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
                            <button type="button" class="secondary" id="btnVoltar" onclick="previousTab()" style="display: none;">Voltar</button>
                            <button type="button" class="secondary" onclick="closeFormModal()">Cancelar</button>
                            <button type="button" class="secondary" id="btnProximo" onclick="nextTab()">Próximo</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    currentTab = 0;
    updateNavigationButtons();
    
    setTimeout(() => document.getElementById('responsavel')?.focus(), 100);
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
    
    document.querySelectorAll('#formModal .tab-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });
    
    document.querySelectorAll('#formModal .tab-content').forEach((content, i) => {
        content.classList.toggle('active', i === index);
    });
    
    updateNavigationButtons();
}

function nextTab() {
    if (currentTab < tabs.length - 1) {
        const currentTabElement = document.getElementById(tabs[currentTab]);
        const requiredInputs = currentTabElement.querySelectorAll('[required]');
        let isValid = true;

        requiredInputs.forEach(input => {
            if (!input.value.trim()) {
                isValid = false;
                input.focus();
            }
        });

        if (!isValid) {
            showMessage('Preencha todos os campos obrigatórios', 'error');
            return;
        }

        currentTab++;
        switchTab(currentTab);
    } else {
        handleSubmit(new Event('submit'));
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
        const editId = document.getElementById('editId')?.value;
        if (currentTab === tabs.length - 1) {
            btnProximo.textContent = editId ? 'Atualizar' : 'Salvar';
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
async function handleSubmit(event) {
    if (event) event.preventDefault();

    console.log('📝 Iniciando submit...');

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
        observacoes: document.getElementById('observacoes').value.trim(),
        negocioFechado: false
    };

    const editId = document.getElementById('editId').value;

    if (editId) {
        const cotacaoExistente = cotacoes.find(c => c.id === editId);
        if (cotacaoExistente) {
            formData.negocioFechado = cotacaoExistente.negocioFechado;
            formData.timestamp = cotacaoExistente.timestamp;
        }
    }

    console.log('📦 Dados do formulário:', formData);

    closeFormModal();

    if (!isOnline) {
        showMessage('Sistema offline. Dados não foram salvos.', 'error');
        return;
    }

    try {
        const url = editId ? `${API_URL}/cotacoes/${editId}` : `${API_URL}/cotacoes`;
        const method = editId ? 'PUT' : 'POST';

        console.log(`🌐 ${method} para ${url}`);

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': sessionToken,
                'Accept': 'application/json'
            },
            body: JSON.stringify(formData),
            mode: 'cors'
        });

        console.log('📡 Resposta:', response.status);

        if (response.status === 401) {
            sessionStorage.removeItem('cotacoesFreteSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) {
            const errorData = await response.json();
            console.error('❌ Erro do servidor:', errorData);
            throw new Error(errorData.details || 'Erro ao salvar');
        }

        const savedData = await response.json();
        console.log('✅ Dados salvos:', savedData);

        if (editId) {
            const index = cotacoes.findIndex(c => c.id === editId);
            if (index !== -1) cotacoes[index] = savedData;
            showMessage('Cotação atualizada!', 'success');
        } else {
            cotacoes.push(savedData);
            showMessage('Cotação criada!', 'success');
        }

        lastDataHash = JSON.stringify(cotacoes.map(c => c.id));
        updateTransportadorasFilter();
        filterCotacoes();

    } catch (error) {
        console.error('❌ Erro ao salvar:', error);
        showMessage(`Erro: ${error.message}`, 'error');
    }
}

// ============================================
// EDIÇÃO
// ============================================
window.editCotacao = function(id) {
    console.log('✏️ Editando cotação ID:', id, 'Tipo:', typeof id);
    
    // Converter ID para string para garantir comparação correta
    const idStr = String(id);
    const cotacao = cotacoes.find(c => String(c.id) === idStr);
    
    if (!cotacao) {
        console.error('❌ Cotação não encontrada!', 'Buscando:', idStr, 'Disponíveis:', cotacoes.map(c => c.id));
        showMessage('Cotação não encontrada!', 'error');
        return;
    }
    
    console.log('✅ Cotação encontrada:', cotacao);
    showFormModal(idStr);
};

// ============================================
// EXCLUSÃO
// ============================================
window.deleteCotacao = async function(id) {
    if (!confirm('Tem certeza que deseja excluir esta cotação?')) return;

    const idStr = String(id);
    const deletedCotacao = cotacoes.find(c => String(c.id) === idStr);
    cotacoes = cotacoes.filter(c => String(c.id) !== idStr);
    filterCotacoes();
    showMessage('Cotação excluída!', 'success');

    if (isOnline) {
        try {
            const response = await fetch(`${API_URL}/cotacoes/${id}`, {
                method: 'DELETE',
                headers: {
                    'X-Session-Token': sessionToken,
                    'Accept': 'application/json'
                },
                mode: 'cors'
            });

            if (!response.ok) throw new Error('Erro ao deletar');
        } catch (error) {
            if (deletedCotacao) {
                cotacoes.push(deletedCotacao);
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
    console.log('👁️ Visualizando cotação ID:', id, 'Tipo:', typeof id);
    
    // Converter ID para string para garantir comparação correta
    const idStr = String(id);
    const cotacao = cotacoes.find(c => String(c.id) === idStr);
    
    if (!cotacao) {
        console.error('❌ Cotação não encontrada!', 'Buscando:', idStr, 'Disponíveis:', cotacoes.map(c => c.id));
        showMessage('Cotação não encontrada!', 'error');
        return;
    }
    
    console.log('✅ Cotação encontrada:', cotacao);

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

                    <div class="tab-content active" id="view-tab-geral">
                        <div class="info-section">
                            <h4>Informações Gerais</h4>
                            <p><strong>Responsável:</strong> ${cotacao.responsavel}</p>
                            <p><strong>Documento:</strong> ${cotacao.documento}</p>
                            ${cotacao.vendedor ? `<p><strong>Vendedor:</strong> ${cotacao.vendedor}</p>` : ''}
                            <p><strong>Status:</strong> <span class="badge ${cotacao.negocioFechado ? 'fechada' : 'aberta'}">${cotacao.negocioFechado ? 'FECHADO' : 'ABERTO'}</span></p>
                        </div>
                    </div>

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
};

function closeViewModal() {
    const modal = document.getElementById('viewModal');
    if (modal) {
        modal.style.animation = 'fadeOut 0.2s ease forwards';
        setTimeout(() => modal.remove(), 200);
    }
}

window.switchViewTab = function(index) {
    document.querySelectorAll('#viewModal .tab-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });
    
    document.querySelectorAll('#viewModal .tab-content').forEach((content, i) => {
        content.classList.toggle('active', i === index);
    });
};

// ============================================
// FILTROS
// ============================================
function updateTransportadorasFilter() {
    const transportadoras = new Set();
    cotacoes.forEach(c => {
        if (c.transportadora?.trim()) {
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
    const searchTerm = document.getElementById('search')?.value.toLowerCase() || '';
    const filterTransportadora = document.getElementById('filterTransportadora')?.value || '';
    
    let filtered = [...cotacoes];

    if (filterTransportadora) {
        filtered = filtered.filter(c => c.transportadora === filterTransportadora);
    }

    if (searchTerm) {
        filtered = filtered.filter(c => 
            c.transportadora?.toLowerCase().includes(searchTerm) ||
            c.destino?.toLowerCase().includes(searchTerm) ||
            c.documento?.toLowerCase().includes(searchTerm) ||
            c.numeroCotacao?.toLowerCase().includes(searchTerm) ||
            c.responsavel?.toLowerCase().includes(searchTerm)
        );
    }

    filtered.sort((a, b) => new Date(b.dataCotacao) - new Date(a.dataCotacao));
    renderCotacoes(filtered);
}

// ============================================
// RENDERIZAÇÃO
// ============================================
function renderCotacoes(cotacoesToRender) {
    const container = document.getElementById('cotacoesContainer');
    
    if (!container) {
        console.error('❌ Container não encontrado');
        return;
    }
    
    if (!cotacoesToRender || cotacoesToRender.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">Nenhuma cotação encontrada</div>';
        return;
    }

    const table = `
        <div style="overflow-x: auto;">
            <table>
                <thead>
                    <tr>
                        <th style="text-align: center; width: 60px;">✓</th>
                        <th>Data</th>
                        <th>Transportadora</th>
                        <th>Destino</th>
                        <th>Documento</th>
                        <th>Valor</th>
                        <th>Previsão</th>
                        <th>Status</th>
                        <th style="text-align: center; min-width: 260px;">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${cotacoesToRender.map(c => `
                        <tr class="${c.negocioFechado ? 'fechada' : ''}">
                            <td style="text-align: center;">
                                <button class="check-btn ${c.negocioFechado ? 'checked' : ''}" 
                                        onclick="toggleNegocioFechado('${c.id}')" 
                                        title="${c.negocioFechado ? 'Marcar como aberto' : 'Marcar como fechado'}">
                                    ✓
                                </button>
                            </td>
                            <td>${formatDate(c.dataCotacao)}</td>
                            <td><strong>${c.transportadora}</strong></td>
                            <td>${c.destino}</td>
                            <td>${c.documento}</td>
                            <td><strong>R$ ${parseFloat(c.valorFrete).toFixed(2)}</strong></td>
                            <td>${c.previsaoEntrega || '-'}</td>
                            <td>
                                <span class="badge ${c.negocioFechado ? 'fechada' : 'aberta'}">
                                    ${c.negocioFechado ? 'FECHADO' : 'ABERTO'}
                                </span>
                            </td>
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
    console.log(`📢 ${type.toUpperCase()}: ${message}`);
    const messageDiv = document.getElementById('statusMessage');
    if (!messageDiv) return;
    messageDiv.textContent = message;
    messageDiv.className = `status-message ${type} show`;
    setTimeout(() => { messageDiv.className = `status-message ${type}`; }, 3000);
}
