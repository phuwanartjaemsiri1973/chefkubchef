// Config Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDk9bsi34EbRIPJ2-ASzW0L_UM8b8XsyJg",
  authDomain: "chefkubchef.firebaseapp.com",
  projectId: "chefkubchef",
  storageBucket: "chefkubchef.firebasestorage.app",
  messagingSenderId: "526333029162",
  appId: "1:526333029162:web:a890d2e8123f6cc701cc53",
  measurementId: "G-2KHB3LP16E"
};
firebaseConfig.databaseURL = "https://chefkubchef-default-rtdb.asia-southeast1.firebasedatabase.app";

let db = null;
let isFirebaseConnected = false;

if (typeof firebase !== 'undefined') {
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.database();
        isFirebaseConnected = true;
    } catch (e) {
        console.warn("Firebase connection error:", e);
    }
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
    localActiveOrders: {},
    currentRoundItems: []
};

// ตรวจสอบและซ่อมโครงสร้างข้อมูลใน Local Storage
if (!Array.isArray(menuData.noodles)) menuData.noodles = Object.values(menuData.noodles || {});
if (!Array.isArray(menuData.toppings)) menuData.toppings = Object.values(menuData.toppings || {});
menuData.toppings.forEach(t => {
    if (t.available === undefined) t.available = (t.stock === undefined || t.stock > 0);
});
if (menuData.storeOpen === undefined) menuData.storeOpen = true;
if (!menuData.openTimeNote) menuData.openTimeNote = 'เปิดเวลา 17:00 น.';
if (!menuData.localActiveOrders) menuData.localActiveOrders = {};
if (!Array.isArray(menuData.currentRoundItems)) menuData.currentRoundItems = [];

let selectedNoodleId = null;
let selectedSpiciness = 'เผ็ดธรรมดา';
let selectedVegOption = 'ใส่';
let selectedToppings = [];
let currentOrderData = {};
let currentOrderId = localStorage.getItem('activeOrderId') || null;

let activeCategoryFilter = 'Buldak';
let userLat = 13.7563;
let userLng = 100.5018;
let map, mapMarker;

document.addEventListener('DOMContentLoaded', function() {
    renderCustomerMenu();
    setTimeout(initMap, 500);
    initRealtimeSync();
    checkCustomerActiveOrder();
});

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/* ---------- Real-time Sync (Firebase & Local Backup) ---------- */
function initRealtimeSync() {
    if (isFirebaseConnected && db) {
        db.ref('menuData').on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                menuData = { ...menuData, ...data };
                
                // ป้องกันปัญหา Firebase แปลง Array เป็น Object
                if (data.noodles) {
                    menuData.noodles = Array.isArray(data.noodles) ? data.noodles : Object.values(data.noodles);
                } else {
                    menuData.noodles = [];
                }

                if (data.toppings) {
                    menuData.toppings = Array.isArray(data.toppings) ? data.toppings : Object.values(data.toppings);
                } else {
                    menuData.toppings = [];
                }

                menuData.currentRoundItems = Array.isArray(data.currentRoundItems) ? data.currentRoundItems : [];
                localStorage.setItem('menuData', JSON.stringify(menuData));
            } else {
                db.ref('menuData').set(menuData);
            }
            renderCustomerMenu();
            renderAdminTables();
        });

        db.ref('activeOrders').on('value', (snapshot) => {
            const orders = snapshot.val() || {};
            menuData.localActiveOrders = orders;
            localStorage.setItem('menuData', JSON.stringify(menuData));
            renderAdminOrdersList(orders);
            checkCustomerActiveOrder();
        });
    } else {
        renderAdminOrdersList(menuData.localActiveOrders || {});
    }
}

function saveData() {
    localStorage.setItem('menuData', JSON.stringify(menuData));
    if (isFirebaseConnected && db) {
        db.ref('menuData').set(menuData);
    }
    renderCustomerMenu();
    renderAdminTables();
    renderAdminOrdersList(menuData.localActiveOrders || {});
}

function restoreStockForItem(item) {
    if (!item || item.stockRestored) return;
    if (!Array.isArray(menuData.noodles)) menuData.noodles = Object.values(menuData.noodles || {});
    const noodle = menuData.noodles.find(n => String(n.id) === String(item.noodleId) || n.name === item.noodle);
    if (noodle) {
        noodle.stock += 1;
        item.stockRestored = true;
        saveData();
    }
}

function initMap() {
    const mapDiv = document.getElementById('map');
    if (!mapDiv || map) return;

    if (typeof L !== 'undefined') {
        try {
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
        } catch(err) {
            console.warn("Map init failed:", err);
        }
    }
}

function getCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                userLat = position.coords.latitude;
                userLng = position.coords.longitude;
                if (!map) initMap();
                if (map && mapMarker) {
                    map.setView([userLat, userLng], 16);
                    mapMarker.setLatLng([userLat, userLng]);
                }
                alert('ระบุตำแหน่งปัจจุบันเรียบร้อยแล้ว');
            },
            () => alert('ไม่สามารถดึงตำแหน่งได้ กรุณาเปิดใช้งาน GPS บนอุปกรณ์ของคุณ')
        );
    } else {
        alert('อุปกรณ์ของคุณไม่รองรับการระบุตำแหน่ง GPS');
    }
}

function switchPaymentMethod(method) {
    const promptpaySec = document.getElementById('promptpay-section');
    const thaiSec = document.getElementById('thaichueaythai-section');
    const labelPromptpay = document.getElementById('label-promptpay');
    const labelThai = document.getElementById('label-thaichueaythai');

    if (method === 'promptpay') {
        if (promptpaySec) promptpaySec.style.display = 'block';
        if (thaiSec) thaiSec.style.display = 'none';
        if (labelPromptpay) { labelPromptpay.style.borderColor = 'var(--primary)'; labelPromptpay.style.borderWidth = '2px'; }
        if (labelThai) { labelThai.style.borderColor = 'var(--border-color)'; labelThai.style.borderWidth = '1px'; }
    } else if (method === 'thaichueaythai') {
        if (promptpaySec) promptpaySec.style.display = 'none';
        if (thaiSec) thaiSec.style.display = 'block';
        if (labelThai) { labelThai.style.borderColor = 'var(--primary)'; labelThai.style.borderWidth = '2px'; }
        if (labelPromptpay) { labelPromptpay.style.borderColor = 'var(--border-color)'; labelPromptpay.style.borderWidth = '1px'; }
    }
}

/* ---------- ระบบสลับหน้าร้าน / หน้ารอออเดอร์ ---------- */

function switchToOrderingView() {
    const ordView = document.getElementById('orderingView');
    const waitView = document.getElementById('waitingView');
    if (ordView) ordView.style.display = 'block';
    if (waitView) waitView.style.display = 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    const banner = document.getElementById('activeOrderBanner');
    if (banner && currentOrderId) {
        banner.style.display = 'flex';
    }
}

