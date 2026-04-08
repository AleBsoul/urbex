const SUPABASE_URL = "https://jxtxxlzunjofjzdhcppp.supabase.co";
const SUPABASE_KEY = "sb_publishable_59Q9W66beBPxHmFAsg82Aw_dg9O-KgV"; 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let map, allPins = [], markers = [], currentRoom = null, roomsCache = [], isCustomZone = false;

// MENU MOBILE
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const btn = document.getElementById('mobile-menu-toggle');
    sidebar.classList.toggle('open');
    btn.innerText = sidebar.classList.contains('open') ? "✕" : "☰";
}

// INIZIALIZZAZIONE
async function init() {
    try {
        map = L.map('map').setView([45.4642, 9.1900], 12);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);

        const geocoder = L.Control.geocoder({
            defaultMarkGeocode: false, // Non vogliamo che metta un marker automatico "brutto"
            placeholder: "Cerca indirizzo o luogo...",
            errorMessage: "Nessun risultato trovato.",
            collapsed: false,
            suggestMinLength: 3  // Inizia a suggerire dopo 3 lettere
        })
        .on('markgeocode', function(e) {
            const latlng = e.geocode.center;
            map.setView(latlng, 16); // Sposta la mappa sul luogo trovato
            
            // Opzionale: apri automaticamente la modale per aggiungere un pin in quel punto
            openModal(null, latlng); 
        })
        .addTo(map);


        map.on('click', (e) => { if(currentRoom) openModal(null, e.latlng); });
        
        document.getElementById('search-field').oninput = renderList;
        document.getElementById('pin-form').onsubmit = handleSave;

        const allIds = JSON.parse(localStorage.getItem('urbex_rooms_list') || "[]");
        const lastId = localStorage.getItem('urbex_room_id');

        if (allIds.length === 0) {
            await createAutoRoom();
        } else {
            await refreshRoomsList();
            const idToLoad = (lastId && allIds.includes(lastId)) ? lastId : allIds[0];
            await loadRoom(idToLoad);
        }

        hideLoader();

    } catch (err) {
        console.error("ERRORE CRITICO:", err);
        document.getElementById('room-name').innerText = "Errore Init";
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
        if (window.innerWidth <= 768) {
            document.getElementById('sidebar').classList.remove('open');
            document.getElementById('mobile-menu-toggle').innerText = "☰";
        }
        renderRoomsUI();
        await fetchZones();
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
            const m = L.circleMarker([p.latitude, p.longitude], { 
                radius: 10, 
                fillColor: color, 
                color: '#fff', 
                weight: 2,
                fillOpacity: 0.8 
            }).addTo(map);

            // Crea il link per Google Maps
            const mapsUrl = `https://www.google.com/maps?q=${p.latitude},${p.longitude}`;
            
            // Popup con stile: cliccando sul nome vai su Maps
            const popupContent = `
                <div style="text-align:center; padding:5px;">
                    <strong style="display:block; margin-bottom:5px;">${p.title}</strong>
                    <a href="${mapsUrl}" target="_blank" style="color:#ff4e00; text-decoration:none; font-weight:bold; font-size:0.8rem;">
                        📍 Apri in Google Maps
                    </a>
                </div>
            `;
            
            m.bindPopup(popupContent);
            markers.push(m);
        }
    });
    renderList();
}

function renderList() {
    const term = document.getElementById('search-field').value.toLowerCase();
    const container = document.getElementById('pin-list-container');
    const zones = [...new Set(allPins.map(p => p.zone || 'Generale'))].sort();
    
    // Aggiorna anche il selettore zone nella modale
    document.getElementById('f-zone-select').innerHTML = zones.map(z => `<option value="${z}">${z}</option>`).join('');

    container.innerHTML = zones.map(z => {
        const pins = allPins.filter(p => (p.zone || 'Generale') === z && p.title.toLowerCase().includes(term));
        if (pins.length === 0) return "";
        
        return `<div class="zone-header">${z}</div>` + pins.map(p => {
            const mapsUrl = `https://www.google.com/maps?q=${p.latitude},${p.longitude}`;
            
            return `
                <div class="pin-item ${p.is_completed ? 'completed' : ''}">
                    <div style="cursor:pointer;" onclick="window.open('${mapsUrl}', '_blank')">
                        <b style="color:white; display:block;">${p.title}</b>
                        <small style="color:#888;">${p.description || 'Nessuna descrizione'}</small>
                    </div>
                    <div class="pin-btns">
                        <button onclick="toggleComp('${p.id}', ${p.is_completed})">Stato</button>
                        <button onclick="openModal('${p.id}')">Edit</button>
                        <button onclick="deletePinDB('${p.id}')" style="color:#ff6b6b">Elimina</button>
                    </div>
                </div>
            `;
        }).join('');
    }).join('');
}

