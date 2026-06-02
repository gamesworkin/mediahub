// ==========================================
// CONFIGURAÇÃO INICIAL E CREDENCIAIS DO FIREBASE
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyA3obnKmTrF4zH6pdV8ogqZ88r7uACy3BI", 
    authDomain: "workin--music.firebaseapp.com",
    databaseURL: "https://workin--music-default-rtdb.firebaseio.com",
    projectId: "workin--music",
    storageBucket: "workin--music.firebasestorage.app",
    messagingSenderId: "588256543173",
    appId: "1:588256543173:web:eddf01b30628df90ca8bac"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const USERS_DATABASE = {
    "diego@midias.com": { 
        defaultColor: "#11ffcf",
        firebaseUrl: "https://workin--music-default-rtdb.firebaseio.com/midias.json",
        ytApiKey: "AIzaSyATXiihPhDZohvy8mJKsAk8vjZ4WkPekmQ"
    },
    "diego@canais.com": { 
        defaultColor: "#ff0000",
        firebaseUrl: "https://workin--music-default-rtdb.firebaseio.com/canais.json",
        ytApiKey: "AIzaSyD2x7SjdblFqlxQdKHlgfSZA5Nmjb1QbMk"
    }
};

// Variáveis de Configuração Ativa
let CONFIG = {
    YT_API_KEY: "",
    FIREBASE_URL: ""
};

// Estado Global da Aplicação
let currentUser = "";
let database = [];
let canaisDinamicos = {};
let currentView = 'categories'; 
let selectedCategory = '';
let selectedSubcategory = '';
let currentPlaylist = [];
let currentTrackIndex = 0;
let ytPlayer = null;
let lastYtSearchResults = []; 
let activeEditingIndex = null;

// Gestão de Canais Multi-Resultados e Volume (Preparação para as próximas etapas)
let listaCanaisEncontrados = [];
let canalSelecionadoProvisorio = null;
let playerVolumeAnterior = 100;
let playerEstaMutado = false;

// Estados de Expansão Preservados para Tempo Real
let expandedCrudCats = {};
let expandedCrudSubs = {};

function obterUrlNodoItem(idItem = null) {
    let urlSemJson = CONFIG.FIREBASE_URL.replace(".json", "");
    return idItem ? `${urlSemJson}/${idItem}.json` : CONFIG.FIREBASE_URL;
}

function obterUrlBaseCanais() {
    let urlObjeto = new URL(CONFIG.FIREBASE_URL);
    return `${urlObjeto.origin}/canais_dinamicos.json`;
}

function obterUrlCanalIndividual(nodeName) {
    let urlObjeto = new URL(CONFIG.FIREBASE_URL);
    return `${urlObjeto.origin}/canais_dinamicos/${nodeName}.json`;
}

// ==========================================
// MOTOR DE CORES E VISUAL DO UTILIZADOR
// ==========================================
function aplicarCorTema(hexColor) {
    document.documentElement.style.setProperty('--theme-color', hexColor);
    let num = parseInt(hexColor.replace("#",""), 16);
    let r = (num >> 16) - 20; let g = ((num >> 8) & 0x00FF) - 20; let b = (num & 0x0000FF) - 20;
    r = r < 0 ? 0 : r; g = g < 0 ? 0 : g; b = b < 0 ? 0 : b;
    let hexHover = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    document.documentElement.style.setProperty('--theme-color-hover', hexHover);
    const txtHex = document.getElementById('theme-color-hex');
    if(txtHex) txtHex.innerText = hexColor.toUpperCase();
}

function posicionarSetaPelaCor(hexColor) {
    const selector = document.getElementById('color-spectrum-selector'); if (!selector) return;
    if(hexColor.toLowerCase() === "#ff0000" || hexColor.toLowerCase() === "#e50914") selector.style.left = "12%";
    if(hexColor.toLowerCase() === "#00f0ff") selector.style.left = "50%";
}

function carregarTemaDoUsuarioLogado(usuario) {
    let corSalva = localStorage.getItem(`streamhub_theme_${usuario}`);
    if(corSalva) { aplicarCorTema(corSalva); posicionarSetaPelaCor(corSalva); } 
    else {
        let corPadrao = USERS_DATABASE[usuario] ? USERS_DATABASE[usuario].defaultColor : "#ff0000";
        aplicarCorTema(corPadrao); posicionarSetaPelaCor(corPadrao);
    }
    
    let visualSalvo = localStorage.getItem(`streamhub_layout_mode_${usuario}`);
    if(visualSalvo) {
        document.body.className = visualSalvo;
    } else {
        document.body.className = ""; 
    }
}