function switchToWaitingView() {
    if (!currentOrderId) {
        alert('คุณยังไม่มีออเดอร์ที่กำลังดำเนินการครับ');
        return;
    }
    const ordView = document.getElementById('orderingView');
    const waitView = document.getElementById('waitingView');
    if (ordView) ordView.style.display = 'none';
    if (waitView) waitView.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function checkCustomerActiveOrder() {
    const banner = document.getElementById('activeOrderBanner');

    if (!currentOrderId) {
        if (banner) banner.style.display = 'none';
        showOrderingView();
        return;
    }

    if (isFirebaseConnected && db) {
        db.ref('activeOrders/' + currentOrderId).once('value', (snapshot) => {
            const order = snapshot.val();
            if (!order) {
                dismissCustomerOrder();
                return;
            }
            showWaitingView(order);
        });
    } else {
        const order = (menuData.localActiveOrders || {})[currentOrderId];
        if (order) {
            showWaitingView(order);
        } else {
            dismissCustomerOrder();
        }
    }
}

function dismissCustomerOrder() {
    localStorage.removeItem('activeOrderId');
    currentOrderId = null;
    const banner = document.getElementById('activeOrderBanner');
    if (banner) banner.style.display = 'none';
    showOrderingView();
}

function showOrderingView() {
    const ordView = document.getElementById('orderingView');
    const waitView = document.getElementById('waitingView');
    if (ordView) ordView.style.display = 'block';
    if (waitView) waitView.style.display = 'none';
}

function showWaitingView(order) {
    const banner = document.getElementById('activeOrderBanner');
    if (banner) banner.style.display = 'flex';

    const statusIcon = document.getElementById('waitingStatusIcon');
    const statusTitle = document.getElementById('waitingStatusTitle');
    const statusDesc = document.getElementById('waitingStatusDesc');
    const receiptBox = document.getElementById('waitingOrderReceipt');
    const actionButtons = document.getElementById('waitingActionButtons');

    const cust = order.customer || {};
    const items = order.items || [];

    let alertHtml = '';
    if (order.cancelReason) {
        alertHtml = `
            <div style="background: #fff0f1; border: 1.5px solid #ff4757; color: #d63031; padding: 12px; border-radius: 10px; margin-bottom: 14px; text-align: left; font-size: 13px; line-height: 1.4;">
                <strong style="font-size: 14px; display: block; margin-bottom: 4px;">⚠️ แจ้งเตือนจากพ่อค้า:</strong>
                ${escapeHtml(order.cancelReason)}
            </div>
        `;
    }

    let itemsHtml = '';
    let activeTotal = 0;

    items.forEach((item, index) => {
        const isCancelled = item.status === 'cancelled';
        if (!isCancelled) activeTotal += (item.totalPrice || 0);

        itemsHtml += `
            <div style="border-bottom: 1px dashed var(--border-color); padding: 10px 0; opacity: ${isCancelled ? 0.55 : 1};">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <strong style="font-size:13px; color:var(--text-main);">รายการที่ ${index + 1}: ${escapeHtml(item.noodle)}</strong>
                    ${isCancelled ? '<span style="color:#ff4757; font-weight:bold; font-size:12px;">[ยกเลิกรายการนี้แล้ว]</span>' : `<span style="font-weight:bold; color:var(--primary);">${item.totalPrice} ฿</span>`}
                </div>
                <div style="font-size:12px; color:var(--text-muted); margin-top:2px; line-height:1.4;">
                    • <b>ความเผ็ด:</b> ${escapeHtml(item.spiciness)} | <b>ผัก:</b> ${escapeHtml(item.veg)}<br>
                    • <b>เครื่อง:</b> ${escapeHtml(item.toppings)}
                    ${item.cancelReason ? `<br><span style="color:#d63031; font-weight:500;">⚠️ สาเหตุที่ยกเลิก: ${escapeHtml(item.cancelReason)}</span>` : ''}
                </div>
                ${(!isCancelled && order.status === 'pending') ? `
                    <button onclick="cancelCustomerItem('${order.id}', '${item.itemId}')" style="background:#ff4757; color:white; border:none; padding:4px 10px; border-radius:6px; font-size:11px; margin-top:6px; cursor:pointer; font-weight:500;">
                        ❌ ยกเลิกเฉพาะรายการนี้
                    </button>
                ` : ''}
            </div>
        `;
    });

    if (receiptBox) {
        receiptBox.innerHTML = `
            ${alertHtml}
            <div style="margin-bottom:8px;">
                <strong>🆔 รหัสออเดอร์:</strong> <span style="color:var(--primary); font-weight:bold;">${escapeHtml(order.id)}</span><br>
                • <b>ผู้สั่ง:</b> ${escapeHtml(cust.name || order.name || '-')} (${escapeHtml(cust.phone || order.phone || '-')})<br>
                • <b>Facebook:</b> ${escapeHtml(cust.facebook || '-')}<br>
                • <b>วิธีชำระเงิน:</b> ${escapeHtml(order.paymentMethod || '-')}<br>
            </div>
            <hr style="border:none; border-top:1px dashed var(--border-color); margin:8px 0;">
            <strong>🍜 รายการสั่งซื้อทั้งหมด:</strong>
            ${itemsHtml}
            <div style="margin-top:10px; text-align:right; font-size:15px; font-weight:bold;">
                ยอดชำระสุทธิ: <span style="color:var(--primary); font-size:18px;">${activeTotal} บาท</span>
            </div>
        `;
    }

    if (order.status === 'pending') {
        if (statusIcon) statusIcon.innerText = '⏳';
        if (statusTitle) { statusTitle.innerText = 'กำลังรอยืนยันออเดอร์จากพ่อค้า'; statusTitle.style.color = '#ffa502'; }
        if (statusDesc) statusDesc.innerText = 'ระบบได้ส่งรายการไปยังร้านค้าแล้ว (หากต้องการสั่งเพิ่ม ให้กดปุ่มสั่งอาหารเพิ่มด้านบน)';
        if (actionButtons) actionButtons.innerHTML = `<button class="btn-primary btn-danger" onclick="cancelCustomerOrder('${order.id}')" style="justify-content: center;">❌ ยกเลิกออเดอร์ทั้งหมดนี้</button>`;
    } else if (order.status === 'confirmed') {
        if (statusIcon) statusIcon.innerText = '👨‍🍳';
        if (statusTitle) { statusTitle.innerText = 'พ่อค้ายืนยันออเดอร์เรียบร้อยแล้ว!'; statusTitle.style.color = '#2ed573'; }
        if (statusDesc) statusDesc.innerText = '🔥 เชฟกำลังเริ่มปรุงอาหารให้คุณอย่างสุดฝีมือ รอรับความอร่อยได้เลยครับ!';
        if (actionButtons) actionButtons.innerHTML = `<button class="btn-primary" onclick="dismissCustomerOrder()" style="justify-content: center; background: #2f3542;">รับทราบ / ปิดหน้าต่างนี้</button>`;
    } else if (order.status === 'cancelled') {
        if (statusIcon) statusIcon.innerText = '❌';
        if (statusTitle) { statusTitle.innerText = 'ออเดอร์นี้ถูกยกเลิกแล้ว'; statusTitle.style.color = '#ff4757'; }
        if (statusDesc) statusDesc.innerText = order.cancelReason ? `สาเหตุ: ${order.cancelReason}` : 'ขออภัยในความไม่สะดวกครับ';
        if (actionButtons) actionButtons.innerHTML = `<button class="btn-primary" onclick="dismissCustomerOrder()" style="justify-content: center; background: #ff4757;">รับทราบ / ปิดหน้าแจ้งเตือนนี้</button>`;
    } else if (order.status === 'completed') {
        if (statusIcon) statusIcon.innerText = '🎉';
        if (statusTitle) { statusTitle.innerText = 'ทำอาหาร/จัดส่งเสร็จสิ้นแล้ว!'; statusTitle.style.color = '#2ed573'; }
        if (statusDesc) statusDesc.innerText = 'ขอบคุณที่ใช้บริการครับ!';
        if (actionButtons) actionButtons.innerHTML = `<button class="btn-primary" onclick="dismissCustomerOrder()" style="justify-content: center; background: #2ed573;">รับทราบ / ปิดหน้าแจ้งเตือนนี้</button>`;
    }
}

function finishOrder() {
    const selectedPaymentEle = document.querySelector('input[name="payment_method"]:checked');
    const selectedPayment = selectedPaymentEle ? selectedPaymentEle.value : 'promptpay';
    let paymentText = selectedPayment === 'promptpay' ? "💳 พร้อมเพย์ (สแกนโอนเงิน)" : "🇹🇭 ไทยช่วยไทย (ลูกค้ารอทักแชต FB)";

    currentOrderData.paymentMethod = paymentText;

    const newItem = {
        itemId: 'ITM-' + Date.now(),
        noodleId: selectedNoodleId,
        noodle: currentOrderData.noodle,
        spiciness: currentOrderData.spiciness,
        toppings: currentOrderData.toppings,
        toppingNamesList: currentOrderData.toppingNamesList,
        veg: currentOrderData.veg,
        totalPrice: currentOrderData.totalPrice,
        status: 'pending'
    };

    const customerInfo = {
        name: currentOrderData.name,
        phone: currentOrderData.phone,
        facebook: currentOrderData.facebook,
        address: currentOrderData.address,
        comment: currentOrderData.comment,
        location: currentOrderData.location
    };

    if (isFirebaseConnected && db && currentOrderId) {
        db.ref('activeOrders/' + currentOrderId).once('value', (snapshot) => {
            const existingOrder = snapshot.val();
            if (existingOrder && existingOrder.status === 'pending') {
                if (!existingOrder.items) existingOrder.items = [];
                existingOrder.items.push(newItem);
                existingOrder.totalPrice = existingOrder.items.reduce((sum, it) => it.status !== 'cancelled' ? sum + it.totalPrice : sum, 0);
                existingOrder.paymentMethod = paymentText;
                existingOrder.customer = customerInfo;
                existingOrder.timestamp = new Date().toLocaleString('th-TH');

                if (!menuData.currentRoundItems) menuData.currentRoundItems = [];
                menuData.currentRoundItems.push(newItem);

                db.ref('activeOrders/' + currentOrderId).set(existingOrder);
                menuData.localActiveOrders[currentOrderId] = existingOrder;
                sendTelegramNotificationForItem(existingOrder, newItem, '➕ ลูกค้าสั่งอาหารเพิ่มในรหัสออเดอร์เดิม');
                finalizeOrderUI();
            } else {
                createNewOrderGroup(newItem, customerInfo, paymentText);
            }
        });
    } else {
        createNewOrderGroup(newItem, customerInfo, paymentText);
    }
}

function createNewOrderGroup(newItem, customerInfo, paymentText) {
    const orderId = 'ORD-' + Date.now();
    const newOrderGroup = {
        id: orderId,
        customer: customerInfo,
        items: [newItem],
        totalPrice: newItem.totalPrice,
        paymentMethod: paymentText,
        status: 'pending',
        timestamp: new Date().toLocaleString('th-TH'),
        cancelReason: ''
    };

    if (!menuData.currentRoundItems) menuData.currentRoundItems = [];
    menuData.currentRoundItems.push(newItem);

    if (isFirebaseConnected && db) {
        db.ref('activeOrders/' + orderId).set(newOrderGroup);
    }
    
    if (!menuData.localActiveOrders) menuData.localActiveOrders = {};
    menuData.localActiveOrders[orderId] = newOrderGroup;
    localStorage.setItem('activeOrderId', orderId);
    currentOrderId = orderId;

    const slipInput = document.getElementById('slipFileInput');
    const slipFile = (slipInput && slipInput.files && slipInput.files.length > 0) ? slipInput.files[0] : null;
    sendTelegramNotification(newOrderGroup, slipFile, '⏳ สถานะ: รอยืนยันออเดอร์จากพ่อค้า');

    finalizeOrderUI();
}

function finalizeOrderUI() {
    if (!Array.isArray(menuData.noodles)) menuData.noodles = Object.values(menuData.noodles || {});
    const noodle = menuData.noodles.find(n => String(n.id) === String(selectedNoodleId));
    if (noodle && noodle.stock > 0) noodle.stock -= 1;

    const slipInput = document.getElementById('slipFileInput');
    if (slipInput) slipInput.value = '';
    selectedNoodleId = null;
    selectedToppings = [];
    closeModal();
    saveData();
    
    const ordView = document.getElementById('orderingView');
    const waitView = document.getElementById('waitingView');
    if (ordView) ordView.style.display = 'none';
    if (waitView) waitView.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });

    checkCustomerActiveOrder();
}