function toggleZoneInput(reset = false) {
    const select = document.getElementById('f-zone-select');
    const custom = document.getElementById('f-zone-custom');
    const btn = document.getElementById('btn-toggle-zone');

    if (reset) {
        isCustomZone = false;
        select.classList.remove('hidden');
        custom.classList.add('hidden');
        btn.innerText = "+";
        return;
    }

    if (!isCustomZone) {
        // PASSO ALLA SCRITTURA
        isCustomZone = true;
        select.classList.add('hidden');
        custom.classList.remove('hidden');
        custom.focus();
        btn.innerText = "OK"; // Cambiamo il testo in OK per chiarezza
    } else {
        // CLICCO OK: TORNO AL SELECT E AGGIUNGO TEMPORANEAMENTE LA ZONA
        const val = custom.value.trim();
        if (val !== "") {
            // Crea un'opzione temporanea nel select così la vedi subito
            const opt = document.createElement('option');
            opt.value = val;
            opt.innerHTML = val;
            opt.selected = true;
            select.appendChild(opt);
        }
        
        isCustomZone = false;
        select.classList.remove('hidden');
        custom.classList.add('hidden');
        btn.innerText = "+";
    }
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
    const customZoneValue = document.getElementById('f-zone-custom').value.trim();
    const selectZoneValue = document.getElementById('f-zone-select').value;
    
    let finalZone = (isCustomZone && customZoneValue !== "") ? customZoneValue : selectZoneValue;

    // 1. Se è una zona nuova, salvala nel database delle zone
    if (isCustomZone && customZoneValue !== "") {
        await supabaseClient
            .from('zones')
            .upsert({ name: finalZone, room_id: currentRoom.id }, { onConflict: 'name, room_id' });
    }

    const payload = {
        title: document.getElementById('f-title').value,
        description: document.getElementById('f-desc').value,
        zone: finalZone || 'Generale',
        latitude: document.getElementById('f-lat').value ? parseFloat(document.getElementById('f-lat').value) : null,
        longitude: document.getElementById('f-lng').value ? parseFloat(document.getElementById('f-lng').value) : null,
        room_id: currentRoom.id
    };

    const { error } = id 
        ? await supabaseClient.from('pins').update(payload).eq('id', id) 
        : await supabaseClient.from('pins').insert([payload]);

    if (!error) { 
        closeModal(); 
        await fetchZones(); 
        await fetchPins(); 
    }
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
async function deletePinDB(id) { if(confirm("Elimina pin definitivamente?")) { await supabaseClient.from('pins').delete().eq('id', id); fetchPins(); } }
async function toggleComp(id, s) { await supabaseClient.from('pins').update({ is_completed: !s }).eq('id', id); fetchPins(); }
function copyCode() { navigator.clipboard.writeText(document.getElementById('room-code').innerText); alert("Codice copiato!"); }

function hideLoader() {
    const loader = document.getElementById('loader-wrapper');
    if (loader) {
        loader.classList.add('fade-out');
    }
}


async function renameCurrentRoom() {
    if (!currentRoom) return;

    const newName = prompt("Inserisci il nuovo nome per questa mappa:", currentRoom.name);
    
    // Se l'utente annulla o non scrive nulla, usciamo
    if (!newName || newName.trim() === "" || newName === currentRoom.name) return;

    try {
        // 1. Aggiorna Supabase
        const { data, error } = await supabaseClient
            .from('rooms')
            .update({ name: newName.trim() })
            .eq('id', currentRoom.id)
            .select()
            .single();

        if (error) throw error;

        // 2. Aggiorna lo stato locale
        currentRoom.name = data.name;
        
        // 3. Aggiorna l'interfaccia
        document.getElementById('room-name').innerText = data.name;
        
        // 4. Aggiorna la cache delle stanze e rinfresca la lista nella sidebar
        await refreshRoomsList();
        
        alert("Mappa rinominata con successo!");
    } catch (err) {
        console.error("Errore durante la rinomina:", err);
        alert("Impossibile rinominare la mappa. Riprova.");
    }
}

// fetch delle zone di interesse
async function fetchZones() {
    if (!currentRoom) return;
    const { data, error } = await supabaseClient
        .from('zones')
        .select('name')
        .eq('room_id', currentRoom.id)
        .order('name');
    
    if (!error && data) {
        renderZoneSelect(data.map(z => z.name));
    }
}

function renderZoneSelect(zoneNames) {
    const select = document.getElementById('f-zone-select');
    // Se non ci sono zone, metti almeno 'Generale'
    const finalZones = zoneNames.length > 0 ? zoneNames : ['Generale'];
    select.innerHTML = finalZones.map(z => `<option value="${z}">${z}</option>`).join('');
}

window.onload = init;
