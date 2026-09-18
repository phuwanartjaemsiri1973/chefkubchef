// ==================== Firebase Config & Initialization ====================
// 💡 สามารถนำค่าจาก Firebase Console ของคุณมาใส่ตรงนี้ได้ เพื่อใช้งาน Real-time Sync 100%
// Import the functions you need from the SDKs you need
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDk9bsi34EbRIPJ2-ASzW0L_UM8b8XsyJg",
  authDomain: "chefkubchef.firebaseapp.com",
  projectId: "chefkubchef",
  storageBucket: "chefkubchef.firebasestorage.app",
  messagingSenderId: "526333029162",
  appId: "1:526333029162:web:a890d2e8123f6cc701cc53",
  measurementId: "G-2KHB3LP16E"
};

// เพิ่ม databaseURL เพื่อระบุที่อยู่ของ Realtime Database
firebaseConfig.databaseURL = "https://chefkubchef-default-rtdb.asia-southeast1.firebasedatabase.app";

let db = null;
let isFirebaseConnected = false;

if (typeof firebase !== 'undefined') {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    db = firebase.database();
    isFirebaseConnected = true;
}

try {
    if (typeof firebase !== 'undefined' && firebaseConfig.databaseURL !== "https://console.firebase.google.com/u/2/project/chefkubchef/database/chefkubchef-default-rtdb/data/~2F") {
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
        isFirebaseConnected = true;
    }
} catch (e) {
    console.warn("ยังไม่ได้ตั้งค่า Firebase Database Config - ระบบจะใช้งาน LocalStorage ตามปกติ");
}

let menuData = JSON.parse(localStorage.getItem('menuData')) || {
    noodles: [
        { id: 1, category: 'Buldak', name: 'Buldak ออริจินัลเผ็ด', price: 79, stock: 20 },
        { id: 2, category: 'Buldak', name: 'Buldak คาโบนาร่า', price: 89, stock: 15 },
        { id: 3, category: 'OK', name: 'OK หมูสับไข่เค็ม', price: 59, stock: 15 },
        { id: 4, category: 'OK', name: 'OK ผัดไข่เค็ม', price: 65, stock: 12 }
    ],
    toppings: [
        { id: 1, name: 'ไส้กรอกชีส', available: true },
        { id: 2, name: 'แฮมพรีเมียม', available: true },
        { id: 3, name: 'โบโลน่า', available: true },
        { id: 4, name: 'ชีสแผ่น', available: false }
    ],
    vegActive: true,
    telegramToken: '',
    telegramChatId: '',
    storeOpen: true,
    openTimeNote: 'เปิดเวลา 17:00 น.',
    todayOrders: []
};

// ปรับปรุงโครงสร้างข้อมูล
menuData.toppings.forEach(t => {
    if (t.available === undefined) t.available = (t.stock === undefined || t.stock > 0);
});
if (menuData.storeOpen === undefined) menuData.storeOpen = true;
if (!menuData.openTimeNote) menuData.openTimeNote = 'เปิดเวลา 17:00 น.';
if (!menuData.todayOrders) menuData.todayOrders = [];

let selectedNoodleId = null;
let selectedSpiciness = 'เผ็ดธรรมดา';
let selectedVegOption = 'ใส่';
let selectedToppings = [];
let currentOrderData = {};

let activeCategoryFilter = 'Buldak';

let userLat = 13.7563;
let userLng = 100.5018;
let map, mapMarker;

document.addEventListener('DOMContentLoaded', function() {
    renderCustomerMenu();
    initMap();
    initRealtimeSync();
});

/* ---------- ระบบ Real-time Sync ข้ามเครื่อง (Firebase) ---------- */
function initRealtimeSync() {
    if (isFirebaseConnected && db) {
        db.ref('menuData').on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                menuData = data;
                localStorage.setItem('menuData', JSON.stringify(menuData));
                renderCustomerMenu();
                renderAdminTables();
            }
        });
    }
}

function saveData() {
    localStorage.setItem('menuData', JSON.stringify(menuData));
    if (isFirebaseConnected && db) {
        db.ref('menuData').set(menuData);
    }
    renderCustomerMenu();
    renderAdminTables();
}