// ==========================================
// 1. SESSÃO E CONTRÔLO DE ACESSO (FIREBASE AUTH)
// ==========================================
function checkSession() {
    firebase.auth().onAuthStateChanged((user) => {
        if (user && user.email) {
            const emailLogado = user.email.toLowerCase();
            if (USERS_DATABASE[emailLogado]) {
                currentUser = emailLogado;
                CONFIG.FIREBASE_URL = USERS_DATABASE[currentUser].firebaseUrl;
                CONFIG.YT_API_KEY = USERS_DATABASE[currentUser].ytApiKey;
                
                document.getElementById('login-screen').classList.add('hidden');
                document.getElementById('app-container').classList.remove('hidden');
                carregarTemaDoUsuarioLogado(currentUser);
                initApp();
                return;
            }
        }
        limparInterfaceLocal();
    });
}

function configurarEventosLogin() {
    const inputUser = document.getElementById('login-user');
    const inputPass = document.getElementById('login-pass');
    const btnLogin = document.getElementById('btn-login');

    if (inputUser) {
        inputUser.onkeydown = null;
        inputUser.onkeydown = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); if (inputPass) inputPass.focus(); }
        };
    }
    if (inputPass) {
        inputPass.onkeydown = null;
        inputPass.onkeydown = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleLogin(); }
        };
    }
    if (btnLogin) {
        btnLogin.onclick = (e) => { e.preventDefault(); handleLogin(); };
    }
}

function handleLogin() {
    const elUser = document.getElementById('login-user');
    const elPass = document.getElementById('login-pass');
    if(!elUser || !elPass) return;

    const inputEmail = elUser.value.trim().toLowerCase();
    const inputPass = elPass.value.trim();

    if (!inputEmail || !inputPass) return alert("Preencha todos os campos!");
    if (!USERS_DATABASE[inputEmail]) return alert("Utilizador sem perfil neste painel!");

    const btnLogin = document.getElementById('btn-login');
    btnLogin.innerText = "Autenticando..."; btnLogin.disabled = true;

    firebase.auth().signInWithEmailAndPassword(inputEmail, inputPass)
        .catch((error) => {
            alert("Erro na Autenticação: " + error.message);
            btnLogin.innerText = "Entrar no Painel"; btnLogin.disabled = false;
        });
}

function handleLogoutActions() {
    firebase.auth().signOut().then(() => { limparInterfaceLocal(); });
}

function limparInterfaceLocal() {
    document.body.className = ""; 
    currentUser = ""; CONFIG.FIREBASE_URL = ""; CONFIG.YT_API_KEY = "";
    if (ytPlayer) { try { ytPlayer.stopVideo(); } catch(e){} }
    if (document.getElementById('universal-player')) document.getElementById('universal-player').src = "";
    if (document.getElementById('raw-player')) { document.getElementById('raw-player').pause(); document.getElementById('raw-player').src = ""; }
    if (document.getElementById('login-user')) document.getElementById('login-user').value = "";
    if (document.getElementById('login-pass')) document.getElementById('login-pass').value = "";
    if (document.getElementById('btn-login')) { document.getElementById('btn-login').innerText = "Entrar no Painel"; document.getElementById('btn-login').disabled = false; }
    if (document.getElementById('app-container')) document.getElementById('app-container').classList.add('hidden');
    if (document.getElementById('login-screen')) document.getElementById('login-screen').classList.remove('hidden');
}
// ==========================================
// 2. RECUPERAÇÃO DO BANCO DE DADOS E CANAIS
// ==========================================
async function initApp() { 
    await carregarCanaisDinamicos(); 
    await recarregarDadosDoBanco(); 
}

