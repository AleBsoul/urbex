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
        .on('markgeocode', function (e) {
            const latlng = e.geocode.center;
            map.setView(latlng, 16); // Sposta la mappa sul luogo trovato

            // Opzionale: apri automaticamente la modale per aggiungere un pin in quel punto
            openModal(null, latlng);
        })
        .addTo(map);


        map.on('click', (e) => { if (currentRoom) openModal(null, e.latlng); });

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
    // 1. Pulizia marker esistenti
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    allPins.forEach(p => {
        if (p.latitude && p.longitude) {
            const color = p.is_completed ? '#27ae60' : '#4287f5';
            
            // Creazione del marker
            const m = L.circleMarker([p.latitude, p.longitude], { 
                radius: 10, 
                fillColor: color, 
                color: '#fff', 
                weight: 2,
                fillOpacity: 0.8,
                id: p.id
            }).addTo(map);

            const mapsUrl = `https://www.google.com/maps?q=${p.latitude},${p.longitude}`;
            
            // --- POPUP CON AZIONI ---
            const popupContent = `
    <div class="custom-popup" data-id="${p.id}">
        <!-- CONTENITORE TESTO CENTRATO -->
        <div style="text-align: center; margin-bottom: 15px;">
            <h3 style="color: var(--accent); margin: 0; font-size: 1.1rem;">${p.title}</h3>
            <p style="font-size: 0.85rem; color: #bbb; margin: 8px 0 0 0; line-height: 1.4;">
                ${p.description || 'Nessuna descrizione'}
            </p>
        </div>
        
        <!-- AZIONI (Mantengono il loro layout) -->
        <div class="popup-actions" style="display: flex; flex-wrap: wrap; gap: 6px;">
            <a href="${mapsUrl}" target="_blank" class="btn-maps" style="flex: 1 1 100%; text-align: center; padding: 8px; font-size: 0.8rem; background: var(--accent); color: white; border-radius: 6px; text-decoration: none; font-weight: bold;">
               📍 Google Maps
            </a>
            
            <button onclick="toggleComp('${p.id}', ${p.is_completed})" 
                    style="flex: 1; font-size: 0.75rem; padding: 7px; cursor: pointer; border-radius: 5px; border: none; background: #333; color: white;">
                ${p.is_completed ? 'Ripristina' : 'Completa'}
            </button>
            
            <button onclick="openModal('${p.id}')" 
                    style="flex: 1; font-size: 0.75rem; padding: 7px; cursor: pointer; border-radius: 5px; border: none; background: #333; color: white;">
                Edit
            </button>
            
            <button onclick="deletePinDB('${p.id}')" 
                    style="width: 100%; margin-top: 4px; font-size: 0.75rem; padding: 5px; cursor: pointer; border-radius: 5px; border: none; background: transparent; color: #ff6b6b; font-weight: bold;">
                Elimina
            </button>
        </div>
    </div>
`;
            
            m.bindPopup(popupContent, {
                maxWidth: 220,
                className: 'modern-popup'
            });
            
            markers.push(m);
        }
    });
    renderList();
}

function renderList() {
    const term = document.getElementById('search-field').value.toLowerCase();
    const container = document.getElementById('pin-list-container');

    // Otteniamo le zone uniche dai pin caricati
    const zones = [...new Set(allPins.map(p => p.zone || 'Generale'))].sort();

    // Aggiorna il selettore zone nella modale
    document.getElementById('f-zone-select').innerHTML = zones.map(z => `<option value="${z}">${z}</option>`).join('');

    container.innerHTML = zones.map(z => {
        const pins = allPins.filter(p => (p.zone || 'Generale') === z && p.title.toLowerCase().includes(term));
        if (pins.length === 0) return "";

        return `<div class="zone-header">${z}</div>` + pins.map(p => {
            const mapsUrl = `https://www.google.com/maps?q=${p.latitude},${p.longitude}`;

            return `
    <div class="pin-item ${p.is_completed ? 'completed' : ''}" data-id="${p.id}">
        <div style="cursor:pointer;" onclick="window.open('${mapsUrl}', '_blank')">
            <b style="color:white; display:block;">${p.title}</b>
            <small style="color:#888;">${p.description || 'Nessuna descrizione'}</small>
        </div>
        <div class="pin-btns">
            <button onclick="locatePin('${p.id}')" style="background: #555;">📍</button>
            
            <button 
                onclick="toggleComp('${p.id}', ${p.is_completed})" 
                class="btn-state-toggle ${p.is_completed ? 'btn-restore' : 'btn-complete'}">
                ${p.is_completed ? 'Ripristina' : 'Completa'}
            </button>
            <button onclick="openModal('${p.id}')">Edit</button>
            <button onclick="deletePinDB('${p.id}')" style="color:#ff6b6b">Elimina</button>
        </div>
    </div>
`;
        }).join('');
    }).join('');
}