function initMap() {
    if (map) return;
    const mapDiv = document.getElementById('map');
    if (!mapDiv) return;

    if (typeof L !== 'undefined') {
        map = L.map('map').setView([userLat, userLng], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(map);

        mapMarker = L.marker([userLat, userLng], { draggable: true }).addTo(map);

        mapMarker.on('dragend', function () {
            const pos = mapMarker.getLatLng();
            userLat = pos.lat;
            userLng = pos.lng;
        });

        map.on('click', function (e) {
            userLat = e.latlng.lat;
            userLng = e.latlng.lng;
            mapMarker.setLatLng([userLat, userLng]);
        });
    }
}

function getCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                userLat = position.coords.latitude;
                userLng = position.coords.longitude;
                if (map && mapMarker) {
                    map.setView([userLat, userLng], 16);
                    mapMarker.setLatLng([userLat, userLng]);
                }
            },
            () => alert('ไม่สามารถดึงตำแหน่งได้ กรุณาเปิดใช้งาน GPS บนอุปกรณ์ของคุณ')
        );
    } else {
        alert('อุปกรณ์ของคุณไม่รองรับการระบุตำแหน่ง GPS');
    }
}

/* ---------- ระบบสลับช่องทางชำระเงิน ---------- */
function switchPaymentMethod(method) {
    const promptpaySec = document.getElementById('promptpay-section');
    const thaiSec = document.getElementById('thaichueaythai-section');
    const labelPromptpay = document.getElementById('label-promptpay');
    const labelThai = document.getElementById('label-thaichueaythai');

    if (method === 'promptpay') {
        if (promptpaySec) promptpaySec.style.display = 'block';
        if (thaiSec) thaiSec.style.display = 'none';
        
        if (labelPromptpay) {
            labelPromptpay.style.borderColor = 'var(--primary)';
            labelPromptpay.style.borderWidth = '2px';
        }
        if (labelThai) {
            labelThai.style.borderColor = 'var(--border-color)';
            labelThai.style.borderWidth = '1px';
        }
    } else if (method === 'thaichueaythai') {
        if (promptpaySec) promptpaySec.style.display = 'none';
        if (thaiSec) thaiSec.style.display = 'block';
        
        if (labelThai) {
            labelThai.style.borderColor = 'var(--primary)';
            labelThai.style.borderWidth = '2px';
        }
        if (labelPromptpay) {
            labelPromptpay.style.borderColor = 'var(--border-color)';
            labelPromptpay.style.borderWidth = '1px';
        }
    }
}

/* ---------- ระบบเปิด-ปิดร้าน & สรุปยอดขาย ---------- */
function saveStoreTimes() {
    const noteInput = document.getElementById('openTimeTextNote');
    if (noteInput) {
        menuData.openTimeNote = noteInput.value.trim() || 'เปิดเวลา 17:00 น.';
    }
    saveData();
}

function toggleStoreStatus() {
    saveStoreTimes();
    menuData.storeOpen = !menuData.storeOpen;

    if (!menuData.storeOpen) {
        const report = generateSalesReport();
        sendTelegramSummary(report);
        alert('🔴 ปิดร้านเรียบร้อยแล้ว! ระบบได้ส่งสรุปยอดขายเข้า Telegram แล้ว');
    } else {
        menuData.todayOrders = [];
        alert('🟢 เปิดร้านเรียบร้อยแล้ว พร้อมรับออเดอร์ใหม่!');
    }

    saveData();
}

function generateSalesReport() {
    const orders = menuData.todayOrders || [];
    let totalRevenue = 0;
    let noodleCounts = {};
    let toppingCounts = {};

    orders.forEach(ord => {
        totalRevenue += (ord.totalPrice || 0);

        if (ord.noodleName) {
            noodleCounts[ord.noodleName] = (noodleCounts[ord.noodleName] || 0) + 1;
        }

        if (ord.toppingNamesList && Array.isArray(ord.toppingNamesList)) {
            ord.toppingNamesList.forEach(tName => {
                toppingCounts[tName] = (toppingCounts[tName] || 0) + 1;
            });
        }
    });

    let noodleSummaryText = '';
    for (const [name, qty] of Object.entries(noodleCounts)) {
        noodleSummaryText += `• ${name}: ${qty} ชาม\n`;
    }
    if (!noodleSummaryText) noodleSummaryText = '• ไม่มีรายการขาย\n';

    let toppingSummaryText = '';
    for (const [name, qty] of Object.entries(toppingCounts)) {
        toppingSummaryText += `• ${name}: ${qty} รายการ\n`;
    }
    if (!toppingSummaryText) toppingSummaryText = '• ไม่มีรายการขาย\n';

    return {
        totalOrders: orders.length,
        totalRevenue: totalRevenue,
        noodleSummaryText: noodleSummaryText,
        toppingSummaryText: toppingSummaryText,
        openTimeNote: menuData.openTimeNote
    };
}

