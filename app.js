const SUPABASE_URL = "https://jxtxxlzunjofjzdhcppp.supabase.co";
const SUPABASE_KEY = "sb_publishable_59Q9W66beBPxHmFAsg82Aw_dg9O-KgV"; 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let map, allPins = [], markers = [];

// Inizializzazione
async function init() {
    map = L.map('map').setView([45.4642, 9.1900], 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);

    map.on('click', (e) => openModal(null, e.latlng));
    
    document.getElementById('close-modal').onclick = () => document.getElementById('editor-modal').classList.add('hidden');
    document.getElementById('search-input').oninput = (e) => renderList(e.target.value);
    
    loadData();
}

// Carica dati da Supabase
async function loadData() {
    const { data, error } = await supabaseClient.from('pins').select('*').order('created_at', { ascending: false });
    if (error) return console.error(error);
    allPins = data;
    renderAll();
}

// Renderizza sia mappa che lista
function renderAll() {
    renderMap();
    renderList();
}

function renderMap() {
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    allPins.forEach(pin => {
        const color = pin.is_completed ? '#27ae60' : (pin.zone === 'Viaggio Lungo' ? '#ff4e00' : '#4287f5');
        const m = L.circleMarker([pin.latitude, pin.longitude], {
            radius: 10, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.8
        }).addTo(map);
        
        m.bindPopup(`<b>${pin.title}</b><br>${pin.zone}`);
        markers.push(m);
    });
}

function renderList(search = "") {
    const container = document.getElementById('grouped-list');
    container.innerHTML = "";

    const filtered = allPins.filter(p => p.title.toLowerCase().includes(search.toLowerCase()));
    
    // Raggruppamento per zona
    const groups = { "Città": [], "Fuori Porta": [], "Viaggio Lungo": [] };
    filtered.forEach(p => groups[p.zone]?.push(p));

    for (const [zone, pins] of Object.entries(groups)) {
        if (pins.length === 0) continue;

        const groupDiv = document.createElement('div');
        groupDiv.className = 'zone-group';
        groupDiv.innerHTML = `<div class="zone-title">${zone}</div>`;

        pins.forEach(pin => {
            const pinEl = document.createElement('div');
            pinEl.className = `pin-item ${pin.is_completed ? 'completed' : ''}`;
            pinEl.innerHTML = `
                <div class="pin-header">
                    <strong>${pin.title}</strong>
                    <span>${pin.danger_level}/5 ⚠️</span>
                </div>
                <div class="pin-actions">
                    <button onclick="toggleComplete('${pin.id}', ${pin.is_completed})">${pin.is_completed ? 'Riapri' : 'Completato'}</button>
                    <button onclick="editPin('${pin.id}')">Modifica</button>
                    <button class="btn-delete" onclick="deletePin('${pin.id}')">Elimina</button>
                </div>
            `;
            groupDiv.appendChild(pinEl);
        });
        container.appendChild(groupDiv);
    }
}

// Funzioni CRUD
async function openModal(pinId = null, latlng = null) {
    const modal = document.getElementById('editor-modal');
    const form = document.getElementById('pin-form');
    form.reset();
    document.getElementById('edit-id').value = pinId || "";

    if (pinId) {
        const pin = allPins.find(p => p.id === pinId);
        document.getElementById('title').value = pin.title;
        document.getElementById('description').value = pin.description;
        document.getElementById('zone').value = pin.zone;
        document.getElementById('danger').value = pin.danger_level;
        document.getElementById('lat-manual').value = pin.latitude;
        document.getElementById('lng-manual').value = pin.longitude;
    } else if (latlng) {
        document.getElementById('lat-manual').value = latlng.lat.toFixed(6);
        document.getElementById('lng-manual').value = latlng.lng.toFixed(6);
    }

    modal.classList.remove('hidden');
}

document.getElementById('pin-form').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-id').value;
    const payload = {
        title: document.getElementById('title').value,
        description: document.getElementById('description').value,
        zone: document.getElementById('zone').value,
        danger_level: parseInt(document.getElementById('danger').value),
        latitude: parseFloat(document.getElementById('lat-manual').value),
        longitude: parseFloat(document.getElementById('lng-manual').value)
    };

    const { error } = id 
        ? await supabaseClient.from('pins').update(payload).eq('id', id)
        : await supabaseClient.from('pins').insert([payload]);

    if (!error) {
        document.getElementById('editor-modal').classList.add('hidden');
        loadData();
    }
};

async function deletePin(id) {
    if (confirm("Vuoi davvero eliminare questo posto?")) {
        await supabaseClient.from('pins').delete().eq('id', id);
        loadData();
    }
}

async function toggleComplete(id, currentStatus) {
    await supabaseClient.from('pins').update({ is_completed: !currentStatus }).eq('id', id);
    loadData();
}

function editPin(id) { openModal(id); }

window.onload = init;