
}
const SUPABASE_URL = "https://gtqvpjwpsxdampdsdvry.supabase.co";
const SUPABASE_KEY = "sb_publishable_GfFX8mud_W3b39-f0p6jDg_M-EPAcu-";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

function checkPassword() {
    alert("checkPassword فنکشن چل پڑا ہے!");
    const passInput = document.getElementById('admin-pass');
    alert("آپ کا درج کردہ پاس ورڈ ہے: " + passInput.value);
    
    if (passInput.value === "123.babli") { 
        document.getElementById('login-panel').style.display = 'none';
        document.getElementById('dashboard-panel').style.display = 'block';
        loadAdminPanel();
    } else {
        alert("پاس ورڈ غلط ہے!");
        document.getElementById('login-error').innerText = "غلط پاس ورڈ! دوبارہ کوشش کریں۔";
    }
}

async function loadAdminPanel() {
    alert("loadAdminPanel فنکشن چل رہا ہے...");
    const listContainer = document.getElementById('admin-list');
    listContainer.innerHTML = '<p class="loading-text">ڈیٹا لوڈ ہو رہا ہے...</p>';

    const { data, error } = await supabase.from('vegetables').select('*').order('id', { ascending: true });
    
    if (error) {
        alert("ڈیٹا بیس کنیکشن میں مسئلہ: " + error.message);
        listContainer.innerHTML = '<p class="loading-text">ڈیٹا لوڈ کرنے میں ناکامی۔</p>';
        return;
    }

    if (data.length === 0) {
        alert("ڈیٹا بیس خالی ہے، سیمپل ڈیٹا ڈالا جا رہا ہے۔");
        const sampleVeg = [
            { name: 'Potatoes (آلو)', price_per_kg: 80, image_url: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655' },
            { name: 'Onions (پیاز)', price_per_kg: 120, image_url: 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8ce' },
            { name: 'Tomatoes (ٹماٹر)', price_per_kg: 150, image_url: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea' },
            { name: 'Green Chillies (ہری مرچ)', price_per_kg: 200, image_url: 'https://images.unsplash.com/photo-1588879460405-59b81b857700' }
        ];
        
        const { error: seedError } = await supabase.from('vegetables').insert(sampleVeg);
        if (seedError) {
            alert("ڈیٹا سیڈ کرنے میں مسئلہ: " + seedError.message);
            return;
        }
        loadAdminPanel();
        return;
    }

    alert("ڈیٹا کامیابی سے مل گیا ہے، اسکرین پر دکھایا جا رہا ہے۔");
    listContainer.innerHTML = '';

    data.forEach(veg => {
        const row = document.createElement('div');
        row.className = 'admin-row';
        
        const titleSpan = document.createElement('span');
        titleSpan.textContent = veg.name;

        const priceDiv = document.createElement('div');
        priceDiv.className = 'price-controls';
        priceDiv.innerHTML = `
            Rs. <input type="number" id="input-${veg.id}" value="${veg.price_per_kg}" step="0.01"> / kg
            <button type="button" onclick="updatePrice(${veg.id})">سیو کریں</button>
            <button type="button" class="whatsapp-btn" onclick="shareOnWhatsApp('${veg.name}', 'input-${veg.id}')">واٹس ایپ پر شیئر کریں</button>
        `;

        row.appendChild(titleSpan);
        row.appendChild(priceDiv);
        listContainer.appendChild(row);
    });
}

async function updatePrice(id) {
    const inputVal = document.getElementById(`input-${id}`).value;
    const newPrice = parseFloat(inputVal);

    if (isNaN(newPrice) || newPrice < 0) {
        alert("براہ کرم درست قیمت درج کریں۔");
        return;
    }

    const { error } = await supabase
        .from('vegetables')
        .update({ price_per_kg: newPrice })
        .eq('id', id);

    if (error) {
        alert("قیمت اپ ڈیٹ نہ ہو سکی: " + error.message);
    } else {
        alert("قیمت کامیابی سے اپ ڈیٹ ہو گئی!");
    }
}

function shareOnWhatsApp(vegName, inputId) {
    const price = document.getElementById(inputId).value;
    const message = `تازہ ترین قیمت: ${vegName} کی نئی قیمت ${price} روپے فی کلو ہے۔`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
}const SUPABASE_URL = "https://gtqvpjwpsxdampdsdvry.supabase.co";
const SUPABASE_KEY = "sb_publishable_GfFX8mud_W3b39-f0p6jDg_M-EPAcu-";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

function checkPassword() {
    alert("checkPassword فنکشن چل پڑا ہے!");
    const passInput = document.getElementById('admin-pass');
    alert("آپ کا درج کردہ پاس ورڈ ہے: " + passInput.value);
    
    if (passInput.value === "123.babli") { 
        document.getElementById('login-panel').style.display = 'none';
        document.getElementById('dashboard-panel').style.display = 'block';
        loadAdminPanel();
    } else {
        alert("پاس ورڈ غلط ہے!");
        document.getElementById('login-error').innerText = "غلط پاس ورڈ! دوبارہ کوشش کریں۔";
    }
}

async function loadAdminPanel() {
    alert("loadAdminPanel فنکشن چل رہا ہے...");
    const listContainer = document.getElementById('admin-list');
    listContainer.innerHTML = '<p class="loading-text">ڈیٹا لوڈ ہو رہا ہے...</p>';

    const { data, error } = await supabase.from('vegetables').select('*').order('id', { ascending: true });
    
    if (error) {
        alert("ڈیٹا بیس کنیکشن میں مسئلہ: " + error.message);
        listContainer.innerHTML = '<p class="loading-text">ڈیٹا لوڈ کرنے میں ناکامی۔</p>';
        return;
    }

    if (data.length === 0) {
        alert("ڈیٹا بیس خالی ہے، سیمپل ڈیٹا ڈالا جا رہا ہے۔");
        const sampleVeg = [
            { name: 'Potatoes (آلو)', price_per_kg: 80, image_url: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655' },
            { name: 'Onions (پیاز)', price_per_kg: 120, image_url: 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8ce' },
            { name: 'Tomatoes (ٹماٹر)', price_per_kg: 150, image_url: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea' },
            { name: 'Green Chillies (ہری مرچ)', price_per_kg: 200, image_url: 'https://images.unsplash.com/photo-1588879460405-59b81b857700' }
        ];
        
        const { error: seedError } = await supabase.from('vegetables').insert(sampleVeg);
        if (seedError) {
            alert("ڈیٹا سیڈ کرنے میں مسئلہ: " + seedError.message);
            return;
        }
        loadAdminPanel();
        return;
    }

    alert("ڈیٹا کامیابی سے مل گیا ہے، اسکرین پر دکھایا جا رہا ہے۔");
    listContainer.innerHTML = '';

    data.forEach(veg => {
        const row = document.createElement('div');
        row.className = 'admin-row';
        
        const titleSpan = document.createElement('span');
        titleSpan.textContent = veg.name;

        const priceDiv = document.createElement('div');
        priceDiv.className = 'price-controls';
        priceDiv.innerHTML = `
            Rs. <input type="number" id="input-${veg.id}" value="${veg.price_per_kg}" step="0.01"> / kg
            <button type="button" onclick="updatePrice(${veg.id})">سیو کریں</button>
            <button type="button" class="whatsapp-btn" onclick="shareOnWhatsApp('${veg.name}', 'input-${veg.id}')">واٹس ایپ پر شیئر کریں</button>
        `;

        row.appendChild(titleSpan);
        row.appendChild(priceDiv);
        listContainer.appendChild(row);
    });
}

async function updatePrice(id) {
    const inputVal = document.getElementById(`input-${id}`).value;
    const newPrice = parseFloat(inputVal);

    if (isNaN(newPrice) || newPrice < 0) {
        alert("براہ کرم درست قیمت درج کریں۔");
        return;
    }

    const { error } = await supabase
        .from('vegetables')
        .update({ price_per_kg: newPrice })
        .eq('id', id);

    if (error) {
        alert("قیمت اپ ڈیٹ نہ ہو سکی: " + error.message);
    } else {
        alert("قیمت کامیابی سے اپ ڈیٹ ہو گئی!");
    }
}

function shareOnWhatsApp(vegName, inputId) {
    const price = document.getElementById(inputId).value;
    const message = `تازہ ترین قیمت: ${vegName} کی نئی قیمت ${price} روپے فی کلو ہے۔`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
}