function sendTelegramSummary(report) {
    if (!menuData.telegramToken || !menuData.telegramChatId) return;

    const text = `📊 *สรุปยอดขายประจำวัน (ปิดร้าน)*
⏰ *กำหนดเวลาเปิด:* ${report.openTimeNote}
----------------------------
📦 *ออเดอร์ทั้งหมด:* ${report.totalOrders} รายการ
💰 *ยอดขายรวมทั้งสิ้น:* ${report.totalRevenue} บาท

🍜 *รายการมาม่าที่ขายได้:*
${report.noodleSummaryText}
🧀 *รายการเครื่อง/ไส้ที่ขายได้:*
${report.toppingSummaryText}----------------------------
🔴 *ร้านปิดให้บริการเรียบร้อย ขอบคุณครับ!* 🍳`;

    const url = `https://api.telegram.org/bot${menuData.telegramToken}/sendMessage`;
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: menuData.telegramChatId,
            text: text,
            parse_mode: 'Markdown'
        })
    }).catch(err => console.error('Telegram Summary Error:', err));
}

function testTelegram() {
    const token = document.getElementById('telegramToken').value.trim();
    const chatId = document.getElementById('telegramChatId').value.trim();
    if (!token || !chatId) {
        alert('กรุณากรอกทั้ง Telegram Token และ Chat ID / Group ID ก่อนทดสอบครับ');
        return;
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text: '🔔 *ทดสอบระบบแจ้งเตือนเข้ากลุ่ม Telegram*\nระบบพร้อมส่งข้อความแจ้งออเดอร์เข้ากลุ่มเรียบร้อยแล้วครับ! 🎉',
            parse_mode: 'Markdown'
        })
    })
    .then(res => res.json())
    .then(data => {
        if(data.ok) {
            alert('✅ ส่งข้อความทดสอบเข้ากลุ่ม Telegram สำเร็จแล้ว!');
        } else {
            alert('❌ เกิดข้อผิดพลาด: ' + (data.description || 'กรุณาตรวจสอบ Token และ Group ID ให้ถูกต้อง'));
        }
    })
    .catch(err => {
        alert('❌ ไม่สามารถเชื่อมต่อกับ Telegram ได้: ' + err.message);
    });
}

/* ---------- ระบบลูกค้า ---------- */
function filterNoodleCategory(cat, el) {
    activeCategoryFilter = cat;
    document.querySelectorAll('.cat-tab').forEach(tab => tab.classList.remove('active'));
    if(el) el.classList.add('active');
    renderCustomerMenu();
}

function selectNoodle(id) {
    if (!menuData.storeOpen) {
        alert(`ขออภัยครับ ขณะนี้ร้านปิดให้บริการอยู่ (${menuData.openTimeNote})`);
        return;
    }
    selectedNoodleId = id;
    renderCustomerMenu();
    updateLivePrice();
}

function closeClosedStoreModal() {
    const closedModal = document.getElementById('storeClosedModal');
    if (closedModal) closedModal.style.display = 'none';
}

