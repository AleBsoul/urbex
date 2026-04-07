const SUPABASE_URL = "https://jxtxxlzunjofjzdhcppp.supabase.co";
const SUPABASE_KEY = "sb_publishable_59Q9W66beBPxHmFAsg82Aw_dg9O-KgV"; 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let map, allPins = [], markers = [], currentRoom = null, roomsCache = [], isCustomZone = false;

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const btn = document.getElementById('mobile-menu-toggle');
    sidebar.classList.toggle('open');
    btn.innerText = sidebar.classList.contains('open') ? "✕" : "☰";
}

async function init() {
    try {
        map = L.map('map').setView([45.4642, 9.1900], 12);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);

        map.on('click', (e) => { if(currentRoom) openModal(null, e.latlng); });
        
        document.getElementById('search-field').oninput = renderList;
        document.getElementById('pin-form').onsubmit = handleSave;

        const allIds = JSON.parse(localStorage.getItem('urbex_rooms_list') || "[]");
        const lastId = localStorage.getItem('urbex_room_id');

        if (allIds.length === 0) {
            await createAutoRoom();
        } else {
            await refreshRoomsList();
            const idToLoad = lastId && allIds.includes(lastId) ? lastId : allIds[0];
            await loadRoom(idToLoad);
        }
    } catch (err) {
        document.getElementById('room-name').innerText = "Errore Init";
        console.error(err);
    }
}

async function createAutoRoom() {
    const { data } = await supabaseClient.from('rooms').insert([{ name: "Mappa Personale 🏠" }]).select().single();
    if (data) {
        const ids = [data.id];
        localStorage.setItem('urbex_rooms_list', JSON.stringify(ids));
        await refreshRoomsList();
        await loadRoom(data.id);
    }
}

async function refreshRoomsList() {
    const ids = JSON.parse(localStorage.getItem('urbex_rooms_list') || "[]");
    if (ids.length === 0) return;
    const { data } = await supabaseClient.from('rooms').select('id, name').in('id', ids);
    if (data) {
        roomsCache = data;
        renderRoomsUI();
    }
}

function renderRoomsUI() {
    const list = document.getElementById('rooms-nav-list');
    list.innerHTML = roomsCache.map(r => `
        <div class="room-nav-item ${currentRoom?.id === r.id ? 'active' : ''}" onclick="loadRoom('${r.id}')">
            <span>${r.name}</span>
            <button class="btn-delete-room" onclick="deleteRoom(event, '${r.id}')" title="Elimina mappa">✕</button>
        </div>
    `).join('');
}

async function loadRoom(id) {
    const { data } = await supabaseClient.from('rooms').select('*').eq('id', id).single();
    if (data) {
        currentRoom = data;
        localStorage.setItem('urbex_room_id', id);
        document.getElementById('room-name').innerText = data.name;
        document.getElementById('room-code').innerText = data.invite_code;
        if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');
        renderRoomsUI();
        fetchPins();
    }
}

async function deleteRoom(e, id) {
    e.stopPropagation();
    if (!confirm("Rimuovere questa mappa dalla tua lista?")) return;
    
    let ids = JSON.parse(localStorage.getItem('urbex_rooms_list') || "[]");
    ids = ids.filter(i => i !== id);
    localStorage.setItem('urbex_rooms_list', JSON.stringify(ids));

    if (currentRoom?.id === id) {
        ids.length > 0 ? await loadRoom(ids[0]) : await createAutoRoom();
    }
    await refreshRoomsList();
}

async function fetchPins() {
    const { data } = await supabaseClient.from('pins').select('*').eq('room_id', currentRoom.id);
    allPins = data || [];
    renderAll();
}

function renderAll() {
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    allPins.forEach(p => {
        if (p.latitude && p.longitude) {
            const color = p.is_completed ? '#27ae60' : '#4287f5';
            const m = L.circleMarker([p.latitude, p.longitude], { radius: 10, fillColor: color, color: '#fff', fillOpacity: 0.8 }).addTo(map);
            m.bindPopup(`<b>${p.title}</b>`);
            markers.push(m);
        }
    });
    renderList();
}

