const { useState, useEffect } = React;
const supabaseClient = window.pharmabookSupabaseClient;

function App() {
    // STATES
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState('home');
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('todas');
    const [systemFilter, setSystemFilter] = useState(null);
    
    // DADOS DO SUPABASE
    const [systems, setSystems] = useState([]);
    const [allConditions, setAllConditions] = useState([]);
    const [conditionsData, setConditionsData] = useState({});
    
    const [favorites, setFavorites] = useState(() => {
        const saved = localStorage.getItem('pharmabook_favorites');
        return saved ? JSON.parse(saved) : [];
    });
    
    const [selectedCondition, setSelectedCondition] = useState(null);
    
    // CARREGAR DADOS DO SUPABASE
    useEffect(() => {
        loadData();
    }, []);
    
    async function loadData() {
        try {
            setLoading(true);
            
            // Buscar sistemas
            const { data: systemsData, error: systemsError } = await supabaseClient
                .from('systems')
                .select('*')
                .eq('active', true)
                .order('order_index');
            
            if (systemsError) throw systemsError;
            
            // Buscar condições
            const { data: conditionsDataRaw, error: conditionsError } = await supabaseClient
                .from('conditions')
                .select(`
                    *,
                    systems (
                        slug,
                        name,
                        icon
                    ),
                    medications (*)
                `)
                .eq('active', true)
                .order('name');
            
            if (conditionsError) throw conditionsError;
            
            // Processar sistemas
            const processedSystems = systemsData.map(s => ({
                id: s.slug,
                name: s.name,
                icon: s.icon,
                color: s.color,
                count: conditionsDataRaw.filter(c => c.systems.slug === s.slug).length
            }));
            
            // Processar condições para lista
            const processedConditions = conditionsDataRaw.map(c => ({
                id: c.slug,
                name: c.name,
                desc: c.short_description,
                system: c.systems.slug
            }));
            
            // Processar dados completos das condições
            const processedConditionsData = {};
            conditionsDataRaw.forEach(c => {
                processedConditionsData[c.slug] = {
                    system: c.systems.name,
                    name: c.name,
                    definition: c.definition,
                    causes: c.causes || [],
                    objectives: c.objectives || [],
                    symptoms: c.symptoms || [],
                    alertSigns: c.alert_signs || [],
                    referralCriteria: c.referral_criteria || [],
                    medications: c.medications.map(m => ({
                        name: m.name,
                        concentration: m.concentration,
                        posology: m.posology,
                        duration: m.duration,
                        mip: m.is_mip
                    })),
                    nonPharmacological: c.non_pharmacological || [],
                    generalGuidance: c.general_guidance || []
                };
            });
            
            setSystems(processedSystems);
            setAllConditions(processedConditions);
            setConditionsData(processedConditionsData);
            
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            alert('Erro ao carregar dados do Supabase. Verifique as credenciais.');
        } finally {
            setLoading(false);
        }
    }
    
    // FUNCTIONS
    const toggleFavorite = (conditionId) => {
        const newFavorites = favorites.includes(conditionId)
            ? favorites.filter(id => id !== conditionId)
            : [...favorites, conditionId];
        setFavorites(newFavorites);
        localStorage.setItem('pharmabook_favorites', JSON.stringify(newFavorites));
    };
    
    const getFilteredConditions = () => {
        let filtered = allConditions;
        if (systemFilter) {
            filtered = filtered.filter(c => c.system === systemFilter);
        }
        if (activeTab === 'favoritas') {
            filtered = filtered.filter(c => favorites.includes(c.id));
        } else if (activeTab === 'em-breve') {
            filtered = [];
        }
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(c => 
                c.name.toLowerCase().includes(term) ||
                c.desc.toLowerCase().includes(term)
            );
        }
        return filtered;
    };
    
    const handleConditionClick = (conditionId) => {
        setSelectedCondition(conditionId);
        setView('detail');
    };
    
    const handleSystemClick = (systemId) => {
        setSystemFilter(systemId);
        setActiveTab('todas');
    };
    
    const filteredConditions = getFilteredConditions();
    
    if (loading) {
        return null;
    }
    
    // HOME VIEW
    if (view === 'home') {
        return (
            <div className="app-container">
                <header className="header">
                    <div className="header-left">
                        <div className="logo">💊</div>
                        <div className="brand">
                            <div className="app-title">PHARMABOOK</div>
                            <div className="app-subtitle">Prescrição e Indicação Farmacêutica</div>
                        </div>
                    </div>
                    <div className="header-center">
                        <div className="header-search-box">
                            <span className="header-search-icon">🔍</span>
                            <input
                                type="text"
                                className="header-search-input"
                                placeholder="Buscar condição ou sintoma..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="header-right">
                        <button className="header-btn">📄 Prescrições</button>
                        <button className="header-btn">💊 Bulário</button>
                        <button className="header-btn">👤 Perfil</button>
                    </div>
                </header>
                
                <div className="content-wrapper">
                    <section className="systems-section">
                        <div className="section-header">
                            <h2 className="section-title">Sistemas do Corpo</h2>
                        </div>
                        <div className="systems-grid">
                            {systems.map(system => (
                                <div 
                                    key={system.id} 
                                    className={`system-card ${systemFilter === system.id ? 'active' : ''}`}
                                    onClick={() => handleSystemClick(system.id)}
                                >
                                    <div className="system-icon-wrapper">
                                        <span>{system.icon}</span>
                                    </div>
                                    <div className="system-info">
                                        <div className="system-name">{system.name}</div>
                                        <div className="system-count">{system.count} condições</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                    
                    <div className="tabs">
                        <button 
                            className={`tab ${activeTab === 'todas' ? 'active' : ''}`}
                            onClick={() => { setActiveTab('todas'); setSystemFilter(null); }}
                        >
                            ⭕ Todas
                        </button>
                        <button 
                            className={`tab ${activeTab === 'favoritas' ? 'active' : ''}`}
                            onClick={() => { setActiveTab('favoritas'); setSystemFilter(null); }}
                        >
                            📌 Favoritas ({favorites.length})
                        </button>
                        <button 
                            className={`tab ${activeTab === 'mais-consultadas' ? 'active' : ''}`}
                            onClick={() => { setActiveTab('mais-consultadas'); setSystemFilter(null); }}
                        >
                            📊 Mais Consultadas
                        </button>
                        <button 
                            className={`tab ${activeTab === 'em-breve' ? 'active' : ''}`}
                            onClick={() => { setActiveTab('em-breve'); setSystemFilter(null); }}
                        >
                            ⭐ Em Breve
                        </button>
                    </div>
                    
                    <section className="conditions-section">
                        <div className="conditions-list-header">
                            <h2 className="conditions-list-title">
                                {activeTab === 'todas' && `Todas as Condições (${filteredConditions.length})`}
                                {activeTab === 'favoritas' && `Condições Favoritas (${filteredConditions.length})`}
                                {activeTab === 'mais-consultadas' && 'Mais Consultadas'}
                                {activeTab === 'em-breve' && 'Em Breve'}
                            </h2>
                        </div>
                        
                        {filteredConditions.length > 0 ? (
                            <div className="conditions-list">
                                {filteredConditions.map(condition => (
                                    <div key={condition.id} className="condition-item">
                                        <button 
                                            className="favorite-btn"
                                            onClick={(e) => { e.stopPropagation(); toggleFavorite(condition.id); }}
                                        >
                                            {favorites.includes(condition.id) ? '❤️' : '🤍'}
                                        </button>
                                        <div 
                                            className="condition-content"
                                            onClick={() => handleConditionClick(condition.id)}
                                            style={{ cursor: 'pointer', flex: 1 }}
                                        >
                                            <div className="condition-name">{condition.name}</div>
                                            <div className="condition-desc">{condition.desc}</div>
                                        </div>
                                        <div className="condition-arrow">→</div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="empty-state">
                                <div className="empty-icon">
                                    {activeTab === 'favoritas' && '📌'}
                                    {activeTab === 'em-breve' && '⭐'}
                                    {searchTerm && '🔍'}
                                </div>
                                <div className="empty-title">
                                    {activeTab === 'favoritas' && 'Nenhuma condição favoritada'}
                                    {activeTab === 'em-breve' && 'Em desenvolvimento'}
                                    {searchTerm && 'Nenhuma condição encontrada'}
                                </div>
                            </div>
                        )}
                    </section>
                </div>
            </div>
        );
    }
    
    // DETAIL VIEW
    if (view === 'detail') {
        const condition = conditionsData[selectedCondition];
        
        if (!condition) {
            return <div className="loading">Condição não encontrada</div>;
        }
        
        return (
            <div className="app-container">
                <header className="header">
                    <button className="back-btn" onClick={() => setView('home')}>←</button>
                    <div className="header-left">
                        <div className="logo">💊</div>
                        <div className="brand">
                            <div className="app-title">PHARMABOOK</div>
                            <div className="app-subtitle">Prescrição e Indicação Farmacêutica</div>
                        </div>
                    </div>
                </header>
                
                <div className="detail-container">
                    <div className="detail-header">
                        <h1 className="detail-title">{condition.name}</h1>
                        <p className="detail-system">{condition.system}</p>
                    </div>
                    
                    <div className="detail-section">
                        <h2 className="detail-section-title">📋 Definição</h2>
                        <p>{condition.definition}</p>
                    </div>
                    
                    <div className="detail-section">
                        <h2 className="detail-section-title">🔍 Sintomas</h2>
                        <ul className="detail-list">
                            {condition.symptoms.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                    </div>
                    
                    <div className="detail-section">
                        <h2 className="detail-section-title">🎯 Objetivos Terapêuticos</h2>
                        <ul className="detail-list">
                            {condition.objectives.map((o, i) => <li key={i}>{o}</li>)}
                        </ul>
                    </div>
                    
                    <div className="action-buttons">
                        <button className="button button-secondary" onClick={() => setView('home')}>
                            ← Voltar
                        </button>
                    </div>
                </div>
            </div>
        );
    }
    
    return null;
}

ReactDOM.render(<App />, document.getElementById('root'));