function renderCustomerMenu() {
    const badge = document.getElementById('customerStoreStatusBadge');
    const submitBtn = document.getElementById('submitOrderBtn');
    const submitBtnText = document.getElementById('submitOrderBtnText');
    const livePriceDisplay = document.getElementById('livePriceDisplay');
    const closedModal = document.getElementById('storeClosedModal');
    const closedTimeText = document.getElementById('closedModalTimeText');

    if (menuData.storeOpen) {
        if (badge) {
            badge.style.background = 'rgba(46, 213, 115, 0.25)';
            badge.style.color = '#ffffff';
            badge.innerText = `🟢 ร้านเปิดอยู่ (${menuData.openTimeNote})`;
        }
        if (submitBtn) {
            submitBtn.style.opacity = '1';
            submitBtn.style.pointerEvents = 'auto';
            submitBtn.style.background = 'linear-gradient(135deg, #ff4757, #ff6b81)';
        }
        if (submitBtnText) submitBtnText.innerText = 'สรุปรายการสั่งซื้อ';
        if (livePriceDisplay) livePriceDisplay.style.display = 'inline';
        if (closedModal) closedModal.style.display = 'none';
    } else {
        if (badge) {
            badge.style.background = 'rgba(255, 71, 87, 0.3)';
            badge.style.color = '#ffffff';
            badge.innerText = `🔴 ร้านปิดอยู่ (${menuData.openTimeNote})`;
        }
        if (submitBtn) {
            submitBtn.style.opacity = '0.6';
            submitBtn.style.pointerEvents = 'none';
            submitBtn.style.background = '#a4b0be';
        }
        if (submitBtnText) submitBtnText.innerText = `ร้านปิดบริการ (${menuData.openTimeNote})`;
        if (livePriceDisplay) livePriceDisplay.style.display = 'none';
        
        const custSec = document.getElementById('customer-section');
        if (custSec && custSec.style.display !== 'none' && closedModal) {
            closedModal.style.display = 'flex';
            if (closedTimeText) closedTimeText.innerText = `⏰ กำหนดเปิด: ${menuData.openTimeNote}`;
        }
    }

    const container = document.getElementById('noodleCardContainer');
    if (!container) return;
    container.innerHTML = '';

    const categories = ['Buldak', 'OK'];

    categories.forEach(cat => {
        if(activeCategoryFilter !== cat) return;

        const filteredItems = menuData.noodles.filter(n => n.category === cat);
        if(filteredItems.length > 0) {
            const groupTitle = cat === 'Buldak' ? '🔥 ตระกูล Buldak' : '🍜 ตระกูล OK';
            
            let groupHtml = `
                <div class="noodle-group">
                    <div class="noodle-group-title">${groupTitle}</div>
                    <div class="noodle-grid">
            `;

            filteredItems.forEach(n => {
                const isOutOfStock = n.stock <= 0;
                const isSelected = selectedNoodleId == n.id;
                
                groupHtml += `
                    <div class="noodle-card ${isSelected ? 'selected' : ''} ${isOutOfStock ? 'out-of-stock' : ''}" 
                         onclick="selectNoodle(${n.id})">
                        <div class="noodle-name">${n.name}</div>
                        <div class="noodle-footer">
                            <span class="noodle-price">${n.price}฿</span>
                            <span class="noodle-stock">${isOutOfStock ? 'หมด' : `เหลือ ${n.stock}`}</span>
                        </div>
                    </div>
                `;
            });

            groupHtml += `
                    </div>
                </div>
            `;
            container.innerHTML += groupHtml;
        }
    });

    const tGrid = document.getElementById('toppingGrid');
    if (tGrid) {
        tGrid.innerHTML = '';
        menuData.toppings.forEach(t => {
            const isOutOfStock = !t.available;
            const isSelected = selectedToppings.includes(t.id);
            
            tGrid.innerHTML += `
                <div class="topping-card ${isSelected ? 'selected' : ''} ${isOutOfStock ? 'out-of-stock' : ''}" 
                     onclick="toggleTopping(${t.id})">
                    <span>${t.name}</span>
                    <span style="font-size:11px; opacity:0.8;">${isOutOfStock ? 'หมด' : 'มีวัตถุดิบ'}</span>
                </div>
            `;
        });
    }

    if(menuData.vegActive) {
        if (document.getElementById('vegContainer')) document.getElementById('vegContainer').style.display = 'block';
        if (document.getElementById('vegOutMessage')) document.getElementById('vegOutMessage').style.display = 'none';
    } else {
        if (document.getElementById('vegContainer')) document.getElementById('vegContainer').style.display = 'none';
        if (document.getElementById('vegOutMessage')) document.getElementById('vegOutMessage').style.display = 'block';
        selectedVegOption = 'ไม่ใส่ (ผักหมด)';
    }

    updateLivePrice();
}

