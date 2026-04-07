// 1. CONFIGURAZIONE SUPABASE
const SUPABASE_URL = "https://jxtxxlzunjofjzdhcppp.supabase.co";
const SUPABASE_KEY = "sb_publishable_59Q9W66beBPxHmFAsg82Aw_dg9O-KgV"; 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let map, allPins = [], markers = [], currentRoom = null;
let roomsCache = []; // Cache per le stanze

// 2. GESTIONE MEMORIA LOCALE
function getSavedRoomIds() {
    const saved = localStorage.getItem('urbex_rooms_list');
    return saved ? JSON.parse(saved) : [];
}

function saveRoomIdToList(id) {
    let ids = getSavedRoomIds();
    if (!ids.includes(id)) {
        ids.push(id);
        localStorage.setItem('urbex_rooms_list', JSON.stringify(ids));
    }
    localStorage.setItem('urbex_room_id', id);
}

// 3. INIZIALIZZAZIONE APP
async function init() {
    map = L.map('map').setView([45.4642, 9.1900], 12);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    map.on('click', (e) => {
        if(!currentRoom) return alert("Per favore, crea o entra in una stanza prima!");
        openModal(null, e.latlng);
    });

    document.getElementById('search-field').addEventListener('input', renderList);
    document.getElementById('pin-form').addEventListener('submit', handleSave);

    // Caricamento iniziale corretto
    const lastId = localStorage.getItem('urbex_room_id');
    const allIds = getSavedRoomIds();

    if (allIds.length > 0) {
        await refreshRoomsList(); // Carica i nomi nella cache una volta sola
        if (lastId && allIds.includes(lastId)) {
            await loadRoom(lastId); // Imposta la stanza attiva
        }
    }
}

// 4. LOGICA STANZE (CORRETTA PER EVITARE DUPLICATI)
async function refreshRoomsList() {
    const ids = getSavedRoomIds();
    const listContainer = document.getElementById('rooms-nav-list');
    if(!listContainer) return;

    if (ids.length === 0) {
        listContainer.innerHTML = "<small style='color:#666; padding:10px; display:block;'>Nessuna mappa salvata</small>";
        roomsCache = [];
        return;
    }

    // SCARICA I DATI E SOSTITUISCE LA CACHE (NON AGGIUNGE)
    const { data, error } = await supabaseClient.from('rooms').select('id, name').in('id', ids);
    if (data) {
        roomsCache = data; // Sostituisce interamente la cache con i dati freschi
    }

    renderRoomsUI();
}

function renderRoomsUI() {
    const listContainer = document.getElementById('rooms-nav-list');
    if(!listContainer) return;
    
    // Svuota l'HTML prima di ricostruirlo
    listContainer.innerHTML = roomsCache.map(room => `
        <button class="room-nav-item ${currentRoom?.id === room.id ? 'active' : ''}" 
                onclick="loadRoom('${room.id}')">
            ${room.name}
        </button>
    `).join('');
}

async function loadRoom(id) {
    const { data } = await supabaseClient.from('rooms').select('*').eq('id', id).single();
    if (data) {
        currentRoom = data;
        localStorage.setItem('urbex_room_id', data.id);
        
        document.getElementById('room-name').innerText = data.name;
        document.getElementById('room-code').innerText = data.invite_code;
        
        renderRoomsUI(); // Aggiorna solo la grafica (le classi .active)
        fetchPins();
    }
}

async function createNewRoom() {
    const name = prompt("Nome della nuova stanza:");
    if (!name) return;
    const { data, error } = await supabaseClient.from('rooms').insert([{ name: name }]).select().single();
    if (error) {
        alert("Errore: " + error.message);
    } else {
        saveRoomIdToList(data.id);
        await refreshRoomsList(); // Ricarica tutto correttamente
        setRoom(data);
    }
}

function setRoom(room) {
    currentRoom = room;
    document.getElementById('room-name').innerText = room.name;
    document.getElementById('room-code').innerText = room.invite_code;
    fetchPins();
    renderRoomsUI();
}

async function joinRoomByCode() {
    const code = document.getElementById('join-code-field').value.trim();
    if (!code) return;
    const { data } = await supabaseClient.from('rooms').select('*').eq('invite_code', code).single();
    if (data) {
        saveRoomIdToList(data.id);
        await refreshRoomsList();
        setRoom(data);
        document.getElementById('join-code-field').value = "";
    } else {
        alert("Codice stanza non trovato!");
    }
}