function cancelCustomerItem(orderId, itemId) {
    if (!confirm('คุณต้องการยกเลิกรายการอาหารนี้ใช่หรือไม่?')) return;

    const handleCancel = (order) => {
        if (!order || !order.items) return;
        let activeCount = 0;
        order.items.forEach(it => {
            if (it.itemId === itemId) {
                it.status = 'cancelled';
                restoreStockForItem(it);
            }
            if (it.status !== 'cancelled') activeCount++;
        });

        if (menuData.currentRoundItems) {
            const rItem = menuData.currentRoundItems.find(ri => ri.itemId === itemId);
            if (rItem) rItem.status = 'cancelled';
        }

        order.totalPrice = order.items.reduce((sum, it) => it.status !== 'cancelled' ? sum + it.totalPrice : sum, 0);
        if (activeCount === 0) order.status = 'cancelled';

        if (isFirebaseConnected && db) {
            db.ref('activeOrders/' + orderId).set(order);
        }
        menuData.localActiveOrders[orderId] = order;
        saveData();
        checkCustomerActiveOrder();
        sendTelegramSimpleText(`❌ <b>ลูกค้ายกเลิกรายการย่อย ${escapeHtml(itemId)} ในออเดอร์ ${escapeHtml(orderId)}</b>`);
    };

    if (isFirebaseConnected && db) {
        db.ref('activeOrders/' + orderId).once('value', (snapshot) => handleCancel(snapshot.val()));
    } else {
        handleCancel(menuData.localActiveOrders[orderId]);
    }
}

function cancelCustomerOrder(orderId) {
    const idToCancel = orderId || currentOrderId;
    if (!idToCancel) return;

    if (!confirm('คุณต้องการยกเลิกออเดอร์ทั้งหมดใช่หรือไม่?')) return;

    const handleCancelAll = (order) => {
        if (order) {
            order.status = 'cancelled';
            if (order.items) {
                order.items.forEach(it => {
                    it.status = 'cancelled';
                    restoreStockForItem(it);
                    if (menuData.currentRoundItems) {
                        const rItem = menuData.currentRoundItems.find(ri => ri.itemId === it.itemId);
                        if (rItem) rItem.status = 'cancelled';
                    }
                });
            }
            if (isFirebaseConnected && db) {
                db.ref('activeOrders/' + idToCancel).set(order);
            }
            menuData.localActiveOrders[idToCancel] = order;
            saveData();
            checkCustomerActiveOrder();
        }
    };

    if (isFirebaseConnected && db) {
        db.ref('activeOrders/' + idToCancel).once('value', (snapshot) => handleCancelAll(snapshot.val()));
    } else {
        handleCancelAll(menuData.localActiveOrders[idToCancel]);
    }
    sendTelegramSimpleText(`❌ <b>ออเดอร์ ${escapeHtml(idToCancel)} ถูกยกเลิกทั้งหมดโดยลูกค้า</b>`);
}

/* ---------- ระบบหลังบ้าน (ADMIN) ---------- */

function switchAdminTab(tab) {
    const ordersTab = document.getElementById('adminTabOrders');
    const stockTab = document.getElementById('adminTabStock');
    const ordersBtn = document.getElementById('adminTabOrdersBtn');
    const stockBtn = document.getElementById('adminTabStockBtn');

    if (tab === 'orders') {
        if (ordersTab) ordersTab.style.display = 'block';
        if (stockTab) stockTab.style.display = 'none';
        if (ordersBtn) ordersBtn.classList.add('active');
        if (stockBtn) stockBtn.classList.remove('active');
        renderAdminOrdersList(menuData.localActiveOrders);
    } else {
        if (ordersTab) ordersTab.style.display = 'none';
        if (stockTab) stockTab.style.display = 'block';
        if (stockBtn) stockBtn.classList.add('active');
        if (ordersBtn) ordersBtn.classList.remove('active');
        renderAdminTables();
    }
}