function toggleTopping(toppingId) {
    if (!menuData.storeOpen) {
        alert(`ขออภัยครับ ขณะนี้ร้านปิดให้บริการอยู่ (${menuData.openTimeNote})`);
        return;
    }
    const index = selectedToppings.indexOf(toppingId);
    if (index > -1) {
        selectedToppings.splice(index, 1);
    } else {
        selectedToppings.push(toppingId);
    }
    renderCustomerMenu();
}

function setSpiciness(el, level) {
    document.querySelectorAll('.spicy-btn').forEach(btn => btn.classList.remove('active'));
    el.classList.add('active');
    selectedSpiciness = level;
}

function setVeg(opt) {
    document.getElementById('vegYes').classList.toggle('active', opt === 'ใส่');
    document.getElementById('vegNo').classList.toggle('active', opt === 'ไม่ใส่');
    selectedVegOption = opt;
}

function updateLivePrice() {
    let total = 0;
    const selectedNoodle = menuData.noodles.find(n => n.id == selectedNoodleId);
    
    if (selectedNoodle) total += selectedNoodle.price;

    const toppingCount = selectedToppings.length;
    let toppingExtraFee = toppingCount > 2 ? (toppingCount - 2) * 10 : 0;
    total += toppingExtraFee;

    const noteEl = document.getElementById('toppingPriceNote');
    if (noteEl) {
        if (toppingCount === 0) {
            noteEl.innerText = 'เลือกได้ฟรี 2 อย่างแรกครับ';
        } else if (toppingCount <= 2) {
            noteEl.innerText = `เลือกแล้ว ${toppingCount}/2 อย่าง (ฟรี)`;
        } else {
            noteEl.innerText = `เลือกแล้ว ${toppingCount} อย่าง (ส่วนเกิน +${toppingExtraFee} บาท)`;
        }
    }

    const priceDisplay = document.getElementById('livePriceDisplay');
    if (priceDisplay) priceDisplay.innerText = `${total} บาท ➔`;
}

function openDeliveryModal() {
    if (!menuData.storeOpen) {
        alert(`ขออภัยครับ ขณะนี้ร้านปิดให้บริการอยู่ (${menuData.openTimeNote})`);
        return;
    }
    if(!selectedNoodleId) {
        alert('กรุณากดเลือกเมนูมาม่าที่ต้องการก่อนครับ');
        return;
    }
    if(!document.getElementById('custName').value || !document.getElementById('custPhone').value) {
        alert('กรุณากรอกชื่อ และเบอร์โทรศัพท์ให้ครบถ้วนครับ');
        return;
    }

    document.getElementById('orderModal').style.display = 'flex';
    document.getElementById('modalStep1').style.display = 'block';
    document.getElementById('modalStep2').style.display = 'none';
}

function closeModal() {
    document.getElementById('orderModal').style.display = 'none';
}

function calculateTotal(method) {
    let total = 0;
    const selectedNoodle = menuData.noodles.find(n => n.id == selectedNoodleId);
    if (selectedNoodle) total += selectedNoodle.price;

    const toppingCount = selectedToppings.length;
    let toppingExtraFee = toppingCount > 2 ? (toppingCount - 2) * 10 : 0;
    total += toppingExtraFee;

    const chosenToppingNames = selectedToppings.map(id => {
        const t = menuData.toppings.find(item => item.id == id);
        return t ? t.name : '';
    }).filter(Boolean);

    currentOrderData = {
        noodle: selectedNoodle ? selectedNoodle.name : 'ไม่ได้เลือก',
        spiciness: selectedSpiciness,
        toppings: chosenToppingNames.length > 0 ? chosenToppingNames.join(', ') : 'ไม่ใส่เครื่อง',
        toppingNamesList: chosenToppingNames,
        veg: selectedVegOption,
        method: method,
        totalPrice: total,
        name: document.getElementById('custName').value,
        phone: document.getElementById('custPhone').value,
        address: document.getElementById('custAddress').value || '-',
        comment: document.getElementById('custComment').value || '-',
        location: `https://www.google.com/maps?q=${userLat},${userLng}`
    };

    document.getElementById('totalPriceDisplay').innerText = `${total} บาท`;
    document.getElementById('orderSummary').innerHTML = `
        <strong>สรุปรายการสั่งซื้อ:</strong><br>
        • เมนู: ${currentOrderData.noodle}<br>
        • ความเผ็ด: ${currentOrderData.spiciness}<br>
        • เครื่องที่เลือก: ${currentOrderData.toppings}<br>
        • ผัก: ${currentOrderData.veg}<br>
        • การรับอาหาร: ${currentOrderData.method}<br>
        • ชื่อผู้สั่ง: ${currentOrderData.name} (${currentOrderData.phone})<br>
        • ที่อยู่: ${currentOrderData.address}<br>
        • หมายเหตุ: ${currentOrderData.comment}
    `;

    document.getElementById('modalStep1').style.display = 'none';
    document.getElementById('modalStep2').style.display = 'block';
    
    switchPaymentMethod('promptpay');
}

