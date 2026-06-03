// --- BLOCO 1: CONFIGURAÇÃO E VARIÁVEIS ---
const firebaseConfig = { apiKey: "AIzaSyA3obnKmTrF4zH6pdV8ogqZ88r7uACy3BI", authDomain: "workin--music.firebaseapp.com", databaseURL: "https://workin--music-default-rtdb.firebaseio.com", projectId: "workin--music", storageBucket: "workin--music.firebasestorage.app", messagingSenderId: "588256543173", appId: "1:588256543173:web:eddf01b30628df90ca8bac" };
if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }

const USERS_DATABASE = { "diego@midias.com": { defaultColor: "#11ffcf", firebaseUrl: "https://workin--music-default-rtdb.firebaseio.com/midias.json", ytApiKey: "AIzaSyATXiihPhDZohvy8mJKsAk8vjZ4WkPekmQ" } "diego@canais.com": { defaultColor: "#ff0000", firebaseUrl: "https://workin--music-default-rtdb.firebaseio.com/canais.json", ytApiKey: "AIzaSyD2x7SjdblFqlxQdKHlgfSZA5Nmjb1QbMk" } };

let CONFIG = { YT_API_KEY: "", FIREBASE_URL: "" };
let currentUser = "", database = [], canaisDinamicos = {}, currentView = 'categories', currentPlaylist = [], currentTrackIndex = 0, ytPlayer = null, playerVolumeAnterior = 100, playerEstaMutado = false;

function obterUrlNodoItem(idItem = null) { return idItem ? `${CONFIG.FIREBASE_URL.replace(".json", "")}/${idItem}.json` : CONFIG.FIREBASE_URL; }
function obterUrlBaseCanais() { return new URL(CONFIG.FIREBASE_URL).origin + "/canais_dinamicos.json"; }
function obterUrlCanalIndividual(nodeName) { return new URL(CONFIG.FIREBASE_URL).origin + "/canais_dinamicos/" + nodeName + ".json"; }
// --- BLOCO 2: AUTENTICAÇÃO E TEMAS ---
function aplicarCorTema(hexColor) {
    document.documentElement.style.setProperty('--theme-color', hexColor);
    const txtHex = document.getElementById('theme-color-hex');
    if(txtHex) txtHex.innerText = hexColor.toUpperCase();
}

function carregarTemaDoUsuarioLogado(usuario) {
    let corSalva = localStorage.getItem(`streamhub_theme_${usuario}`);
    if(corSalva) { aplicarCorTema(corSalva); } 
    else {
        let corPadrao = USERS_DATABASE[usuario]?.defaultColor || "#ff0000";
        aplicarCorTema(corPadrao);
    }
    document.body.className = localStorage.getItem(`streamhub_layout_mode_${usuario}`) || "";
}

function checkSession() {
    firebase.auth().onAuthStateChanged((user) => {
        if (user && USERS_DATABASE[user.email.toLowerCase()]) {
            currentUser = user.email.toLowerCase();
            CONFIG.FIREBASE_URL = USERS_DATABASE[currentUser].firebaseUrl;
            CONFIG.YT_API_KEY = USERS_DATABASE[currentUser].ytApiKey;
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('app-container').classList.remove('hidden');
            carregarTemaDoUsuarioLogado(currentUser);
            initApp();
        } else { limparInterfaceLocal(); }
    });
}

function handleLogin() {
    const email = document.getElementById('login-user').value.trim().toLowerCase();
    const pass = document.getElementById('login-pass').value.trim();
    if (!USERS_DATABASE[email]) return alert("Utilizador não autorizado.");
    firebase.auth().signInWithEmailAndPassword(email, pass).catch(e => alert("Erro: " + e.message));
}

function limparInterfaceLocal() {
    document.body.className = "";
    currentUser = "";
    document.getElementById('app-container').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
}
// --- BLOCO 3: INICIALIZAÇÃO E DADOS ---
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
            if (Array.isArray(data)) database = data.filter(i => i !== null); 
            else Object.keys(data).forEach(k => { if (data[k]) database.push({ idFirebase: k, ...data[k] }); });
        }
    } catch (e) { console.error("Erro carga:", e); }
    finally { renderSidebar(); renderMosaic(); setupEventListeners(); }
}

