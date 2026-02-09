const { useState, useEffect } = React;
const supabaseClient = window.pharmabookSupabaseClient;

const slugify = (value) => value
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

function App() {
    // STATES
    const [loading, setLoading] = useState(true);
    const [authLoading, setAuthLoading] = useState(true);
    const [view, setView] = useState('home');
    const [currentPath, setCurrentPath] = useState(window.location.pathname);
    const [session, setSession] = useState(null);
    const [profile, setProfile] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('todas');
    const [systemFilter, setSystemFilter] = useState(null);
    const [authView, setAuthView] = useState('signup');
    const [authMessage, setAuthMessage] = useState('');
    const [authError, setAuthError] = useState('');
    const [formState, setFormState] = useState({
        displayName: '',
        slug: '',
        email: '',
        password: '',
        confirmPassword: ''
    });
    const [authSubmitting, setAuthSubmitting] = useState(false);
    
    // DADOS DO SUPABASE
    const [systems, setSystems] = useState([]);
    const [allConditions, setAllConditions] = useState([]);
    const [conditionsData, setConditionsData] = useState({});
    
    const [favorites, setFavorites] = useState(() => {
        const saved = localStorage.getItem('pharmabook_favorites');
        return saved ? JSON.parse(saved) : [];
    });
    
    const [selectedCondition, setSelectedCondition] = useState(null);
    
    const navigateTo = (path) => {
        if (window.location.pathname !== path) {
            window.history.pushState({}, '', path);
            setCurrentPath(path);
        }
    };
    
    // ROTAS
    useEffect(() => {
        const handlePopState = () => setCurrentPath(window.location.pathname);
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);
    
    // AUTH SESSION
    useEffect(() => {
        let subscription;
        
        const initAuth = async () => {
            const { data } = await supabaseClient.auth.getSession();
            setSession(data.session);
            setAuthLoading(false);
            
            if (data.session) {
                await ensureProfile(data.session.user);
                if (window.location.pathname === '/auth') {
                    navigateTo('/');
                }
            } else if (window.location.pathname !== '/auth') {
                navigateTo('/auth');
            }
        };
        
        initAuth();
        
        const { data: authListener } = supabaseClient.auth.onAuthStateChange(
            async (event, newSession) => {
                setSession(newSession);
                if (newSession?.user) {
                    await ensureProfile(newSession.user);
                }
                if (newSession && window.location.pathname === '/auth') {
                    navigateTo('/');
                }
                if (!newSession && window.location.pathname !== '/auth') {
                    navigateTo('/auth');
                }
            }
        );
        
        subscription = authListener.subscription;
        
        return () => subscription?.unsubscribe();
    }, []);
    
    // CARREGAR DADOS DO SUPABASE
    useEffect(() => {
        if (session) {
            loadData();
        }
    }, [session]);
    
    useEffect(() => {
        if (session && currentPath === '/auth') {
            navigateTo('/');
        }
        if (!session && !authLoading && currentPath !== '/auth') {
            navigateTo('/auth');
        }
    }, [session, currentPath, authLoading]);
    
    async function ensureProfile(user) {
        try {
            const { data, error } = await supabaseClient
                .from('profiles')
                .select('id, slug, display_name, plan')
                .eq('id', user.id)
                .single();
            
            if (error && error.code !== 'PGRST116') {
                throw error;
            }
            
            if (!data) {
                const metadata = user.user_metadata || {};
                const displayName = metadata.display_name || metadata.full_name || user.email?.split('@')[0] || 'Usuário';
                const slug = metadata.slug || slugify(displayName) || `user-${user.id.slice(0, 8)}`;
                const { data: createdProfile, error: insertError } = await supabaseClient
                    .from('profiles')
                    .insert({
                        id: user.id,
                        slug,
                        display_name: displayName,
                        plan: 'free'
                    })
                    .select('id, slug, display_name, plan')
                    .single();
                
                if (insertError) throw insertError;
                setProfile(createdProfile);
            } else {
                setProfile(data);
            }
        } catch (error) {
            console.error('Erro ao carregar perfil:', error);
        }
    }
    
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
    
    if (authLoading) {
        return null;
    }
    
    if (currentPath === '/auth') {
        return (
            <div className="auth-page">
                <div className="auth-shell">
                    <div className="auth-brand">
                        <div className="auth-logo">💊</div>
                        <h1>PHARMABOOK</h1>
                        <p>Crie sua conta e tenha um ambiente exclusivo para suas prescrições e indicações.</p>
                        <div className="auth-benefits">
                            <div className="auth-benefit">🔒 Dados seguros no seu perfil</div>
                            <div className="auth-benefit">📚 Acesso completo às condições clínicas</div>
                            <div className="auth-benefit">⚡ Fluxo rápido para atendimento</div>
                        </div>
                    </div>
                    <div className="auth-card">
                        <div className="auth-tabs">
                            <button
                                className={`auth-tab ${authView === 'signup' ? 'active' : ''}`}
                                onClick={() => { setAuthView('signup'); setAuthError(''); setAuthMessage(''); }}
                                type="button"
                            >
                                Criar conta
                            </button>
                            <button
                                className={`auth-tab ${authView === 'login' ? 'active' : ''}`}
                                onClick={() => { setAuthView('login'); setAuthError(''); setAuthMessage(''); }}
                                type="button"
                            >
                                Entrar
                            </button>
                        </div>
                        
                        <div className="auth-content">
                            <h2>{authView === 'signup' ? 'Vamos criar sua conta' : 'Bem-vindo de volta'}</h2>
                            <p className="auth-subtitle">
                                {authView === 'signup'
                                    ? 'Comece agora e personalize seu perfil.'
                                    : 'Acesse sua conta com seu e-mail e senha.'}
                            </p>
                            
                            {authMessage && <div className="auth-message success">{authMessage}</div>}
                            {authError && <div className="auth-message error">{authError}</div>}
                            
                            <form
                                className="auth-form"
                                onSubmit={async (event) => {
                                    event.preventDefault();
                                    setAuthError('');
                                    setAuthMessage('');
                                    setAuthSubmitting(true);
                                    
                                    try {
                                        const trimmedEmail = formState.email.trim().toLowerCase();
                                        if (!trimmedEmail || !formState.password) {
                                            setAuthError('Preencha o e-mail e a senha.');
                                            return;
                                        }
                                        
                                        if (authView === 'signup') {
                                            if (!formState.displayName.trim()) {
                                                setAuthError('Informe seu nome para criar a conta.');
                                                return;
                                            }
                                            if (formState.password.length < 6) {
                                                setAuthError('A senha precisa ter pelo menos 6 caracteres.');
                                                return;
                                            }
                                            if (formState.password !== formState.confirmPassword) {
                                                setAuthError('As senhas não conferem.');
                                                return;
                                            }
                                            
                                            const displayName = formState.displayName.trim();
                                            const slug = formState.slug.trim() || slugify(displayName);
                                            
                                            const { data, error } = await supabaseClient.auth.signUp({
                                                email: trimmedEmail,
                                                password: formState.password,
                                                options: {
                                                    data: {
                                                        display_name: displayName,
                                                        slug
                                                    },
                                                    emailRedirectTo: `${window.location.origin}/`
                                                }
                                            });
                                            
                                            if (error) throw error;
                                            
                                            if (data.user && data.session) {
                                                const { error: profileError } = await supabaseClient
                                                    .from('profiles')
                                                    .insert({
                                                        id: data.user.id,
                                                        slug,
                                                        display_name: displayName,
                                                        plan: 'free'
                                                    });
                                                
                                                if (profileError && profileError.code !== '23505') {
                                                    throw profileError;
                                                }
                                            }
                                            
                                            if (!data.session) {
                                                setAuthMessage('Conta criada! Verifique seu e-mail para confirmar e acessar.');
                                                setAuthView('login');
                                            }
                                        } else {
                                            const { error } = await supabaseClient.auth.signInWithPassword({
                                                email: trimmedEmail,
                                                password: formState.password
                                            });
                                            if (error) throw error;
                                        }
                                    } catch (error) {
                                        console.error('Erro de autenticação:', error);
                                        const message = error?.message || 'Não foi possível autenticar. Verifique seus dados e tente novamente.';
                                        setAuthError(message);
                                    } finally {
                                        setAuthSubmitting(false);
                                    }
                                }}
                            >
                                {authView === 'signup' && (
                                    <>
                                        <label className="auth-label">
                                            Nome completo
                                            <input
                                                type="text"
                                                placeholder="Ex: Ana Paula"
                                                value={formState.displayName}
                                                onChange={(e) => {
                                                    const value = e.target.value;
                                                    setFormState((prev) => ({
                                                        ...prev,
                                                        displayName: value,
                                                        slug: slugify(value)
                                                    }));
                                                }}
                                                required
                                            />
                                        </label>
                                        <label className="auth-label">
                                            Seu slug (URL única)
                                            <input
                                                type="text"
                                                placeholder="ex: ana-paula"
                                                value={formState.slug}
                                                onChange={(e) => setFormState((prev) => ({ ...prev, slug: e.target.value }))}
                                            />
                                        </label>
                                    </>
                                )}
                                <label className="auth-label">
                                    E-mail
                                    <input
                                        type="email"
                                        placeholder="seu@email.com"
                                        value={formState.email}
                                        onChange={(e) => setFormState((prev) => ({ ...prev, email: e.target.value }))}
                                        required
                                    />
                                </label>
                                <label className="auth-label">
                                    Senha
                                    <input
                                        type="password"
                                        placeholder="Mínimo de 6 caracteres"
                                        value={formState.password}
                                        onChange={(e) => setFormState((prev) => ({ ...prev, password: e.target.value }))}
                                        required
                                    />
                                </label>
                                {authView === 'signup' && (
                                    <label className="auth-label">
                                        Confirmar senha
                                        <input
                                            type="password"
                                            placeholder="Repita sua senha"
                                            value={formState.confirmPassword}
                                            onChange={(e) => setFormState((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                                            required
                                        />
                                    </label>
                                )}
                                <button className="auth-submit" type="submit" disabled={authSubmitting}>
                                    {authSubmitting
                                        ? 'Enviando...'
                                        : authView === 'signup'
                                            ? 'Criar conta'
                                            : 'Entrar'}
                                </button>
                            </form>
                            
                            <div className="auth-footer">
                                {authView === 'signup' ? (
                                    <span>
                                        Já tem conta?{' '}
                                        <button type="button" onClick={() => setAuthView('login')}>
                                            Entrar
                                        </button>
                                    </span>
                                ) : (
                                    <span>
                                        Não tem conta?{' '}
                                        <button type="button" onClick={() => setAuthView('signup')}>
                                            Criar conta
                                        </button>
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
    
    if (!session) {
        return null;
    }
    
    if (loading) {
        return <div className="loading">Carregando dados...</div>;
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
                        <div className="header-user">
                            <span>👋 Olá,</span>
                            <strong>{profile?.display_name || 'Profissional'}</strong>
                        </div>
                        <button className="header-btn">📄 Prescrições</button>
                        <button className="header-btn">💊 Bulário</button>
                        <button
                            className="header-btn"
                            onClick={async () => {
                                await supabaseClient.auth.signOut();
                                navigateTo('/auth');
                            }}
                        >
                            🚪 Sair
                        </button>
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
                    <div className="header-right">
                        <div className="header-user">
                            <span>👋 Olá,</span>
                            <strong>{profile?.display_name || 'Profissional'}</strong>
                        </div>
                        <button
                            className="header-btn"
                            onClick={async () => {
                                await supabaseClient.auth.signOut();
                                navigateTo('/auth');
                            }}
                        >
                            🚪 Sair
                        </button>
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