function finishOrder() {
    const selectedPaymentEle = document.querySelector('input[name="payment_method"]:checked');
    const selectedPayment = selectedPaymentEle ? selectedPaymentEle.value : 'promptpay';
    
    let paymentText = "";
    if (selectedPayment === 'promptpay') {
        paymentText = "💳 พร้อมเพย์ (สแกนโอนเงิน)";
    } else if (selectedPayment === 'thaichueaythai') {
        paymentText = "🇹🇭 ไทยช่วยไทย (ลูกค้ารอทักแชต FB Fanpage)";
    }

    currentOrderData.paymentMethod = paymentText;

    const noodle = menuData.noodles.find(n => n.id == selectedNoodleId);
    if (noodle && noodle.stock > 0) {
        noodle.stock -= 1;
    }

    if (!menuData.todayOrders) menuData.todayOrders = [];
    menuData.todayOrders.push({
        noodleName: currentOrderData.noodle,
        toppingNamesList: currentOrderData.toppingNamesList,
        totalPrice: currentOrderData.totalPrice,
        time: new Date().toLocaleTimeString('th-TH')
    });

    // ดึงไฟล์รูปสลิปจากหน้าต่างชำระเงิน
    const slipInput = document.getElementById('slipFileInput');
    const slipFile = (slipInput && slipInput.files.length > 0) ? slipInput.files[0] : null;

    sendTelegramNotification(currentOrderData, slipFile);

    if (selectedPayment === 'thaichueaythai') {
        alert('ขอบคุณสำหรับคำสั่งซื้อ! กรุณากดปุ่มเพื่อทักแชตส่งสแกนสิทธิกับทางร้านผ่าน Facebook Fanpage ต่อได้เลยครับ');
    } else {
        alert('ขอบคุณสำหรับคำสั่งซื้อ! ระบบได้ส่งข้อมูลออเดอร์พร้อมสลิปโอนเงินให้ทางร้านเรียบร้อยแล้วครับ');
    }
    
    // เคลียร์ค่า
    if (slipInput) slipInput.value = '';
    selectedNoodleId = null;
    selectedToppings = [];
    currentOrderData = {};
    closeModal();
    saveData();
}

/* 📸 ระบบส่งแจ้งเตือน Telegram รองรับไฟล์สลิป (sendPhoto / sendMessage) */
function sendTelegramNotification(data, slipFile) {
    if (!menuData.telegramToken || !menuData.telegramChatId) return;

    const captionText = `🍳 *มีออเดอร์ใหม่เข้ามาครับ!*
----------------------------
🍜 *เมนู:* ${data.noodle}
🌶️ *ความเผ็ด:* ${data.spiciness}
🧀 *เครื่อง:* ${data.toppings}
🥬 *ผัก:* ${data.veg}
🛵 *รับสินค้า:* ${data.method}
💳 *ชำระเงิน:* ${data.paymentMethod || 'ไม่ได้ระบุ'}
💰 *ราคาทั้งสิ้น:* ${data.totalPrice} บาท

👤 *ผู้สั่ง:* ${data.name}
📞 *เบอร์โทร:* ${data.phone}
🏠 *ที่อยู่:* ${data.address}
📝 *หมายเหตุ:* ${data.comment}
📍 *พิกัด GPS:* ${data.location}`;

    // ถ้ามีการแนบไฟล์สลิป ให้ส่งผ่าน API sendPhoto (ส่งเป็นรูปภาพพร้อม Caption)
    if (slipFile) {
        const formData = new FormData();
        formData.append('chat_id', menuData.telegramChatId);
        formData.append('photo', slipFile);
        formData.append('caption', captionText);
        formData.append('parse_mode', 'Markdown');

        const url = `https://api.telegram.org/bot${menuData.telegramToken}/sendPhoto`;
        fetch(url, {
            method: 'POST',
            body: formData
        }).catch(err => console.error('Telegram SendPhoto Error:', err));
    } else {
        // ถ้าไม่มีสลิป ให้ส่งข้อความธรรมดา (sendMessage)
        const url = `https://api.telegram.org/bot${menuData.telegramToken}/sendMessage`;
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: menuData.telegramChatId,
                text: captionText,
                parse_mode: 'Markdown'
            })
        }).catch(err => console.error('Telegram SendMessage Error:', err));
    }
}