async function recarregarDadosDoBanco() {
    try {
        const res = await fetch(CONFIG.FIREBASE_URL); 
        const data = await res.json(); 
        database = [];
        if (data) {
            if (Array.isArray(data)) { 
                database = data.filter(item => item !== null); 
            } else { 
                Object.keys(data).forEach(key => { 
                    if (data[key]) database.push({ idFirebase: key, ...data[key] }); 
                }); 
            }
        }
    } catch (e) { console.log("Erro ao carregar mídias.", e); }
    finally { 
        renderSidebar(); 
        renderMosaic(); 
        setupEventListeners(); 
        alimentarSeletorCategoriasCanais(); 
    }
}

async function carregarCanaisDinamicos() {
    try { 
        const res = await fetch(obterUrlBaseCanais()); 
        const data = await res.json(); 
        canaisDinamicos = data || {}; 
    } catch (e) { console.error("Erro canais:", e); }
}

function alimentarSeletorCategoriasCanais() {
    const select = document.getElementById("channel-target-category"); 
    if (!select) return; 
    select.innerHTML = "";
    
    const categories = [...new Set(database.map(item => item.categoria))];
    Object.keys(canaisDinamicos).forEach(key => { 
        try { 
            const catNome = decodeURIComponent(escape(atob(key))); 
            if(!categories.includes(catNome)) categories.push(catNome); 
        } catch(e){} 
    });
    
    categories.sort();
    if(categories.length === 0) { 
        select.innerHTML = `<option value="">Nenhuma categoria encontrada.</option>`; 
        return; 
    }
    categories.forEach(cat => { 
        const opt = document.createElement("option"); 
        opt.value = cat; 
        opt.innerText = cat; 
        select.appendChild(opt); 
    });
}
// ==========================================
// 3. RENDERIZAÇÃO DO MOSAICO E CARDS
// ==========================================
function renderMosaic() {
    const grid = document.getElementById('mosaic-grid'); 
    if (!grid) return; 
    grid.innerHTML = '';
    const bcCat = document.getElementById('bc-category'); 
    const bcSub = document.getElementById('bc-subcategory'); 
    const bcSrc = document.getElementById('bc-search');
    if (bcCat) bcCat.classList.add('hidden'); 
    if (bcSub) bcSub.classList.add('hidden'); 
    if (bcSrc) bcSrc.classList.add('hidden');

    if (currentView === 'categories') {
        const categories = [...new Set(database.map(item => item.categoria))];
        Object.keys(canaisDinamicos).forEach(key => { try { const c = decodeURIComponent(escape(atob(key))); if(!categories.includes(c)) categories.push(c); } catch(e){} });
        categories.sort().forEach(cat => {
            if(!cat) return; 
            const match = database.find(item => item.categoria === cat); 
            const nodeName = btoa(unescape(encodeURIComponent(cat))).replace(/=/g, "");
            const thumbCapa = match ? match.capa : (canaisDinamicos[nodeName] ? canaisDinamicos[nodeName].thumb : '');
            grid.appendChild(createCard(cat, thumbCapa, false, false, () => { selectedCategory = cat; currentView = 'subcategories'; renderMosaic(); }, -1));
        });
    } 
    else if (currentView === 'subcategories') {
        if (bcCat) { bcCat.classList.remove('hidden'); bcCat.querySelector('.txt').innerText = selectedCategory; }
        const subcategories = [...new Set(database.filter(item => item.categoria === selectedCategory).map(item => item.subcategoria))];
        const nodeName = btoa(unescape(encodeURIComponent(selectedCategory))).replace(/=/g, "");
        if (canaisDinamicos[nodeName] && !subcategories.includes("Vídeos Recentes")) subcategories.push("Vídeos Recentes");
        
        subcategories.sort().forEach(sub => {
            const match = database.find(item => item.categoria === selectedCategory && item.subcategoria === sub);
            grid.appendChild(createCard(sub, match ? match.capa : (canaisDinamicos[nodeName] ? canaisDinamicos[nodeName].thumb : ''), false, false, () => { selectedSubcategory = sub; currentView = 'tracks'; renderMosaic(); }, -1));
        });
    } 
    else if (currentView === 'tracks') {
        if (bcCat) { bcCat.classList.remove('hidden'); bcCat.querySelector('.txt').innerText = selectedCategory; }
        if (bcSub) { bcSub.classList.remove('hidden'); bcSub.querySelector('.txt').innerText = selectedSubcategory; }

        if (selectedSubcategory === "Vídeos Recentes") {
            const nodeName = btoa(unescape(encodeURIComponent(selectedCategory))).replace(/=/g, "");
            if (canaisDinamicos[nodeName]) buscarVideosRecentesDoCanal(canaisDinamicos[nodeName].uploadsPlaylistId);
        } else {
            currentPlaylist = database.filter(item => item.categoria === selectedCategory && item.subcategoria === selectedSubcategory);
            currentPlaylist.forEach((track, index) => {
                const realIndex = database.findIndex(dbItem => dbItem.link === track.link && dbItem.título === track.título);
                grid.appendChild(createCard(track.título, track.capa, false, false, () => { playTrack(index); }, realIndex));
            });
        }
    }
    else if (currentView === 'search_results') {
        if (bcSrc) bcSrc.classList.remove('hidden');
        lastYtSearchResults.forEach(item => {
            const isPlaylist = item.type === 'playlist'; 
            const card = createCard(item.title, item.thumb, true, isPlaylist, null, -1);
            
            if (card.querySelector('.add-music-badge')) { 
                card.querySelector('.add-music-badge').onclick = (e) => { e.preventDefault(); e.stopPropagation(); openAdminWithTrack(item); }; 
            }
            
            const btnGroup = document.createElement('div'); btnGroup.className = 'search-btn-group';
            const btnPlay = document.createElement('button'); btnPlay.style.background = '#2980b9'; btnPlay.innerHTML = `<i class="fas fa-play"></i> Assistir`;
            
            btnPlay.onclick = (e) => {
                e.preventDefault(); e.stopPropagation();
                // Correção de URL para reprodução de playlists na busca
                const linkReproducao = isPlaylist ? `https://www.youtube.com/embed/videoseries?list=${item.youtubeId}` : `https://www.youtube.com/embed/${item.youtubeId}`;
                currentPlaylist = [{ título: item.title, link: linkReproducao }]; 
                playTrack(0);
            };
            
            btnGroup.appendChild(btnPlay);
            
            if(isPlaylist) {
                const btnList = document.createElement('button'); btnList.style.background = '#8e44ad'; btnList.innerHTML = `<i class="fas fa-list"></i> Ver Mídias`;
                btnList.onclick = (e) => { e.preventDefault(); e.stopPropagation(); peekPlaylistContents(item.youtubeId); }; 
                btnGroup.appendChild(btnList);
            }
            card.appendChild(btnGroup); 
            grid.appendChild(card);
        });
    }
}