// localizza il pin nella mappa
function locatePin(id) {
    // Trova il pin nei dati locali
    const pin = allPins.find(p => p.id === id);
    if (!pin) return;



    // 1. Sposta la visuale della mappa sulle coordinate del pin con un'animazione fluida
    map.flyTo([pin.latitude, pin.longitude],map.getZoom(), {
        duration: 1.5 // durata dell'animazione in secondi
    });

    // 2. Trova il marker corrispondente e apri il suo popup
    const marker = markers.find(m => 
        m.getLatLng().lat === pin.latitude && 
        m.getLatLng().lng === pin.longitude
    );
    
    if (marker) {
        marker.openPopup();
    }

    // 3. Su dispositivi mobili, chiudi la sidebar per mostrare la mappa
    if (window.innerWidth <= 768) {
        toggleSidebar();
    }
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
        // Se arriviamo da un click sulla mappa o dal geocoder
        document.getElementById('f-lat').value = latlng.lat.toFixed(6);
        document.getElementById('f-lng').value = latlng.lng.toFixed(6);
    } else {
        // Se clicchiamo "+ Aggiungi Pin" manualmente, svuotiamo i campi coordinate
        document.getElementById('f-lat').value = "";
        document.getElementById('f-lng').value = "";
    }
    document.getElementById('modal-overlay').classList.remove('hidden');
}

async function handleSave(e) {
    e.preventDefault();

    const id = document.getElementById('edit-id').value;
    const customZoneValue = document.getElementById('f-zone-custom').value.trim();
    const selectZoneValue = document.getElementById('f-zone-select').value;

    let finalZone = (isCustomZone && customZoneValue !== "") ? customZoneValue : selectZoneValue;

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

    let error;
    if (id) {
        // Modifica esistente
        const res = await supabaseClient.from('pins').update(payload).eq('id', id);
        error = res.error;
    } else {
        // Nuovo inserimento
        const res = await supabaseClient.from('pins').insert([payload]);
        error = res.error;
    }

    if (!error) {
        closeModal();
        showToast(id ? "✅ Pin aggiornato" : "📍 Pin aggiunto");
        
        // RESET E REFRESH: Fondamentale per vedere il nuovo marker
        await fetchZones();
        await fetchPins(); // Questo ricarica allPins e chiama renderAll()
    } else {
        showToast("❌ Errore durante il salvataggio");
        console.error(error);
    }
}


function createNewRoom() {
    document.getElementById('new-room-modal-overlay').classList.remove('hidden');
    document.getElementById('new-room-input').value = ""; // Pulisce il campo
    document.getElementById('new-room-input').focus();
}

function closeNewRoomModal() {
    document.getElementById('new-room-modal-overlay').classList.add('hidden');
}

async function confirmCreateRoom() {
    const name = document.getElementById('new-room-input').value.trim();
    
    // Se il nome è vuoto, facciamo vibrare il campo o mostriamo un toast (evitiamo alert!)
    if (!name) {
        showToast("⚠️ Inserisci un nome valido");
        return;
    }

    try {
        const { data, error } = await supabaseClient.from('rooms').insert([{ name }]).select().single();
        
        if (error) throw error;

        if (data) {
            const ids = JSON.parse(localStorage.getItem('urbex_rooms_list') || "[]");
            ids.push(data.id);
            localStorage.setItem('urbex_rooms_list', JSON.stringify(ids));
            
            await refreshRoomsList();
            await loadRoom(data.id);
            
            closeNewRoomModal();
            showToast("🏠 Nuova mappa creata!");
        }
    } catch (err) {
        console.error(err);
        showToast("❌ Errore nella creazione della mappa");
    }
}

async function joinRoomByCode() {
    const code = document.getElementById('join-code-field').value.trim();
    const { data } = await supabaseClient.from('rooms').select('*').eq('invite_code', code).single();
    if (data) {
        const ids = JSON.parse(localStorage.getItem('urbex_rooms_list') || "[]");
        if (!ids.includes(data.id)) ids.push(data.id);
        localStorage.setItem('urbex_rooms_list', JSON.stringify(ids));
        await refreshRoomsList();
        loadRoom(data.id);
    }
}

function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); }

let pinToDelete = null;

function deletePinDB(id) {
    pinToDelete = id;
    document.getElementById('confirm-modal-overlay').classList.remove('hidden');
}

