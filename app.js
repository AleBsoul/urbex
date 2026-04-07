// 1. CONFIGURAZIONE SUPABASE
const SUPABASE_URL = "https://jxtxxlzunjofjzdhcppp.supabase.co";
const SUPABASE_KEY = "sb_publishable_59Q9W66beBPxHmFAsg82Aw_dg9O-KgV"; 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let map, allPins = [], markers = [], currentRoom = null;

// 2. GESTIONE MEMORIA LOCALE (MULTI-STANZA)
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
    localStorage.setItem('urbex_room_id', id); // Imposta come ultima attiva
}

// 3. INIZIALIZZAZIONE APP
async function init() {
    // Setup Mappa Leaflet
    map = L.map('map').setView([45.4642, 9.1900], 12);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    // Evento click sulla mappa per aggiungere pin
    map.on('click', (e) => {
        if(!currentRoom) return alert("Per favore, crea o entra in una stanza prima!");
        openModal(null, e.latlng);
    });

    // Listener eventi UI
    document.getElementById('search-field').addEventListener('input', renderList);
    document.getElementById('pin-form').addEventListener('submit', handleSave);

    // Caricamento iniziale
    const lastId = localStorage.getItem('urbex_room_id');
    if (lastId) {
        await loadRoom(lastId);
    }
    refreshRoomsList();
}

// 4. LOGICA STANZE
async function loadRoom(id) {
    const { data, error } = await supabaseClient.from('rooms').select('*').eq('id', id).single();
    if (data) {
        setRoom(data);
    } else {
        // Se la stanza non esiste più, la rimuoviamo dalla cronologia locale
        let ids = getSavedRoomIds().filter(itemId => itemId !== id);
        localStorage.setItem('urbex_rooms_list', JSON.stringify(ids));
        localStorage.removeItem('urbex_room_id');
        refreshRoomsList();
    }
}

function setRoom(room) {
    currentRoom = room;
    saveRoomIdToList(room.id);
    document.getElementById('room-name').innerText = room.name;
    document.getElementById('room-code').innerText = room.invite_code;
    fetchPins();
    refreshRoomsList();
}

async function refreshRoomsList() {
    const ids = getSavedRoomIds();
    const listContainer = document.getElementById('rooms-nav-list');
    if(!listContainer) return;
    
    listContainer.innerHTML = "";
    if (ids.length === 0) return;

    const { data } = await supabaseClient.from('rooms').select('id, name').in('id', ids);

    if (data) {
        data.forEach(room => {
            const btn = document.createElement('button');
            btn.className = `room-nav-item ${currentRoom?.id === room.id ? 'active' : ''}`;
            btn.innerText = room.name;
            btn.onclick = () => loadRoom(room.id);
            listContainer.appendChild(btn);
        });
    }
}

async function createNewRoom() {
    const name = prompt("Nome della nuova stanza:");
    if (!name) return;
    const { data, error } = await supabaseClient.from('rooms').insert([{ name: name }]).select().single();
    if (error) alert("Errore: " + error.message); 
    else setRoom(data);
}

async function joinRoomByCode() {
    const code = document.getElementById('join-code-field').value.trim();
    if (!code) return;
    const { data, error } = await supabaseClient.from('rooms').select('*').eq('invite_code', code).single();
    if (data) {
        setRoom(data);
        document.getElementById('join-code-field').value = "";
    } else {
        alert("Codice stanza non trovato!");
    }
}

// 5. GESTIONE PIN
async function fetchPins() {
    if (!currentRoom) return;
    const { data, error } = await supabaseClient.from('pins').select('*').eq('room_id', currentRoom.id);
    if (!error) {
        allPins = data || [];
        renderAll();
    }
}

function renderAll() {
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    allPins.forEach(p => {
        const color = p.is_completed ? '#27ae60' : (p.zone === 'Viaggio Lungo' ? '#ff4e00' : '#4287f5');
        const m = L.circleMarker([p.latitude, p.longitude], { 
            radius: 10, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.8 
        }).addTo(map);
        m.bindPopup(`<b>${p.title}</b><br>${p.description || ''}`);
        markers.push(m);
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
                    <b>${p.title}</b>
                    <div class="pin-btns">
                        <button onclick="toggleComp('${p.id}', ${p.is_completed})">${p.is_completed ? 'Riapri' : 'Fatto'}</button>
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
    const form = document.getElementById('pin-form');
    form.reset();
    document.getElementById('edit-id').value = id || "";
    
    if (id) {
        const p = allPins.find(x => x.id === id);
        document.getElementById('f-title').value = p.title;
        document.getElementById('f-desc').value = p.description;
        document.getElementById('f-zone').value = p.zone;
        document.getElementById('f-danger').value = p.danger_level;
        document.getElementById('f-lat').value = p.latitude;
        document.getElementById('f-lng').value = p.longitude;
    } else if (latlng) {
        document.getElementById('f-lat').value = latlng.lat.toFixed(6);
        document.getElementById('f-lng').value = latlng.lng.toFixed(6);
    }
    document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
}

async function handleSave(e) {
    e.preventDefault();
    const id = document.getElementById('edit-id').value;
    const payload = {
        title: document.getElementById('f-title').value,
        description: document.getElementById('f-desc').value,
        zone: document.getElementById('f-zone').value,
        danger_level: parseInt(document.getElementById('f-danger').value),
        latitude: parseFloat(document.getElementById('f-lat').value),
        longitude: parseFloat(document.getElementById('f-lng').value),
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

// 7. AZIONI PIN
async function deletePin(id) {
    if (confirm("Vuoi eliminare definitivamente questo posto?")) {
        const { error } = await supabaseClient.from('pins').delete().eq('id', id);
        if (!error) fetchPins();
    }
}

async function toggleComp(id, status) {
    const { error } = await supabaseClient.from('pins').update({ is_completed: !status }).eq('id', id);
    if (!error) fetchPins();
}

function copyCode() {
    const code = document.getElementById('room-code').innerText;
    if (code === "----") return;
    navigator.clipboard.writeText(code);
    alert("Codice copiato!");
}

window.onload = init;