function createCard(title, imgSrc, showAddButton = false, isPlaylist = false, clickCallback, realIndex = -1) {
    const card = document.createElement('div'); card.className = 'card';
    let htmlContent = `<img src="${imgSrc || 'https://placehold.co/160x90?text=Sem+Capa'}"><h4>${title}</h4>`;
    if(isPlaylist) htmlContent += `<span class="media-type-badge"><i class="fas fa-photo-film"></i> Playlist</span>`;
    if(showAddButton) htmlContent += `<button class="add-music-badge"><i class="fas fa-plus"></i> ${isPlaylist ? "Add Playlist" : "Adicionar"}</button>`;
    if(realIndex >= 0) htmlContent += `<div class="quick-edit-badge" title="Editar"><i class="fas fa-cog"></i></div>`;
    card.innerHTML = htmlContent;
    if(clickCallback) card.addEventListener('click', clickCallback);
    if(realIndex >= 0 && card.querySelector('.quick-edit-badge')) {
        card.querySelector('.quick-edit-badge').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openAdvancedEditModal(realIndex); });
    }
    return card;
}
// ==========================================
// 4. API DE CANAIS E CONTROLES AVANÇADOS DO PLAYER
// ==========================================
async function buscarVideosRecentesDoCanal(playlistId) {
    const grid = document.getElementById('mosaic-grid'); 
    if (grid) grid.innerHTML = '<h3>Atualizando vídeos recentes...</h3>';
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=15&playlistId=${playlistId}&key=${CONFIG.YT_API_KEY}`;
    try {
        const res = await fetch(url); const data = await res.json();
        if(data.items) {
            const itensInvertidos = data.items.reverse();
            currentPlaylist = itensInvertidos.map(item => ({
                título: item.snippet.title, link: `https://www.youtube.com/embed/${item.snippet.resourceId.videoId}`,
                capa: item.snippet.thumbnails.medium ? item.snippet.thumbnails.medium.url : item.snippet.thumbnails.default.url,
                categoria: selectedCategory, subcategoria: "Vídeos Recentes"
            }));
            if (grid) { 
                grid.innerHTML = ''; 
                currentPlaylist.forEach((track, index) => { grid.appendChild(createCard(track.título, track.capa, false, false, () => { playTrack(index); }, -1)); }); 
            }
        }
    } catch (e) { if (grid) grid.innerHTML = '<h3>Erro ao carregar feeds.</h3>'; }
}