async function carregarCanaisDinamicos() {
    try { 
        const res = await fetch(obterUrlBaseCanais()); 
        canaisDinamicos = await res.json() || {}; 
    } catch (e) { console.error("Erro canais:", e); }
}
// --- BLOCO 4: RENDERIZAÇÃO E PLAYLISTS ---
function renderMosaic() {
    const grid = document.getElementById('mosaic-grid'); 
    if (!grid) return; 
    grid.innerHTML = '';
    
    if (currentView === 'categories') {
        const cats = [...new Set(database.map(i => i.categoria))];
        Object.keys(canaisDinamicos).forEach(k => { try { const c = decodeURIComponent(escape(atob(k))); if(!cats.includes(c)) cats.push(c); } catch(e){} });
        cats.sort().forEach(cat => {
            const node = btoa(unescape(encodeURIComponent(cat))).replace(/=/g, "");
            const thumb = database.find(i => i.categoria === cat)?.capa || canaisDinamicos[node]?.thumb || '';
            grid.appendChild(createCard(cat, thumb, false, false, () => { selectedCategory = cat; currentView = 'subcategories'; renderMosaic(); }));
        });
    } else if (currentView === 'search_results') {
        lastYtSearchResults.forEach(item => {
            const isPl = item.type === 'playlist';
            const card = createCard(item.title, item.thumb, true, isPl, null);
            const btnPlay = document.createElement('button');
            btnPlay.innerHTML = '<i class="fas fa-play"></i> Assistir';
            btnPlay.style.background = '#2980b9';
            btnPlay.onclick = () => {
                const url = isPl ? `https://www.youtube.com/embed/videoseries?list=${item.youtubeId}` : `https://www.youtube.com/embed/${item.youtubeId}`;
                currentPlaylist = [{ título: item.title, link: url }];
                playTrack(0);
            };
            card.appendChild(btnPlay);
            grid.appendChild(card);
        });
    }
}

function createCard(title, imgSrc, showAdd = false, isPl = false, click) {
    const card = document.createElement('div'); card.className = 'card';
    card.innerHTML = `<img src="${imgSrc || 'https://placehold.co/160x90?text=Sem+Capa'}"><h4>${title}</h4>`;
    if(click) card.onclick = click;
    return card;
}
// --- BLOCO 5: PLAYER, BUSCA DE CANAIS E EVENTOS ---
function playTrack(index) {
    currentTrackIndex = index;
    const track = currentPlaylist[index];
    document.getElementById('player-container').classList.remove('hidden');
    document.getElementById('current-track-title').innerText = track.título;
    const player = document.getElementById('universal-player');
    player.src = track.link;
    player.classList.remove('hidden');
}

function pularProxima() { if(currentTrackIndex + 1 < currentPlaylist.length) playTrack(currentTrackIndex + 1); }
function pularAnterior() { if(currentTrackIndex > 0) playTrack(currentTrackIndex - 1); }

function configurarVolume() {
    const slider = document.getElementById('player-volume-slider');
    slider.oninput = (e) => {
        const val = e.target.value / 100;
        const player = document.getElementById('universal-player');
        if(player) player.volume = val;
    };
}

function configurarEventosBuscaCanal() {
    const input = document.getElementById("search-channel-input");
    const container = document.getElementById("channels-scroll-container");
    
    const buscar = async () => {
        const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=10&q=${encodeURIComponent(input.value)}&key=${CONFIG.YT_API_KEY}`);
        const data = await res.json();
        container.innerHTML = '';
        container.style.display = 'block';
        data.items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'channel-search-item';
            div.innerHTML = `<img src="${item.snippet.thumbnails.default.url}"><div class="info"><h4>${item.snippet.title}</h4></div>`;
            div.onclick = () => { canalSelecionadoProvisorio = { ...item.snippet }; document.getElementById("channel-preview").style.display = "flex"; };
            container.appendChild(div);
        });
    };

    input.onkeypress = (e) => { if(e.key === 'Enter') buscar(); };
}

function setupEventListeners() {
    document.getElementById('search-yt-input').onkeypress = (e) => { if(e.key === 'Enter') searchYouTubeGlobal(e.target.value); };
    document.getElementById('btn-next-track').onclick = pularProxima;
    document.getElementById('btn-prev-track').onclick = pularAnterior;
    document.getElementById('btn-close-player').onclick = () => document.getElementById('player-container').classList.add('hidden');
    configurarVolume();
    configurarEventosBuscaCanal();
}

async function searchYouTubeGlobal(q) {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=20&q=${encodeURIComponent(q)}&key=${CONFIG.YT_API_KEY}`);
    const data = await res.json();
    lastYtSearchResults = data.items.map(i => ({ type: i.id.kind.includes('playlist') ? 'playlist' : 'video', youtubeId: i.id.videoId || i.id.playlistId, title: i.snippet.title, thumb: i.snippet.thumbnails.medium.url }));
    currentView = 'search_results';
    renderMosaic();
}