function renderAdminOrdersList(orders) {
    const container = document.getElementById('adminOrdersContainer');
    if (!container) return;

    const activeOrders = orders || menuData.localActiveOrders || {};
    const orderKeys = Object.keys(activeOrders);
    
    // คัดกรองออเดอร์ที่ยังค้างอยู่
    const pendingKeys = orderKeys.filter(key => {
        const ord = activeOrders[key];
        return ord && ord.status !== 'completed' && ord.status !== 'cancelled';
    });

    if (pendingKeys.length === 0) {
        container.innerHTML = '<p style="font-size:13px; color:var(--text-muted); text-align:center; padding:15px; background:#f8f9fa; border-radius:8px;">ไม่มีออเดอร์ค้างในระบบ</p>';
        return;
    }

    let html = '';
    pendingKeys.reverse().forEach(key => {
        const ord = activeOrders[key];
        const targetId = ord.id || key;
        let statusText = ord.status === 'pending' ? '⏳ รอยืนยัน' : '👨‍🍳 กำลังปรุงอาหาร';
        let statusColor = ord.status === 'pending' ? '#ffa502' : '#2ed573';
        const cust = ord.customer || {};

        let itemsListHtml = '';
        (ord.items || []).forEach((item, idx) => {
            const isCancelled = item.status === 'cancelled';
            itemsListHtml += `
                <div style="background:#f8f9fa; padding:8px 10px; border-radius:8px; margin-top:6px; border:1px solid #e1e8ed; opacity:${isCancelled ? 0.5 : 1}">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong style="font-size:13px;">${idx + 1}. ${escapeHtml(item.noodle)}</strong>
                        <span style="font-weight:bold; font-size:12px;">${item.totalPrice}฿ ${isCancelled ? '<span style="color:#ff4757; margin-left:4px;">(ยกเลิกแล้ว)</span>' : ''}</span>
                    </div>
                    <div style="font-size:11px; color:#555; margin-top:2px;">
                        • 🌶️ ${escapeHtml(item.spiciness)} | 🥬 ${escapeHtml(item.veg)} | 🧀 ${escapeHtml(item.toppings)}
                    </div>
                    ${(!isCancelled && ord.status === 'pending') ? `
                        <button onclick="cancelItemByAdmin('${targetId}', '${item.itemId}')" class="btn-small btn-danger" style="padding:4px 8px; font-size:11px; margin-top:4px; cursor:pointer;">
                            ⚠️ แจ้งวัตถุดิบหมด / ยกเลิกรายการนี้
                        </button>
                    ` : ''}
                </div>
            `;
        });

        html += `
            <div style="border: 1px solid var(--border-color); border-radius: 10px; padding: 12px; margin-bottom: 12px; background: #fff; box-shadow: 0 2px 5px rgba(0,0,0,0.03);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
                    <strong style="font-size:14px; color:var(--primary);">${escapeHtml(targetId)}</strong>
                    <span style="font-size:11px; padding:3px 8px; border-radius:12px; color:white; background:${statusColor}; font-weight:600;">${statusText}</span>
                </div>
                <div style="font-size:12px; color:var(--text-main); line-height: 1.5; margin-bottom: 8px;">
                    • <b>ผู้สั่ง:</b> ${escapeHtml(cust.name || ord.name || '-')} (${escapeHtml(cust.phone || ord.phone || '-')})<br>
                    • <b>Facebook:</b> ${escapeHtml(cust.facebook || '-')}<br>
                    • <b>การชำระเงิน:</b> ${escapeHtml(ord.paymentMethod || '-')}<br>
                    • <b>ยอดรวมทั้งสิ้น:</b> <span style="color:var(--primary); font-weight:bold;">${ord.totalPrice} บาท</span><br>
                    • <b>พิกัด/ที่อยู่:</b> ${escapeHtml(cust.address || ord.address || '-')} (${cust.location || ord.location ? `<a href="${escapeHtml(cust.location || ord.location)}" target="_blank" style="color:var(--primary); text-decoration:underline;">ดูแผนที่ GPS</a>` : '-'})
                </div>
                <div style="margin-bottom:10px;">
                    <strong style="font-size:12px; color:var(--text-main);">รายการสั่งซื้อย่อยทั้งหมด:</strong>
                    ${itemsListHtml}
                </div>
                <div style="display: flex; gap: 6px;">
        `;

        if (ord.status === 'pending') {
            html += `
                <button onclick="updateOrderStatusByAdmin('${targetId}', 'confirmed')" class="btn-primary btn-small btn-success" style="flex:1; cursor:pointer; padding:8px;">✅ ยืนยันออเดอร์ทั้งหมด</button>
                <button onclick="cancelOrderByAdmin('${targetId}')" class="btn-primary btn-small btn-danger" style="flex:1; cursor:pointer; padding:8px;">❌ ปฏิเสธทั้งหมด</button>
            `;
        } else if (ord.status === 'confirmed') {
            html += `
                <button onclick="updateOrderStatusByAdmin('${targetId}', 'completed')" class="btn-primary btn-small btn-info" style="flex:1; cursor:pointer; padding:8px;">🎉 ทำเสร็จแล้ว/ส่งแล้ว</button>
            `;
        }

        html += `
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function cancelItemByAdmin(orderId, itemId) {
    if (!orderId || !itemId) return;
    let reason = "วัตถุดิบหมด";

    const inputReason = prompt('กรุณาระบุข้อความแจ้งลูกค้า (เช่น วัตถุดิบหมด/ชีสแผ่นหมด):', 'วัตถุดิบหมด');
    if (inputReason === null) return;
    if (inputReason.trim() !== '') reason = inputReason.trim();

    const handleCancel = (order) => {
        if (!order || !order.items) return;
        let activeCount = 0;
        let targetNoodle = '';
        order.items.forEach(it => {
            if (it.itemId === itemId) {
                it.status = 'cancelled';
                it.cancelReason = reason;
                targetNoodle = it.noodle;
                restoreStockForItem(it);
            }
            if (it.status !== 'cancelled') activeCount++;
        });

        if (menuData.currentRoundItems) {
            const rItem = menuData.currentRoundItems.find(ri => ri.itemId === itemId);
            if (rItem) rItem.status = 'cancelled';
        }

        order.cancelReason = `รายการ "${targetNoodle}" ถูกยกเลิก: ${reason}`;
        order.totalPrice = order.items.reduce((sum, it) => it.status !== 'cancelled' ? sum + it.totalPrice : sum, 0);
        if (activeCount === 0) order.status = 'cancelled';

        if (isFirebaseConnected && db) {
            db.ref('activeOrders/' + orderId).set(order);
        }
        menuData.localActiveOrders[orderId] = order;
        saveData();
        sendTelegramSimpleText(`⚠️ <b>พ่อค้ายกเลิกรายการ ${escapeHtml(targetNoodle)} ใน ${escapeHtml(orderId)}</b>\nสาเหตุ: ${escapeHtml(reason)}`);
        alert('ส่งข้อความแจ้งลูกค้าและยกเลิกรายการเรียบร้อยแล้ว');
    };

    if (isFirebaseConnected && db) {
        db.ref('activeOrders/' + orderId).once('value', (snapshot) => handleCancel(snapshot.val()));
    } else {
        handleCancel(menuData.localActiveOrders[orderId]);
    }
}

function cancelOrderByAdmin(orderId) {
    if (!orderId) return;
    let reason = "ร้านค้าปฏิเสธรับออเดอร์เนื่องจากวัตถุดิบหมด";

    const inputReason = prompt('ระบุสาเหตุการยกเลิกออเดอร์เพื่อแจ้งลูกค้า:', 'ร้านค้าปฏิเสธรับออเดอร์เนื่องจากวัตถุดิบหมด');
    if (inputReason === null) return;
    if (inputReason.trim() !== '') reason = inputReason.trim();

    const handleReject = (order) => {
        if (!order) return;
        order.status = 'cancelled';
        order.cancelReason = reason;
        if (order.items) {
            order.items.forEach(it => {
                it.status = 'cancelled';
                it.cancelReason = reason;
                restoreStockForItem(it);
                if (menuData.currentRoundItems) {
                    const rItem = menuData.currentRoundItems.find(ri => ri.itemId === it.itemId);
                    if (rItem) rItem.status = 'cancelled';
                }
            });
        }

        if (isFirebaseConnected && db) {
            db.ref('activeOrders/' + orderId).set(order);
        }
        menuData.localActiveOrders[orderId] = order;
        saveData();
        sendTelegramSimpleText(`❌ <b>พ่อค้ายกเลิกออเดอร์ ${escapeHtml(orderId)}</b>\nสาเหตุ: ${escapeHtml(reason)}`);
        alert('ยกเลิกออเดอร์และแจ้งลูกค้าเรียบร้อยแล้ว');
    };

    if (isFirebaseConnected && db) {
        db.ref('activeOrders/' + orderId).once('value', (snapshot) => handleReject(snapshot.val()));
    } else {
        handleReject(menuData.localActiveOrders[orderId]);
    }
}

function updateOrderStatusByAdmin(orderId, newStatus) {
    if (!orderId) return;
    
    if (menuData.localActiveOrders && menuData.localActiveOrders[orderId]) {
        menuData.localActiveOrders[orderId].status = newStatus;
    }

    if (isFirebaseConnected && db) {
        db.ref('activeOrders/' + orderId + '/status').set(newStatus);
    }
    
    saveData();

    if (newStatus === 'confirmed') {
        sendTelegramSimpleText(`✅ <b>พ่อค้ายืนยันรับออเดอร์ ${escapeHtml(orderId)} แล้ว!</b> 👨‍🍳\nกำลังเริ่มประกอบอาหารให้ลูกค้าทันที`);
        alert(`ยืนยันออเดอร์ ${orderId} เรียบร้อยแล้ว!`);
    } else if (newStatus === 'completed') {
        sendTelegramSimpleText(`🎉 <b>ออเดอร์ ${escapeHtml(orderId)} ทำเสร็จและจัดส่งเรียบร้อยแล้ว!</b> 🚚`);
        alert(`ทำรายการเสร็จสิ้นแล้ว!`);
    }
}

function toggleStore() {
    menuData.storeOpen = !menuData.storeOpen;
    const noteInput = document.getElementById('openTimeTextNote');
    if (noteInput && noteInput.value.trim()) {
        menuData.openTimeNote = noteInput.value.trim();
    }

    if (!menuData.storeOpen) {
        sendRoundSummaryTelegram();
        menuData.currentRoundItems = [];
        alert('ปิดร้านเรียบร้อยแล้ว!');
    } else {
        menuData.currentRoundItems = []; 
        sendTelegramSimpleText(`🟢 <b>เปิดร้านเรียบร้อยแล้ว!</b> (${escapeHtml(menuData.openTimeNote)})\nพร้อมรับออเดอร์รอบใหม่แล้วครับ 🍜`);
        alert('เปิดร้านเรียบร้อยแล้ว!');
    }
    
    saveData();
}

function sendRoundSummaryTelegram() {
    if (!menuData.telegramToken || !menuData.telegramChatId) return;

    const roundItems = (menuData.currentRoundItems || []).filter(item => item.status !== 'cancelled');
    let totalSales = 0;
    let menuListText = '';

    if (roundItems.length === 0) {
        menuListText = 'ไม่มีรายการขายในรอบนี้';
    } else {
        roundItems.forEach((item, index) => {
            totalSales += (item.totalPrice || 0);
            menuListText += `${index + 1}. ${escapeHtml(item.noodle)} - <b>${item.totalPrice} บาท</b>\n`;
        });
    }

    const summaryMsg = `📊 <b>สรุปยอดการขายประจำรอบ</b>\n----------------------------\n<b>รายการเมนูที่ขายออก:</b>\n${menuListText}\n💰 <b>ยอดขายรวมทั้งหมด:</b> ${totalSales} บาท`;

    fetch(`https://api.telegram.org/bot${menuData.telegramToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: menuData.telegramChatId, text: summaryMsg, parse_mode: 'HTML' })
    }).catch(err => console.error('Telegram Summary Error:', err));
}