function closeConfirmModal() {
    document.getElementById('confirm-modal-overlay').classList.add('hidden');
    pinToDelete = null;
}

document.getElementById('confirm-delete-btn').onclick = async () => {
    if (!pinToDelete) return;
    
    const { error } = await supabaseClient.from('pins').delete().eq('id', pinToDelete);

    if (!error) {
        allPins = allPins.filter(p => p.id !== pinToDelete);
        // Rimuovi marker e card come fatto in precedenza...
        renderAll(); // O la logica di rimozione singola card
        showToast("🗑️ Posto eliminato");
    }
    closeConfirmModal();
};
async function toggleComp(id, currentState) {
    const newState = !currentState;

    // 1. Aggiorna i dati in memoria locale
    const pinIndex = allPins.findIndex(p => p.id === id);
    if (pinIndex !== -1) allPins[pinIndex].is_completed = newState;

    // 2. Aggiorna la CARD nella SIDEBAR (se esiste)
    const card = document.querySelector(`.pin-item[data-id="${id}"]`);
    if (card) {
        card.classList.toggle('completed', newState);
        const btnSidebar = card.querySelector('.btn-state-toggle') || card.querySelector('button[onclick*="toggleComp"]');
        if (btnSidebar) {
            btnSidebar.innerText = newState ? 'Ripristina' : 'Completa';
            // Aggiorna l'onclick per il prossimo clic
            btnSidebar.setAttribute('onclick', `toggleComp('${id}', ${newState})`);
        }
    }

    // 3. Aggiorna il POPUP sulla MAPPA (se è aperto)
    const popup = document.querySelector(`.custom-popup[data-id="${id}"]`);
    if (popup) {
        const btnPopup = popup.querySelector('button[onclick*="toggleComp"]');
        if (btnPopup) {
            btnPopup.innerText = newState ? 'Ripristina' : 'Completa';
            btnPopup.setAttribute('onclick', `toggleComp('${id}', ${newState})`);
        }
    }

    // 4. Aggiorna il COLORE del cerchietto sulla mappa
    const marker = markers.find(m => m.options.id === id || 
        (m._latlng && m._latlng.lat === allPins[pinIndex].latitude && m._latlng.lng === allPins[pinIndex].longitude));
    
    if (marker) {
        marker.setStyle({ fillColor: newState ? '#27ae60' : '#4287f5' });
    }

    // 5. Notifica visiva e salvataggio DB
    showToast(newState ? "✅ Segnato come completato" : "🔄 Posto ripristinato");

    const { error } = await supabaseClient
        .from('pins')
        .update({ is_completed: newState })
        .eq('id', id);

    if (error) {
        showToast("❌ Errore sincronizzazione database");
        console.error(error);
    }
}
function copyCode() { navigator.clipboard.writeText(document.getElementById('room-code').innerText); document.getElementById('copy-code-btn').innerText = "✅copiato!"; setTimeout(() => { document.getElementById('copy-code-btn').innerText = "📋"; }, 2000); }

function hideLoader() {
    const loader = document.getElementById('loader-wrapper');
    if (loader) {
        loader.classList.add('fade-out');
    }
}


// Apre la modale e pre-compila il campo con il nome attuale
function renameCurrentRoom() {
    if (!currentRoom) return;
    document.getElementById('rename-modal-overlay').classList.remove('hidden');
    const input = document.getElementById('rename-room-input');
    input.value = currentRoom.name; 
    input.focus();
}

// Chiude la modale di rinomina
function closeRenameModal() {
    document.getElementById('rename-modal-overlay').classList.add('hidden');
}

// Esegue l'aggiornamento su Supabase
async function confirmRenameRoom() {
    const newName = document.getElementById('rename-room-input').value.trim();
    
    if (!newName || newName === currentRoom.name) {
        closeRenameModal();
        return;
    }

    try {
        const { data, error } = await supabaseClient
            .from('rooms')
            .update({ name: newName })
            .eq('id', currentRoom.id)
            .select()
            .single();

        if (error) throw error;

        // Aggiorna interfaccia e memoria locale
        currentRoom.name = data.name;
        document.getElementById('room-name').innerText = data.name;
        
        await refreshRoomsList(); // Aggiorna la lista nella sidebar
        closeRenameModal();
        showToast("✏️ Mappa rinominata con successo!");
        
    } catch (err) {
        console.error("Errore rinomina:", err);
        showToast("❌ Errore durante la rinomina");
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


function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = message;

    container.appendChild(toast);

    // Rimuove l'elemento dal DOM dopo che l'animazione è finita (3 secondi)
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

window.onload = init;