function playTrack(index) {
    if(currentPlaylist.length === 0) return; 
    currentTrackIndex = index; 
    const track = currentPlaylist[index];
    if (document.getElementById('player-container')) document.getElementById('player-container').classList.remove('hidden');
    if (document.getElementById('current-track-title')) document.getElementById('current-track-title').innerText = track.título;

    const ytPlayerEl = document.getElementById('yt-player'); 
    const univPlayerEl = document.getElementById('universal-player'); 
    const rawPlayerEl = document.getElementById('raw-player');
    
    // Reset players
    [univPlayerEl, rawPlayerEl].forEach(p => { if(p) { p.src = ""; p.classList.add('hidden'); p.pause ? p.pause() : null; }});
    if(ytPlayerEl) ytPlayerEl.classList.remove('hidden');

    const linkOriginal = track.link.trim(); 
    const vId = extractYoutubeId(linkOriginal);

    if(vId) {
        if (!ytPlayer) { 
            ytPlayer = new YT.Player('yt-player', { 
                videoId: vId, 
                playerVars: { 'autoplay': 1, 'playsinline': 1, 'enablejsapi': 1 }, 
                events: { 'onStateChange': (e) => { if(e.data === 0) pularProxima(); } } 
            }); 
        } else { ytPlayer.loadVideoById(vId); }
    } else {
        if (rawPlayerEl && (linkOriginal.endsWith('.mp4') || linkOriginal.includes('raw.githubusercontent'))) {
            rawPlayerEl.classList.remove('hidden'); rawPlayerEl.src = linkOriginal; rawPlayerEl.play(); 
            rawPlayerEl.onended = pularProxima;
        } else if (univPlayerEl) {
            univPlayerEl.classList.remove('hidden'); 
            univPlayerEl.src = linkOriginal.includes("archive.org/details/") ? linkOriginal.replace("archive.org/details/", "archive.org/embed/") : linkOriginal;
        }
    }
}

function pularProxima() { if(currentTrackIndex + 1 < currentPlaylist.length) playTrack(currentTrackIndex + 1); }
function pularAnterior() { if(currentTrackIndex > 0) playTrack(currentTrackIndex - 1); }