/* ---------- ระบบหลังบ้าน ---------- */
let isAdminLoggedIn = false;

function toggleView() {
    const custSec = document.getElementById('customer-section');
    const adminSec = document.getElementById('admin-section');
    const btnText = document.getElementById('adminBtnText');
    const closedModal = document.getElementById('storeClosedModal');

    if (adminSec.style.display === 'none') {
        custSec.style.display = 'none';
        adminSec.style.display = 'block';
        btnText.innerText = 'หน้าร้าน';
        if (closedModal) closedModal.style.display = 'none';
    } else {
        custSec.style.display = 'block';
        adminSec.style.display = 'none';
        btnText.innerText = 'ระบบหลังบ้าน';
        renderCustomerMenu();
    }
}

function loginAdmin() {
    const pass = document.getElementById('adminPassword').value;
    if (pass === '0420') {
        isAdminLoggedIn = true;
        document.getElementById('login-box').style.display = 'none';
        document.getElementById('admin-dashboard').style.display = 'block';
        
        document.getElementById('telegramToken').value = menuData.telegramToken || '';
        document.getElementById('telegramChatId').value = menuData.telegramChatId || '';
        
        document.getElementById('openTimeTextNote').value = menuData.openTimeNote || 'เปิดเวลา 17:00 น.';

        renderAdminTables();
    } else {
        alert('รหัสผ่านไม่ถูกต้อง');
    }
}

function logoutAdmin() {
    isAdminLoggedIn = false;
    document.getElementById('login-box').style.display = 'block';
    document.getElementById('admin-dashboard').style.display = 'none';
    document.getElementById('adminPassword').value = '';
}

function saveTelegramSettings() {
    menuData.telegramToken = document.getElementById('telegramToken').value.trim();
    menuData.telegramChatId = document.getElementById('telegramChatId').value.trim();
    saveData();
    alert('บันทึกการตั้งค่า Telegram เรียบร้อยแล้ว');
}