function renderList() {
    const term = document.getElementById('search-field').value.toLowerCase();
    const container = document.getElementById('pin-list-container');
    const zones = [...new Set(allPins.map(p => p.zone || 'Generale'))].sort();
    
    const select = document.getElementById('f-zone-select');
    const currentZone = select.value;
    select.innerHTML = zones.map(z => `<option value="${z}">${z}</option>`).join('');
    if (zones.includes(currentZone)) select.value = currentZone;

    container.innerHTML = zones.map(z => {
        const pins = allPins.filter(p => (p.zone || 'Generale') === z && p.title.toLowerCase().includes(term));
        if (pins.length === 0) return "";
        return `<div class="zone-header">📂 ${z}</div>` + pins.map(p => `
            <div class="pin-item ${p.is_completed ? 'completed' : ''}">
                <div style="display:flex; justify-content:space-between"><b>${p.title}</b> <small>${p.latitude ? '📍' : '📝'}</small></div>
                <div class="pin-btns">
                    <button onclick="toggleComp('${p.id}', ${p.is_completed})">${p.is_completed ? 'Riapri' : 'Fatto'}</button>
                    <button onclick="openModal('${p.id}')">Edit</button>
                    <button onclick="deletePin('${p.id}')" style="color:#ff6b6b">Elimina</button>
                </div>
            </div>
        `).join('');
    }).join('');
}

function toggleZoneInput(reset = false) {
    isCustomZone = reset ? false : !isCustomZone;
    document.getElementById('f-zone-select').classList.toggle('hidden', isCustomZone);
    document.getElementById('f-zone-custom').classList.toggle('hidden', !isCustomZone);
    document.getElementById('btn-toggle-zone').innerText = isCustomZone ? "↩" : "+";
}

function openModal(id = null, latlng = null) {
    toggleZoneInput(true);
    document.getElementById('pin-form').reset();
    document.getElementById('edit-id').value = id || "";
    if (id) {
        const p = allPins.find(x => x.id === id);
        document.getElementById('f-title').value = p.title;
        document.getElementById('f-desc').value = p.description;
        document.getElementById('f-zone-select').value = p.zone;
        document.getElementById('f-lat').value = p.latitude || "";
        document.getElementById('f-lng').value = p.longitude || "";
    } else if (latlng) {
        document.getElementById('f-lat').value = latlng.lat.toFixed(6);
        document.getElementById('f-lng').value = latlng.lng.toFixed(6);
    }
    document.getElementById('modal-overlay').classList.remove('hidden');
}

async function handleSave(e) {
    e.preventDefault();
    const id = document.getElementById('edit-id').value;
    const zone = isCustomZone ? document.getElementById('f-zone-custom').value : document.getElementById('f-zone-select').value;
    const payload = {
        title: document.getElementById('f-title').value,
        description: document.getElementById('f-desc').value,
        zone: zone || 'Generale',
        latitude: document.getElementById('f-lat').value ? parseFloat(document.getElementById('f-lat').value) : null,
        longitude: document.getElementById('f-lng').value ? parseFloat(document.getElementById('f-lng').value) : null,
        room_id: currentRoom.id
    };
    const { error } = id ? await supabaseClient.from('pins').update(payload).eq('id', id) : await supabaseClient.from('pins').insert([payload]);
    if (!error) { closeModal(); fetchPins(); }
}

async function createNewRoom() {
    const name = prompt("Nome Mappa:");
    if (!name) return;
    const { data } = await supabaseClient.from('rooms').insert([{ name }]).select().single();
    if (data) {
        const ids = JSON.parse(localStorage.getItem('urbex_rooms_list') || "[]");
        ids.push(data.id);
        localStorage.setItem('urbex_rooms_list', JSON.stringify(ids));
        await refreshRoomsList();
        loadRoom(data.id);
    }
}

async function joinRoomByCode() {
    const code = document.getElementById('join-code-field').value.trim();
    const { data } = await supabaseClient.from('rooms').select('*').eq('invite_code', code).single();
    if (data) {
        const ids = JSON.parse(localStorage.getItem('urbex_rooms_list') || "[]");
        if(!ids.includes(data.id)) ids.push(data.id);
        localStorage.setItem('urbex_rooms_list', JSON.stringify(ids));
        await refreshRoomsList();
        loadRoom(data.id);
    }
}

function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); }
async function deletePin(id) { if(confirm("Elimina pin definitivamente?")) { await supabaseClient.from('pins').delete().eq('id', id); fetchPins(); } }
async function toggleComp(id, s) { await supabaseClient.from('pins').update({ is_completed: !s }).eq('id', id); fetchPins(); }
function copyCode() { navigator.clipboard.writeText(document.getElementById('room-code').innerText); alert("Codice copiato!"); }

window.onload = init;2