function saveOpenTimeNote() {
    const noteInput = document.getElementById('openTimeTextNote');
    if (noteInput) {
        menuData.openTimeNote = noteInput.value.trim() || 'เปิดเวลา 17:00 น.';
        saveData();
        alert('บันทึกเวลาเปิดร้านเรียบร้อยแล้ว');
    }
}

function sendTelegramSimpleText(msgHtml) {
    if (!menuData.telegramToken || !menuData.telegramChatId) return;
    fetch(`https://api.telegram.org/bot${menuData.telegramToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: menuData.telegramChatId, text: msgHtml, parse_mode: 'HTML' })
    }).catch(err => console.error('Telegram Error:', err));
}

function testTelegram() {
    const tokenInput = document.getElementById('telegramToken');
    const chatIdInput = document.getElementById('telegramChatId');
    if (tokenInput) menuData.telegramToken = tokenInput.value.trim();
    if (chatIdInput) menuData.telegramChatId = chatIdInput.value.trim();

    if (!menuData.telegramToken || !menuData.telegramChatId) {
        alert('กรุณากรอก Bot Token และ Chat ID ให้ครบถ้วนก่อนทดสอบ');
        return;
    }
    sendTelegramSimpleText('🧪 <b>ทดสอบการเชื่อมต่อ Telegram จากระบบหลังบ้านสำเร็จ!</b>');
    alert('ส่งข้อความทดสอบไปยัง Telegram แล้ว');
}

function sendTelegramNotificationForItem(data, item, statusTitle) {
    if (!menuData.telegramToken || !menuData.telegramChatId) return;
    const cust = data.customer || {};

    const captionText = `🍳 <b>มีออเดอร์สั่งเพิ่มเข้ามาครับ!</b>
🆔 <b>รหัสออเดอร์เดิม:</b> ${escapeHtml(data.id)}
${escapeHtml(statusTitle)}
----------------------------
🍜 <b>เมนูสั่งเพิ่ม:</b> ${escapeHtml(item.noodle)}
🌶️ <b>ความเผ็ด:</b> ${escapeHtml(item.spiciness)}
🧀 <b>เครื่อง:</b> ${escapeHtml(item.toppings)}
🥬 <b>ผัก:</b> ${escapeHtml(item.veg)}
💰 <b>ราคารายการนี้:</b> ${item.totalPrice} บาท
💵 <b>ยอดรวมทั้งออเดอร์:</b> ${data.totalPrice} บาท

👤 <b>ผู้สั่ง:</b> ${escapeHtml(cust.name || '-')}
📞 <b>เบอร์โทร:</b> ${escapeHtml(cust.phone || '-')}
👤 <b>Facebook:</b> ${escapeHtml(cust.facebook || '-')}`;

    fetch(`https://api.telegram.org/bot${menuData.telegramToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: menuData.telegramChatId, text: captionText, parse_mode: 'HTML' })
    }).catch(err => console.error('Telegram Error:', err));
}