function renderAdminTables() {
    const adminStatusText = document.getElementById('adminStoreStatusText');
    const toggleBtn = document.getElementById('toggleStoreBtn');

    if (menuData.storeOpen) {
        if (adminStatusText) {
            adminStatusText.innerText = `เปิดร้านอยู่ (${menuData.openTimeNote})`;
            adminStatusText.style.color = '#2ed573';
        }
        if (toggleBtn) {
            toggleBtn.innerText = '🔴 กดปิดร้าน (สรุปยอดขายส่ง Telegram)';
            toggleBtn.style.background = 'linear-gradient(135deg, #ff4757, #ff6b81)';
        }
    } else {
        if (adminStatusText) {
            adminStatusText.innerText = `ปิดร้านอยู่ (${menuData.openTimeNote})`;
            adminStatusText.style.color = '#ff4757';
        }
        if (toggleBtn) {
            toggleBtn.innerText = '🟢 กดเปิดร้าน (เริ่มรอบขายใหม่)';
            toggleBtn.style.background = 'linear-gradient(135deg, #2ed573, #26af5f)';
        }
    }

    const noodleTable = document.getElementById('noodleTable');
    if (noodleTable) {
        let nHtml = `<tr><th>ชื่อ</th><th>ราคา</th><th>สต็อก</th><th>จัดการ</th></tr>`;
        menuData.noodles.forEach(n => {
            nHtml += `
                <tr>
                    <td>[${n.category}] ${n.name}</td>
                    <td>${n.price}฿</td>
                    <td>
                        <div class="stock-btn-group">
                            <button class="stock-btn" onclick="updateNoodleStock(${n.id}, -1)">-</button>
                            <span>${n.stock}</span>
                            <button class="stock-btn" onclick="updateNoodleStock(${n.id}, 1)">+</button>
                        </div>
                    </td>
                    <td><button onclick="deleteNoodle(${n.id})" class="btn-small btn-danger">ลบ</button></td>
                </tr>
            `;
        });
        noodleTable.innerHTML = nHtml;
    }

    const toppingTable = document.getElementById('toppingTable');
    if (toppingTable) {
        let tHtml = `<tr><th>ชื่อวัตถุดิบ</th><th>สถานะ</th><th>จัดการ</th></tr>`;
        menuData.toppings.forEach(t => {
            const statusBtnClass = t.available ? 'btn-success' : 'btn-danger';
            const statusText = t.available ? 'มีวัตถุดิบ' : 'หมด';
            tHtml += `
                <tr>
                    <td>${t.name}</td>
                    <td>
                        <button onclick="toggleToppingStatus(${t.id})" class="btn-small ${statusBtnClass}">
                            ${statusText}
                        </button>
                    </td>
                    <td><button onclick="deleteTopping(${t.id})" class="btn-small btn-danger">ลบ</button></td>
                </tr>
            `;
        });
        toppingTable.innerHTML = tHtml;
    }

    if (document.getElementById('currentVegStatus')) {
        document.getElementById('currentVegStatus').innerText = menuData.vegActive ? 'เปิดปกติ (มีผัก)' : 'ผักหมดชั่วคราว';
    }
    if (document.getElementById('toggleVegBtn')) {
        document.getElementById('toggleVegBtn').innerText = menuData.vegActive ? 'ตั้งเป็นผักหมด' : 'ตั้งเป็นมีผัก';
    }
}

function addNoodle() {
    const cat = document.getElementById('newNoodleCategory').value;
    const name = document.getElementById('newNoodleName').value.trim();
    const price = parseFloat(document.getElementById('newNoodlePrice').value);
    const stock = parseInt(document.getElementById('newNoodleStock').value) || 0;

    if (!name || isNaN(price)) {
        alert('กรุณากรอกชื่อรสชาติและราคาให้ถูกต้อง');
        return;
    }

    menuData.noodles.push({
        id: Date.now(),
        category: cat,
        name: name,
        price: price,
        stock: stock
    });

    document.getElementById('newNoodleName').value = '';
    document.getElementById('newNoodlePrice').value = '';
    document.getElementById('newNoodleStock').value = '';
    saveData();
}

function updateNoodleStock(id, change) {
    const noodle = menuData.noodles.find(n => n.id === id);
    if (noodle) {
        noodle.stock = Math.max(0, noodle.stock + change);
        saveData();
    }
}

function deleteNoodle(id) {
    if (confirm('ยืนยันลบรายการนี้?')) {
        menuData.noodles = menuData.noodles.filter(n => n.id !== id);
        saveData();
    }
}

function addTopping() {
    const name = document.getElementById('newToppingName').value.trim();
    if (!name) {
        alert('กรุณากรอกชื่อวัตถุดิบ/เครื่อง');
        return;
    }

    menuData.toppings.push({
        id: Date.now(),
        name: name,
        available: true
    });

    document.getElementById('newToppingName').value = '';
    saveData();
}

function toggleToppingStatus(id) {
    const topping = menuData.toppings.find(t => t.id === id);
    if (topping) {
        topping.available = !topping.available;
        saveData();
    }
}

function deleteTopping(id) {
    if (confirm('ยืนยันลบรายการวัตถุดิบนี้?')) {
        menuData.toppings = menuData.toppings.filter(t => t.id !== id);
        saveData();
    }
}

function toggleVeg() {
    menuData.vegActive = !menuData.vegActive;
    saveData();
}

// บล็อกการกดปุ่มทางลัด F12, Ctrl+Shift+I, Ctrl+U
document.addEventListener('keydown', function(e) {
    if (
        e.key === 'F12' || 
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) || 
        (e.ctrlKey && (e.key === 'U' || e.key === 'u'))
    ) {
        e.preventDefault();
        return false;
    }
});

// บล็อกการคลิกขวาบนหน้าเว็บ
document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
});