function configurarVolume() {
    const slider = document.getElementById('player-volume-slider');
    const btnMute = document.getElementById('btn-mute-toggle');
    
    slider.oninput = (e) => {
        const vol = e.target.value;
        if(ytPlayer && ytPlayer.setVolume) ytPlayer.setVolume(vol);
        const raw = document.getElementById('raw-player'); if(raw) raw.volume = vol/100;
        playerVolumeAnterior = vol;
    };
    
    btnMute.onclick = () => {
        if(!playerEstaMutado) {
            playerVolumeAnterior = slider.value;
            slider.value = 0;
            if(ytPlayer && ytPlayer.mute) ytPlayer.mute();
            const raw = document.getElementById('raw-player'); if(raw) raw.muted = true;
            btnMute.innerHTML = '<i class="fas fa-volume-mute"></i>';
            playerEstaMutado = true;
        } else {
            slider.value = playerVolumeAnterior;
            if(ytPlayer && ytPlayer.unMute) { ytPlayer.unMute(); ytPlayer.setVolume(playerVolumeAnterior); }
            const raw = document.getElementById('raw-player'); if(raw) { raw.muted = false; raw.volume = playerVolumeAnterior/100; }
            btnMute.innerHTML = '<i class="fas fa-volume-up"></i>';
            playerEstaMutado = false;
        }
    };
}
// ==========================================
// 5. PESQUISA AVANÇADA DE CANAIS E EVENTOS
// ==========================================
function configurarEventosBuscaCanal() {
    const inputBusca = document.getElementById("search-channel-input");
    const btnSearchChan = document.getElementById("btn-search-channel"); 
    const btnSaveChanLink = document.getElementById("btn-save-channel-link");
    const scrollContainer = document.getElementById("channels-scroll-container");

    const executarBusca = async () => {
        const termo = inputBusca.value.trim(); 
        if(!termo) return alert("Digite o nome.");
        try {
            const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=10&q=${encodeURIComponent(termo)}&key=${CONFIG.YT_API_KEY}`);
            const data = await res.json();
            if(!data.items || data.items.length === 0) return alert("Nenhum canal localizado.");
            
            scrollContainer.innerHTML = '';
            scrollContainer.style.display = 'block';
            data.items.forEach(item => {
                const div = document.createElement('div');
                div.className = 'channel-search-item';
                div.innerHTML = `<img src="${item.snippet.thumbnails.default.url}"><div class="info"><h4>${item.snippet.title}</h4><p>${item.snippet.description}</p></div>`;
                div.onclick = () => {
                    canalSelecionadoProvisorio = { channelId: item.snippet.channelId, title: item.snippet.title, thumb: item.snippet.thumbnails.default.url, description: item.snippet.description };
                    document.getElementById("chan-thumb").src = canalSelecionadoProvisorio.thumb; 
                    document.getElementById("chan-title-text").innerText = canalSelecionadoProvisorio.title;
                    document.getElementById("chan-desc-text").innerText = canalSelecionadoProvisorio.description; 
                    document.getElementById("channel-preview").style.display = "flex";
                };
                scrollContainer.appendChild(div);
            });
        } catch(err) { alert("Erro na API."); }
    };

    if (inputBusca) inputBusca.onkeypress = (e) => { if(e.key === 'Enter') executarBusca(); };
    if (btnSearchChan) btnSearchChan.onclick = (e) => { e.preventDefault(); executarBusca(); };
    
    if (btnSaveChanLink) {
        btnSaveChanLink.onclick = async (e) => {
            e.preventDefault(); const catDestino = document.getElementById("channel-target-category").value; 
            if(!canalSelecionadoProvisorio || !catDestino) return alert("Selecione os dados.");
            try {
                const payload = { channelId: canalSelecionadoProvisorio.channelId, uploadsPlaylistId: canalSelecionadoProvisorio.channelId.replace(/^UC/, "UU"), title: canalSelecionadoProvisorio.title, thumb: canalSelecionadoProvisorio.thumb };
                const nodeName = btoa(unescape(encodeURIComponent(catDestino))).replace(/=/g, "");
                await fetch(obterUrlCanalIndividual(nodeName), { method: "PUT", body: JSON.stringify(payload) });
                alert("Canal vinculado!"); document.getElementById("channel-preview").style.display = "none"; scrollContainer.style.display = "none";
                canalSelecionadoProvisorio = null; initApp();
            } catch(err) { alert("Erro ao salvar."); }
        };
    }
}

function setupEventListeners() {
    if (document.getElementById('search-yt-input')) document.getElementById('search-yt-input').onkeypress = (e) => { if(e.key === 'Enter') searchYouTubeGlobal(e.target.value); };
    if (document.getElementById('toggle-sidebar')) document.getElementById('toggle-sidebar').onclick = (e) => { e.preventDefault(); handleToggleSidebar(); };
    if (document.getElementById('btn-prev-track')) document.getElementById('btn-prev-track').onclick = pularAnterior;
    if (document.getElementById('btn-next-track')) document.getElementById('btn-next-track').onclick = pularProxima;
    if (document.getElementById('bc-root')) document.getElementById('bc-root').onclick = () => { currentView = 'categories'; selectedCategory=''; selectedSubcategory=''; renderMosaic(); };
    
    // Controles de Tema (YouTube, Netflix, Futurista, Claro)
    ['youtube', 'netflix', 'futurista', 'claro'].forEach(tema => {
        const el = document.getElementById(`theme-switch-${tema}`);
        if(el) el.onclick = () => { 
            const className = tema === 'youtube' ? "" : `theme-${tema}`;
            document.body.className = className;
            if(currentUser) localStorage.setItem(`streamhub_layout_mode_${currentUser}`, className);
        };
    });

    configurarEventosBuscaCanal(); 
    inicializarSeletorCoresLinear();
    configurarVolume();
    configurarEventosLogin();
}

// Inicialização Final
configurarEventosLogin(); 
checkSession();