function sendTelegramNotification(data, slipFile, statusTitle) {
    if (!menuData.telegramToken || !menuData.telegramChatId) return;
    const cust = data.customer || {};
    const items = data.items || [];

    let itemsDetailsText = '';
    items.forEach((item, index) => {
        itemsDetailsText += `\n🍜 <b>รายการที่ ${index + 1}:</b> ${escapeHtml(item.noodle || '-')}
🌶️ <b>ความเผ็ด:</b> ${escapeHtml(item.spiciness || '-')}
🧀 <b>เครื่อง:</b> ${escapeHtml(item.toppings || '-')}
🥬 <b>ผัก:</b> ${escapeHtml(item.veg || '-')}
💰 <b>ราคา:</b> ${item.totalPrice || 0} บาท\n`;
    });

    const captionText = `🍳 <b>มีออเดอร์ใหม่เข้ามาครับ!</b>
🆔 <b>รหัสออเดอร์:</b> ${escapeHtml(data.id)}
${escapeHtml(statusTitle || '⏳ สถานะ: รอยืนยันออเดอร์จากพ่อค้า')}
----------------------------${itemsDetailsText}----------------------------
💳 <b>ชำระเงิน:</b> ${escapeHtml(data.paymentMethod || 'ไม่ได้ระบุ')}
💰 <b>ราคารวมทั้งสิ้น:</b> ${data.totalPrice} บาท

👤 <b>ผู้สั่ง:</b> ${escapeHtml(cust.name || '-')}
📞 <b>เบอร์โทร:</b> ${escapeHtml(cust.phone || '-')}
👤 <b>Facebook:</b> ${escapeHtml(cust.facebook || '-')}
🏠 <b>ที่อยู่:</b> ${escapeHtml(cust.address || '-')}
📝 <b>หมายเหตุ:</b> ${escapeHtml(cust.comment || '-')}
📍 <b>พิกัด GPS:</b> <a href="${escapeHtml(cust.location || '#')}">ดูแผนที่ GPS</a>`;

    if (slipFile) {
        const formData = new FormData();
        formData.append('chat_id', menuData.telegramChatId);
        formData.append('photo', slipFile);
        formData.append('caption', captionText);
        formData.append('parse_mode', 'HTML');

        fetch(`https://api.telegram.org/bot${menuData.telegramToken}/sendPhoto`, {
            method: 'POST',
            body: formData
        }).catch(err => console.error('Telegram SendPhoto Error:', err));
    } else {
        fetch(`https://api.telegram.org/bot${menuData.telegramToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: menuData.telegramChatId, text: captionText, parse_mode: 'HTML' })
        }).catch(err => console.error('Telegram SendMessage Error:', err));
    }
}

function filterNoodleCategory(cat, el) {
    activeCategoryFilter = cat;
    document.querySelectorAll('#orderingView .cat-tab').forEach(tab => tab.classList.remove('active'));
    if (el) el.classList.add('active');
    renderCustomerMenu();
}

function selectNoodle(id) {
    if (!menuData.storeOpen) { alert(`ขออภัยครับ ร้านปิดบริการอยู่ (${menuData.openTimeNote})`); return; }
    if (!Array.isArray(menuData.noodles)) menuData.noodles = Object.values(menuData.noodles || {});
    const noodle = menuData.noodles.find(n => String(n.id) === String(id));
    if (noodle && noodle.stock <= 0) {
        alert('ขออภัยครับ เมนูนี้สินค้าหมดชั่วคราว');
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
        if (badge) { badge.style.background = 'rgba(46, 213, 115, 0.25)'; badge.style.color = '#ffffff'; badge.innerText = `🟢 ร้านเปิดอยู่ (${menuData.openTimeNote})`; }
        if (submitBtn) { submitBtn.style.opacity = '1'; submitBtn.style.pointerEvents = 'auto'; submitBtn.style.background = 'linear-gradient(135deg, #ff4757, #ff6b81)'; }
        if (submitBtnText) submitBtnText.innerText = 'สรุปรายการสั่งซื้อ';
        if (livePriceDisplay) livePriceDisplay.style.display = 'inline';
        if (closedModal) closedModal.style.display = 'none';
    } else {
        if (badge) { badge.style.background = 'rgba(255, 71, 87, 0.3)'; badge.style.color = '#ffffff'; badge.innerText = `🔴 ร้านปิดอยู่ (${menuData.openTimeNote})`; }
        if (submitBtn) { submitBtn.style.opacity = '0.6'; submitBtn.style.pointerEvents = 'none'; submitBtn.style.background = '#a4b0be'; }
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

    if (!Array.isArray(menuData.noodles)) menuData.noodles = Object.values(menuData.noodles || {});

    // ดึงหมวดหมู่ทั้งหมดจากข้อมูลจริงเพื่อรองรับการเพิ่มเมนูแบบไดนามิก
    const existingCategories = [...new Set(menuData.noodles.map(n => n.category).filter(Boolean))];
    if (existingCategories.length === 0) existingCategories.push('Buldak', 'OK');

    existingCategories.forEach(cat => {
        if (activeCategoryFilter && activeCategoryFilter !== 'ทั้งหมด' && activeCategoryFilter !== cat) return;
        const filteredItems = menuData.noodles.filter(n => n.category === cat);
        if (filteredItems.length > 0) {
            const groupTitle = cat === 'Buldak' ? '🔥 ตระกูล Buldak' : (cat === 'OK' ? '🍜 ตระกูล OK' : `🍜 ตระกูล ${escapeHtml(cat)}`);
            let groupHtml = `<div class="noodle-group"><div class="noodle-group-title">${groupTitle}</div><div class="noodle-grid">`;
            filteredItems.forEach(n => {
                const isOutOfStock = n.stock <= 0;
                const isSelected = String(selectedNoodleId) === String(n.id);
                groupHtml += `
                    <div class="noodle-card ${isSelected ? 'selected' : ''} ${isOutOfStock ? 'out-of-stock' : ''}" onclick="selectNoodle('${n.id}')">
                        <div class="noodle-name">${escapeHtml(n.name)}</div>
                        <div class="noodle-footer">
                            <span class="noodle-price">${n.price}฿</span>
                            <span class="noodle-stock">${isOutOfStock ? 'หมด' : `เหลือ ${n.stock}`}</span>
                        </div>
                    </div>
                `;
            });
            groupHtml += `</div></div>`;
            container.innerHTML += groupHtml;
        }
    });

    const tGrid = document.getElementById('toppingGrid');
    if (tGrid) {
        tGrid.innerHTML = '';
        if (!Array.isArray(menuData.toppings)) menuData.toppings = Object.values(menuData.toppings || {});
        menuData.toppings.forEach(t => {
            const isOutOfStock = !t.available;
            const isSelected = selectedToppings.some(id => String(id) === String(t.id));
            tGrid.innerHTML += `
                <div class="topping-card ${isSelected ? 'selected' : ''} ${isOutOfStock ? 'out-of-stock' : ''}" onclick="toggleTopping('${t.id}')">
                    <span>${escapeHtml(t.name)}</span>
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
    if (!menuData.storeOpen) { alert(`ขออภัยครับ ร้านปิดบริการอยู่ (${menuData.openTimeNote})`); return; }
    if (!Array.isArray(menuData.toppings)) menuData.toppings = Object.values(menuData.toppings || {});
    const topping = menuData.toppings.find(t => String(t.id) === String(toppingId));
    if (topping && !topping.available) {
        alert('วัตถุดิบนี้หมดชั่วคราวครับ');
        return;
    }
    const index = selectedToppings.findIndex(id => String(id) === String(toppingId));
    if (index > -1) selectedToppings.splice(index, 1);
    else selectedToppings.push(toppingId);
    renderCustomerMenu();
}

function setSpiciness(el, level) {
    document.querySelectorAll('.spicy-btn').forEach(btn => btn.classList.remove('active'));
    if (el) el.classList.add('active');
    selectedSpiciness = level;
}

function setVeg(opt) {
    const vegYes = document.getElementById('vegYes');
    const vegNo = document.getElementById('vegNo');
    if (vegYes) vegYes.classList.toggle('active', opt === 'ใส่');
    if (vegNo) vegNo.classList.toggle('active', opt === 'ไม่ใส่');
    selectedVegOption = opt;
}

function updateLivePrice() {
    let total = 0;
    if (!Array.isArray(menuData.noodles)) menuData.noodles = Object.values(menuData.noodles || {});
    const selectedNoodle = menuData.noodles.find(n => String(n.id) === String(selectedNoodleId));
    if (selectedNoodle) total += selectedNoodle.price;
    const toppingCount = selectedToppings.length;
    let toppingExtraFee = toppingCount > 2 ? (toppingCount - 2) * 10 : 0;
    total += toppingExtraFee;

    const noteEl = document.getElementById('toppingPriceNote');
    if (noteEl) {
        if (toppingCount === 0) noteEl.innerText = 'เลือกได้ฟรี 2 อย่างแรกครับ';
        else if (toppingCount <= 2) noteEl.innerText = `เลือกแล้ว ${toppingCount}/2 อย่าง (ฟรี)`;
        else noteEl.innerText = `เลือกแล้ว ${toppingCount} อย่าง (ส่วนเกิน +${toppingExtraFee} บาท)`;
    }

    const priceDisplay = document.getElementById('livePriceDisplay');
    if (priceDisplay) priceDisplay.innerText = `${total} บาท ➔`;
}

function openDeliveryModal() {
    if (!menuData.storeOpen) { alert(`ขออภัยครับ ร้านปิดบริการอยู่ (${menuData.openTimeNote})`); return; }
    if(!selectedNoodleId) { alert('กรุณากดเลือกเมนูมาม่าที่ต้องการก่อนครับ'); return; }
    
    const custNameEl = document.getElementById('custName');
    const custPhoneEl = document.getElementById('custPhone');
    const custFbEl = document.getElementById('custFacebook');

    const custName = custNameEl ? custNameEl.value.trim() : '';
    const custPhone = custPhoneEl ? custPhoneEl.value.trim() : '';
    const custFb = custFbEl ? custFbEl.value.trim() : '';

    if(!custName || !custPhone || !custFb) { 
        alert('กรุณากรอกชื่อ, เบอร์โทรศัพท์ และ Facebook ให้ครบถ้วนครับ'); 
        return; 
    }

    const modal = document.getElementById('orderModal');
    const step1 = document.getElementById('modalStep1');
    const step2 = document.getElementById('modalStep2');

    if (modal) modal.style.display = 'flex';
    if (step1) step1.style.display = 'block';
    if (step2) step2.style.display = 'none';
}

function closeModal() { 
    const modal = document.getElementById('orderModal');
    if (modal) modal.style.display = 'none'; 
}

function calculateTotal(method) {
    let total = 0;
    if (!Array.isArray(menuData.noodles)) menuData.noodles = Object.values(menuData.noodles || {});
    const selectedNoodle = menuData.noodles.find(n => String(n.id) === String(selectedNoodleId));
    if (selectedNoodle) total += selectedNoodle.price;

    const toppingCount = selectedToppings.length;
    let toppingExtraFee = toppingCount > 2 ? (toppingCount - 2) * 10 : 0;
    total += toppingExtraFee;

    if (!Array.isArray(menuData.toppings)) menuData.toppings = Object.values(menuData.toppings || {});
    const chosenToppingNames = selectedToppings.map(id => {
        const t = menuData.toppings.find(item => String(item.id) === String(id));
        return t ? t.name : '';
    }).filter(Boolean);

    const nameEl = document.getElementById('custName');
    const phoneEl = document.getElementById('custPhone');
    const fbEl = document.getElementById('custFacebook');
    const addrEl = document.getElementById('custAddress');
    const commEl = document.getElementById('custComment');

    currentOrderData = {
        noodle: selectedNoodle ? selectedNoodle.name : 'ไม่ได้เลือก',
        spiciness: selectedSpiciness,
        toppings: chosenToppingNames.length > 0 ? chosenToppingNames.join(', ') : 'ไม่ใส่เครื่อง',
        toppingNamesList: chosenToppingNames,
        veg: selectedVegOption,
        method: method,
        totalPrice: total,
        name: nameEl ? nameEl.value.trim() : '-',
        phone: phoneEl ? phoneEl.value.trim() : '-',
        facebook: fbEl ? fbEl.value.trim() : '-',
        address: (addrEl && addrEl.value.trim()) ? addrEl.value.trim() : '-',
        comment: (commEl && commEl.value.trim()) ? commEl.value.trim() : '-',
        location: `https://www.google.com/maps?q=${userLat},${userLng}`
    };

    const totalDisp = document.getElementById('totalPriceDisplay');
    const orderSum = document.getElementById('orderSummary');

    if (totalDisp) totalDisp.innerText = `${total} บาท`;
    if (orderSum) {
        orderSum.innerHTML = `
            <strong>สรุปรายการสั่งซื้อ:</strong><br>
            • เมนู: ${escapeHtml(currentOrderData.noodle)}<br>
            • ความเผ็ด: ${escapeHtml(currentOrderData.spiciness)}<br>
            • เครื่องที่เลือก: ${escapeHtml(currentOrderData.toppings)}<br>
            • ผัก: ${escapeHtml(currentOrderData.veg)}<br>
            • การรับอาหาร: ${escapeHtml(currentOrderData.method)}<br>
            • ชื่อผู้สั่ง: ${escapeHtml(currentOrderData.name)} (${escapeHtml(currentOrderData.phone)})<br>
            • Facebook: ${escapeHtml(currentOrderData.facebook)}<br>
            • ที่อยู่: ${escapeHtml(currentOrderData.address)}<br>
            • หมายเหตุ: ${escapeHtml(currentOrderData.comment)}
        `;
    }

    const step1 = document.getElementById('modalStep1');
    const step2 = document.getElementById('modalStep2');
    if (step1) step1.style.display = 'none';
    if (step2) step2.style.display = 'block';
    switchPaymentMethod('promptpay');
}

function toggleView() {
    const custSec = document.getElementById('customer-section');
    const adminSec = document.getElementById('admin-section');
    const btnText = document.getElementById('adminBtnText');
    const closedModal = document.getElementById('storeClosedModal');

    if (adminSec && adminSec.style.display === 'none') {
        if (custSec) custSec.style.display = 'none';
        adminSec.style.display = 'block';
        if (btnText) btnText.innerText = 'หน้าร้าน';
        if (closedModal) closedModal.style.display = 'none';
    } else {
        if (custSec) custSec.style.display = 'block';
        if (adminSec) adminSec.style.display = 'none';
        if (btnText) btnText.innerText = 'ระบบหลังบ้าน';
        renderCustomerMenu();
    }
}

function loginAdmin() {
    const passInput = document.getElementById('adminPassword');
    const pass = passInput ? passInput.value : '';
    
    if (pass === '0420') {
        const loginBox = document.getElementById('login-box');
        const adminDash = document.getElementById('admin-dashboard');
        const tokenInput = document.getElementById('telegramToken');
        const chatIdInput = document.getElementById('telegramChatId');
        const noteInput = document.getElementById('openTimeTextNote');

        if (loginBox) loginBox.style.display = 'none';
        if (adminDash) adminDash.style.display = 'block';
        if (tokenInput) tokenInput.value = menuData.telegramToken || '';
        if (chatIdInput) chatIdInput.value = menuData.telegramChatId || '';
        if (noteInput) noteInput.value = menuData.openTimeNote || 'เปิดเวลา 17:00 น.';

        switchAdminTab('orders');
        renderAdminTables();
        renderAdminOrdersList(menuData.localActiveOrders);
    } else {
        alert('รหัสผ่านไม่ถูกต้อง');
    }
}

function logoutAdmin() {
    const loginBox = document.getElementById('login-box');
    const adminDash = document.getElementById('admin-dashboard');
    const passInput = document.getElementById('adminPassword');

    if (loginBox) loginBox.style.display = 'block';
    if (adminDash) adminDash.style.display = 'none';
    if (passInput) passInput.value = '';
}

function saveTelegramSettings() {
    const tokenInput = document.getElementById('telegramToken');
    const chatIdInput = document.getElementById('telegramChatId');

    if (tokenInput) menuData.telegramToken = tokenInput.value.trim();
    if (chatIdInput) menuData.telegramChatId = chatIdInput.value.trim();
    
    saveData();
    alert('บันทึกการตั้งค่า Telegram เรียบร้อยแล้ว');
}

function renderAdminTables() {
    const adminStatusText = document.getElementById('adminStoreStatusText');
    const toggleBtn = document.getElementById('toggleStoreBtn');

    if (menuData.storeOpen) {
        if (adminStatusText) { adminStatusText.innerText = `เปิดร้านอยู่ (${menuData.openTimeNote})`; adminStatusText.style.color = '#2ed573'; }
        if (toggleBtn) { toggleBtn.innerText = '🔴 กดปิดร้าน'; toggleBtn.style.background = 'linear-gradient(135deg, #ff4757, #ff6b81)'; }
    } else {
        if (adminStatusText) { adminStatusText.innerText = `ปิดร้านอยู่ (${menuData.openTimeNote})`; adminStatusText.style.color = '#ff4757'; }
        if (toggleBtn) { toggleBtn.innerText = '🟢 กดเปิดร้าน'; toggleBtn.style.background = 'linear-gradient(135deg, #2ed573, #26af5f)'; }
    }

    const noodleTable = document.getElementById('noodleTable');
    if (noodleTable) {
        let nHtml = `<tr><th>ชื่อ</th><th>ราคา</th><th>สต็อก</th><th>จัดการ</th></tr>`;
        if (!Array.isArray(menuData.noodles)) menuData.noodles = Object.values(menuData.noodles || {});
        menuData.noodles.forEach(n => {
            nHtml += `
                <tr>
                    <td>[${escapeHtml(n.category)}] ${escapeHtml(n.name)}</td>
                    <td>${n.price}฿</td>
                    <td>
                        <div class="stock-btn-group">
                            <button class="stock-btn" onclick="updateNoodleStock('${n.id}', -1)">-</button>
                            <span style="font-weight:bold; margin:0 6px;">${n.stock}</span>
                            <button class="stock-btn" onclick="updateNoodleStock('${n.id}', 1)">+</button>
                        </div>
                    </td>
                    <td><button onclick="deleteNoodle('${n.id}')" class="btn-small btn-danger" style="cursor:pointer;">ลบ</button></td>
                </tr>
            `;
        });
        noodleTable.innerHTML = nHtml;
    }

    const toppingTable = document.getElementById('toppingTable');
    if (toppingTable) {
        let tHtml = `<tr><th>ชื่อวัตถุดิบ</th><th>สถานะ</th><th>จัดการ</th></tr>`;
        if (!Array.isArray(menuData.toppings)) menuData.toppings = Object.values(menuData.toppings || {});
        menuData.toppings.forEach(t => {
            const statusBtnClass = t.available ? 'btn-success' : 'btn-danger';
            const statusText = t.available ? 'มีวัตถุดิบ' : 'หมด';
            tHtml += `
                <tr>
                    <td>${escapeHtml(t.name)}</td>
                    <td><button onclick="toggleToppingStatus('${t.id}')" class="btn-small ${statusBtnClass}" style="cursor:pointer;">${statusText}</button></td>
                    <td><button onclick="deleteTopping('${t.id}')" class="btn-small btn-danger" style="cursor:pointer;">ลบ</button></td>
                </tr>
            `;
        });
        toppingTable.innerHTML = tHtml;
    }

    const vegStatus = document.getElementById('currentVegStatus');
    const vegBtn = document.getElementById('toggleVegBtn');

    if (vegStatus) vegStatus.innerText = menuData.vegActive ? 'เปิดปกติ (มีผัก)' : 'ผักหมดชั่วคราว';
    if (vegBtn) vegBtn.innerText = menuData.vegActive ? 'ตั้งเป็นผักหมด' : 'ตั้งเป็นมีผัก';
}

function addNoodle() {
    const catInput = document.getElementById('newNoodleCategory');
    const nameInput = document.getElementById('newNoodleName');
    const priceInput = document.getElementById('newNoodlePrice');
    const stockInput = document.getElementById('newNoodleStock');

    const cat = catInput ? catInput.value : 'Buldak';
    const name = nameInput ? nameInput.value.trim() : '';
    const price = priceInput ? parseFloat(priceInput.value) : NaN;
    const stock = stockInput ? (parseInt(stockInput.value) || 0) : 0;

    if (!name || isNaN(price)) { alert('กรุณากรอกชื่อรสชาติและราคาให้ถูกต้อง'); return; }
    if (!Array.isArray(menuData.noodles)) menuData.noodles = Object.values(menuData.noodles || {});
    
    menuData.noodles.push({ id: Date.now(), category: cat, name: name, price: price, stock: stock });
    
    if (nameInput) nameInput.value = '';
    if (priceInput) priceInput.value = '';
    if (stockInput) stockInput.value = '';
    
    saveData();
}

function updateNoodleStock(id, change) {
    if (!Array.isArray(menuData.noodles)) menuData.noodles = Object.values(menuData.noodles || {});
    const noodle = menuData.noodles.find(n => String(n.id) === String(id));
    if (noodle) { 
        noodle.stock = Math.max(0, noodle.stock + change); 
        saveData(); 
    }
}

function deleteNoodle(id) {
    if (confirm('ยืนยันลบรายการนี้?')) { 
        if (!Array.isArray(menuData.noodles)) menuData.noodles = Object.values(menuData.noodles || {});
        menuData.noodles = menuData.noodles.filter(n => String(n.id) !== String(id)); 
        saveData(); 
    }
}

function addTopping() {
    const nameInput = document.getElementById('newToppingName');
    const name = nameInput ? nameInput.value.trim() : '';
    
    if (!name) { alert('กรุณากรอกชื่อวัตถุดิบ/เครื่อง'); return; }
    if (!Array.isArray(menuData.toppings)) menuData.toppings = Object.values(menuData.toppings || {});

    menuData.toppings.push({ id: Date.now(), name: name, available: true });
    
    if (nameInput) nameInput.value = '';
    saveData();
}

function toggleToppingStatus(id) {
    if (!Array.isArray(menuData.toppings)) menuData.toppings = Object.values(menuData.toppings || {});
    const topping = menuData.toppings.find(t => String(t.id) === String(id));
    if (topping) { 
        topping.available = !topping.available; 
        saveData(); 
    }
}

function deleteTopping(id) {
    if (confirm('ยืนยันลบรายการวัตถุดิบนี้?')) { 
        if (!Array.isArray(menuData.toppings)) menuData.toppings = Object.values(menuData.toppings || {});
        menuData.toppings = menuData.toppings.filter(t => String(t.id) !== String(id)); 
        saveData(); 
    }
}

function toggleVeg() { 
    menuData.vegActive = !menuData.vegActive; 
    saveData(); 
}