// 5. GESTIONE PIN
async function fetchPins() {
    if (!currentRoom) return;
    const { data } = await supabaseClient.from('pins').select('*').eq('room_id', currentRoom.id);
    allPins = data || [];
    renderAll();
}

function renderAll() {
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    allPins.forEach(p => {
        if (p.latitude && p.longitude) {
            const color = p.is_completed ? '#27ae60' : (p.zone === 'Viaggio Lungo' ? '#ff4e00' : '#4287f5');
            const m = L.circleMarker([p.latitude, p.longitude], { 
                radius: 10, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.8 
            }).addTo(map);
            m.bindPopup(`<b>${p.title}</b><br>${p.description || ''}`);
            markers.push(m);
        }
    });
    renderList();
}

function renderList() {
    const term = document.getElementById('search-field').value.toLowerCase();
    const listContainer = document.getElementById('pin-list-container');
    listContainer.innerHTML = "";
    
    const zones = ["Città", "Fuori Porta", "Viaggio Lungo"];
    zones.forEach(z => {
        const pins = allPins.filter(p => p.zone === z && p.title.toLowerCase().includes(term));
        if (pins.length > 0) {
            const group = document.createElement('div');
            group.className = 'zone-group';
            group.innerHTML = `<div class="zone-header">${z}</div>` + pins.map(p => `
                <div class="pin-item ${p.is_completed ? 'completed' : ''}">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <b>${p.title}</b>
                    </div>
                    <div class="pin-btns">
                        <button onclick="toggleComp('${p.id}', ${p.is_completed})">${p.is_completed ? 'riapri' : 'completa'}</button>
                        <button onclick="openModal('${p.id}')">Modifica</button>
                        <button onclick="deletePin('${p.id}')" style="color: #ff6b6b">Elimina</button>
                    </div>
                </div>
            `).join('');
            listContainer.appendChild(group);
        }
    });
}

// 6. MODALE E SALVATAGGIO
function openModal(id = null, latlng = null) {
    const modal = document.getElementById('modal-overlay');
    document.getElementById('pin-form').reset();
    document.getElementById('edit-id').value = id || "";
    
    if (id) {
        const p = allPins.find(x => x.id === id);
        document.getElementById('f-title').value = p.title;
        document.getElementById('f-desc').value = p.description;
        document.getElementById('f-zone').value = p.zone;
        document.getElementById('f-danger').value = p.danger_level;
        document.getElementById('f-lat').value = p.latitude || "";
        document.getElementById('f-lng').value = p.longitude || "";
    } else if (latlng) {
        document.getElementById('f-lat').value = latlng.lat.toFixed(6);
        document.getElementById('f-lng').value = latlng.lng.toFixed(6);
    }
    modal.classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
}

async function handleSave(e) {
    e.preventDefault();
    const id = document.getElementById('edit-id').value;
    
    const latVal = document.getElementById('f-lat').value;
    const lngVal = document.getElementById('f-lng').value;

    const payload = {
        title: document.getElementById('f-title').value,
        description: document.getElementById('f-desc').value,
        zone: document.getElementById('f-zone').value,
        danger_level: parseInt(document.getElementById('f-danger').value),
        latitude: latVal !== "" ? parseFloat(latVal) : null,
        longitude: lngVal !== "" ? parseFloat(lngVal) : null,
        room_id: currentRoom.id
    };

    const { error } = id 
        ? await supabaseClient.from('pins').update(payload).eq('id', id)
        : await supabaseClient.from('pins').insert([payload]);

    if (!error) { 
        closeModal(); 
        fetchPins(); 
    } else { 
        alert("Errore salvataggio: " + error.message); 
    }
}

async function deletePin(id) {
    if (confirm("Eliminare definitivamente questo posto?")) {
        await supabaseClient.from('pins').delete().eq('id', id);
        fetchPins();
    }
}

async function toggleComp(id, status) {
    await supabaseClient.from('pins').update({ is_completed: !status }).eq('id', id);
    fetchPins();
}

function copyCode() {
    const code = document.getElementById('room-code').innerText;
    if (code === "----") return;
    navigator.clipboard.writeText(code);
    alert("Codice copiato!");
}

window.onload = init;