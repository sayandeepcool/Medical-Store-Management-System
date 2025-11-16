// Corrected Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, setDoc, doc, addDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";

// --- STEP 1: PLACE YOUR FIREBASE CONFIG HERE ---
const LOCAL_FIREBASE_CONFIG = {
    apiKey: "AIzaSyDDLXmbGuk0OBS4-yMgMkyP30hKFgZ-XOs",
    authDomain: "medical-management-syste-cc084.firebaseapp.com",
    projectId: "medical-management-syste-cc084",
    storageBucket: "medical-management-syste-cc084.appspot.com", // Add if you use storage
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID", // Add if you use messaging
    appId: "1:YOUR_APP_ID:web:YOUR_WEB_KEY" // Add if you use analytics
    // ... and the rest of your keys
};
// -------------------------------------------------------------------

// Global variables (now managed correctly within the module scope and exported via window where necessary)
let db;
let auth;
let userId = null;
let isAuthReady = false;

// Global data store (Exposed to window for access from inline 'onclick' handlers)
window.allInventoryItems = []; // Stores all fetched items for filtering/billing
window.currentBill = [];      // Stores the current items in the bill

const TAX_RATE = 0.05; // 5% GST
const LOW_STOCK_THRESHOLD = 10;
const HIGH_VALUE_THRESHOLD = 500; // Price threshold for High-Value report metric
const INVENTORY_COLLECTION = 'inventory_items';


// Mock data for the new sales chart
const mockMonthlySales = [
    { month: "May", sales: 45000 },
    { month: "Jun", sales: 62000 },
    { month: "Jul", sales: 51000 },
    { month: "Aug", sales: 78000 },
    { month: "Sep", sales: 85000 },
    { month: "Oct", sales: 71000 },
];
const MAX_MOCK_SALES = 100000;

/**
 * Initializes Firebase and authenticates the user.
 */
async function initializeFirebase() {
    try {
        const firebaseConfig = LOCAL_FIREBASE_CONFIG;
        
        // 1. Initialize App
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        const analytics = getAnalytics(app); 

        // 2. Auth State Change Listener
        onAuthStateChanged(auth, (user) => {
            if (user) {
                userId = user.uid;
                document.getElementById('user-id').textContent = userId;
                isAuthReady = true;
                console.log("Firestore initialized. User ID:", userId);
                setupInventoryListener();
                mockInitialData();
            } else {
                console.log("User signed out or authentication failed. Signing in anonymously...");
                userId = null;
                document.getElementById('user-id').textContent = 'N/A';
                signInAnonymously(auth);
            }
        });

        // 3. Authenticate User (Anonymously)
        if (!auth.currentUser) {
            await signInAnonymously(auth);
        }

    } catch (error) {
        console.error("Error initializing Firebase or signing in:", error);
        showMessageBox("Critical Error", "Failed to initialize the database: " + error.message, 'error');
    }
}

// --- Utility Functions (Exposed to Global Scope) ---

/**
 * Converts date string to a readable format (DD/MM/YYYY)
 * @param {string} dateString 
 * @returns {string}
 */
window.formatDate = (dateString) => {
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch {
        return dateString || 'N/A';
    }
};

/**
 * Converts date string to required input[type="date"] format (YYYY-MM-DD)
 * @param {string} dateString 
 * @returns {string}
 */
window.formatDateForInput = (dateString) => {
    return dateString || '';
};


/**
 * Displays a custom modal message. (Dark Mode Optimized)
 * @param {string} title 
 * @param {string} content 
 * @param {'success'|'error'|'info'} type 
 */
window.showMessageBox = (title, content, type = 'info') => {
    const modal = document.getElementById('message-modal');
    document.getElementById('message-title').textContent = title;
    document.getElementById('message-content').textContent = content;

    const titleEl = document.getElementById('message-title');
    titleEl.classList.remove('text-red-600', 'text-green-600', 'text-gray-800', 'text-gray-100', 'text-red-500', 'text-green-400');
    
    if (type === 'error') {
        titleEl.classList.add('text-red-500'); 
    } else if (type === 'success') {
        titleEl.classList.add('text-green-400'); 
    } else {
        titleEl.classList.add('text-gray-100');
    }
    
    document.getElementById('message-content').classList.remove('text-gray-600');
    document.getElementById('message-content').classList.add('text-gray-300');

    modal.classList.remove('hidden');
};

/**
 * Handles the styling for the active sidebar link.
 * @param {string} activeId - ID of the element to make active (e.g., 'nav-dashboard')
 */
window.updateSidebarActiveState = (activeId) => {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        // Remove active styles (blue)
        item.classList.remove('bg-blue-600', 'text-white', 'shadow-md', 'hover:bg-blue-700');
        // Ensure default styles (Dark mode text/hover) are present
        item.classList.add('text-gray-400', 'hover:bg-gray-800');
    });

    // Add active styles (blue) to the selected item
    const activeItem = document.getElementById(activeId);
    if (activeItem) {
        activeItem.classList.add('bg-blue-600', 'text-white', 'shadow-md', 'hover:bg-blue-700');
        activeItem.classList.remove('text-gray-400', 'hover:bg-gray-800');
    }
};


/**
 * Toggles the visibility of main content sections AND updates the sidebar highlight.
 * @param {string} sectionName 
 */
window.showSection = (sectionName) => {
    document.getElementById('dashboard-section').classList.add('hidden');
    document.getElementById('inventory-section').classList.add('hidden');
    document.getElementById('sales-section').classList.add('hidden');
    document.getElementById('reports-section').classList.add('hidden'); 

    if (sectionName === 'dashboard') {
        document.getElementById('dashboard-section').classList.remove('hidden');
        updateSidebarActiveState('nav-dashboard');
    } else if (sectionName === 'inventory') {
        document.getElementById('inventory-section').classList.remove('hidden');
        updateSidebarActiveState('nav-inventory');
    } else if (sectionName === 'sales') {
        document.getElementById('sales-section').classList.remove('hidden');
        updateSidebarActiveState('nav-sales');
        // Clear search results when entering sales screen
        document.getElementById('product-search').value = '';
        document.getElementById('sales-search-results').innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-400">Start typing to search available products.</td></tr>';
    }
    else if (sectionName === 'reports') {
        document.getElementById('reports-section').classList.remove('hidden'); 
        updateSidebarActiveState('nav-reports');
        window.renderReports(); 
    }
};

// --- Chart Logic ---
/**
 * Renders the mock sales bar chart using pure HTML/Tailwind CSS. (Dark Mode Optimized)
 */
function renderSalesChart() {
    const container = document.getElementById('sales-chart-container');
    if (!container) return;

    // Reset container and add grid lines (Y-axis simulation)
    container.innerHTML = `
        <div class="absolute left-0 bottom-0 right-0 top-0 pointer-events-none">
            <div class="absolute w-full border-t border-gray-600 border-dashed" style="bottom: 75%;"><span class="absolute -left-12 text-xs text-gray-400">75K</span></div>
            <div class="absolute w-full border-t border-gray-600 border-dashed" style="bottom: 50%;"><span class="absolute -left-12 text-xs text-gray-400">50K</span></div>
            <div class="absolute w-full border-t border-gray-600 border-dashed" style="bottom: 25%;"><span class="absolute -left-12 text-xs text-gray-400">25K</span></div>
        </div>
    `;

    // Render bars
    const barHTML = mockMonthlySales.map(data => {
        const heightPct = Math.round((data.sales / MAX_MOCK_SALES) * 100);
        const formattedSales = (data.sales / 1000).toFixed(0) + 'K';

        return `
            <div class="flex flex-col items-center justify-end h-full mx-2" style="width: 12%;">
                <div class="absolute top-0 text-xs font-semibold text-blue-400" style="bottom: ${heightPct + 2}%;">${formattedSales}</div>
                <div 
                    class="bg-blue-500 hover:bg-blue-600 rounded-t-lg shadow-lg w-full transition-all duration-500 ease-out cursor-pointer group"
                    style="height: ${heightPct}%;"
                    title="₹${data.sales.toLocaleString('en-IN')} in ${data.month}"
                >
                </div>
                <div class="mt-2 text-xs font-medium text-gray-400">${data.month}</div>
            </div>
        `;
    }).join('');

    container.insertAdjacentHTML('beforeend', barHTML);
}

// --- Inventory Data & Firestore Integration ---

/**
 * Builds the Firestore collection path for the current user's private data.
 * @returns {string}
 */
function getInventoryPath() {
    if (!userId) {
        console.error("Attempted to get inventory path before user ID was set.");
        return null;
    }
    return `users/${userId}/${INVENTORY_COLLECTION}`;
}

/**
 * Renders the inventory data into the HTML table. (Dark Mode Optimized)
 * Also updates dashboard metrics.
 * @param {Array<Object>} items - Array of inventory item objects
 */
function renderInventory(items) {
    const tableBody = document.getElementById('inventory-list');
    tableBody.innerHTML = ''; 
    let lowStockCount = 0;
    let totalProducts = 0;
    let expiringSoonCount = 0;

    const today = new Date();
    const threeMonthsFromNow = new Date();
    threeMonthsFromNow.setMonth(today.getMonth() + 3);

    items.forEach(item => {
        if (!item.name) return; 

        totalProducts++;
        const stock = parseInt(item.stock, 10) || 0;
        const price = parseFloat(item.price) || 0;
        
        const isLowStock = stock <= LOW_STOCK_THRESHOLD;

        if (isLowStock) {
            lowStockCount++;
        }

        const expiryDate = new Date(item.expiryDate);
        const isExpiringSoon = expiryDate < threeMonthsFromNow && expiryDate > today;
        if (isExpiringSoon) {
            expiringSoonCount++;
        }

        const row = tableBody.insertRow();
        // Dark Mode Row Styling
        row.className = isLowStock 
            ? 'bg-red-900 bg-opacity-30 hover:bg-red-900 transition duration-150' 
            : 'bg-gray-800 hover:bg-gray-700 transition duration-150';

        // Product Name - Light text color
        row.insertCell().innerHTML = `<div class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-100">${item.name}</div>`;
        // Batch/ID - Medium text color
        row.insertCell().innerHTML = `<div class="px-6 py-4 whitespace-nowrap text-sm text-gray-400">${item.batch}</div>`;
        // Expiry Date - Light/Yellow text color
        const expiryCell = row.insertCell();
        expiryCell.className = 'px-6 py-4 whitespace-nowrap text-sm';
        expiryCell.innerHTML = `<span class="${isExpiringSoon ? 'font-semibold text-yellow-400' : 'text-gray-400'}">${formatDate(item.expiryDate)}</span>`;
        // Stock - Bold Green/Red text color
        const stockCell = row.insertCell();
        stockCell.className = 'px-6 py-4 whitespace-nowrap text-sm font-bold';
        stockCell.innerHTML = `<span class="${isLowStock ? 'text-red-500' : 'text-green-400'}">${item.stock}</span>`;
        // Price - Light text color
        row.insertCell().innerHTML = `<div class="px-6 py-4 whitespace-nowrap text-sm text-gray-100">₹${price.toFixed(2)}</div>`;

        // Actions (Edit and Delete) - Preserved Blue/Red Accents
        const actionCell = row.insertCell();
        actionCell.className = 'px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2'; 
        actionCell.innerHTML = `
            <button onclick="openEditModal('${item.id}', '${item.name.replace(/'/g, "\\'")}', '${item.batch}', '${item.expiryDate}', ${item.stock}, ${price.toFixed(2)})" class="text-blue-400 hover:text-blue-300 transition">Edit</button>
            <button onclick="handleDelete('${item.id}', '${item.name.replace(/'/g, "\\'")}')" class="text-red-400 hover:text-red-300 transition">Delete</button>
        `;
    });

    // Update Dashboard Metrics
    document.getElementById('total-products').textContent = totalProducts;
    document.getElementById('low-stock-count').textContent = lowStockCount;
    document.getElementById('expiring-count').textContent = expiringSoonCount;

    document.getElementById('loading-indicator').classList.add('hidden');
}

/**
 * Sets up the real-time listener for the Inventory collection.
 */
function setupInventoryListener() {
    if (!isAuthReady) {
        console.warn("Auth not ready, skipping listener setup.");
        return;
    }

    const path = getInventoryPath();
    if (!path) return;

    const q = collection(db, path);

    onSnapshot(q, (snapshot) => {
        const inventoryList = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (doc.id !== "MOCK_DATA_SENTINEL" && data.name) {
                inventoryList.push({ id: doc.id, ...data });
            }
        });
        console.log("Inventory data received in real-time:", inventoryList);
        window.allInventoryItems = inventoryList;
        renderInventory(inventoryList);
        if (document.getElementById('reports-section').classList.contains('hidden') === false) {
            window.renderReports();
        }

    }, (error) => {
        console.error("Error listening to inventory:", error);
        showMessageBox("Data Error", "Could not fetch real-time inventory updates. Check your Firestore Rules.", 'error');
        document.getElementById('loading-indicator').classList.add('hidden');
    });
}

// --- CRUD Operations ---

/**
 * Opens and populates the edit modal with selected item data.
 */
window.openEditModal = (id, name, batch, expiryDate, stock, price) => {
    document.getElementById('edit-id').value = id;
    document.getElementById('edit-product-name').value = name;
    document.getElementById('edit-batch-id').value = batch;
    document.getElementById('edit-expiry-date').value = formatDateForInput(expiryDate); 
    document.getElementById('edit-stock').value = stock;
    document.getElementById('edit-price').value = price;

    document.getElementById('edit-item-modal').classList.remove('hidden');
};

/**
 * Handles the submission of the ADD item form.
 */
window.handleAddItem = async (event) => {
    event.preventDefault();
    
    if (!db || !userId) {
        showMessageBox("Error", "Database is not ready. Please wait for initialization.", 'error');
        return;
    }

    const path = getInventoryPath();
    if (!path) return;

    const form = document.getElementById('add-item-form');
    const newItem = {
        name: form['product-name'].value,
        batch: form['batch-id'].value,
        expiryDate: form['expiry-date'].value,
        stock: parseInt(form['stock'].value, 10),
        price: parseFloat(form['price'].value),
        createdAt: new Date().toISOString(),
    };

    try {
        await addDoc(collection(db, path), newItem);
        
        showMessageBox("Success!", `Product '${newItem.name}' added to inventory.`, 'success');
        form.reset();
        document.getElementById('add-item-modal').classList.add('hidden');
    } catch (e) {
        console.error("Error adding document: ", e);
        showMessageBox("Error", "Failed to add product: " + e.message, 'error');
    }
};

/**
 * Handles the submission of the EDIT item form (UPDATE operation).
 */
window.handleEditItem = async (event) => {
    event.preventDefault();

    if (!db || !userId) {
        showMessageBox("Error", "Database is not ready. Please wait for initialization.", 'error');
        return;
    }

    const path = getInventoryPath();
    if (!path) return;

    const form = document.getElementById('edit-item-form');
    const docId = form['edit-id'].value;

    const updatedItem = {
        name: form['edit-product-name'].value,
        batch: form['edit-batch-id'].value,
        expiryDate: form['edit-expiry-date'].value,
        stock: parseInt(form['edit-stock'].value, 10),
        price: parseFloat(form['edit-price'].value),
        updatedAt: new Date().toISOString(),
    };

    try {
        const docRef = doc(db, path, docId);
        await updateDoc(docRef, updatedItem);
        
        showMessageBox("Success!", `Product '${updatedItem.name}' updated successfully.`, 'success');
        document.getElementById('edit-item-modal').classList.add('hidden');
    } catch (e) {
        console.error("Error updating document: ", e);
        showMessageBox("Error", "Failed to update product: " + e.message, 'error');
    }
};

/**
 * Handles item deletion (ACTUAL DELETE operation).
 * @param {string} docId - Firestore document ID
 * @param {string} name - Product name for display
 */
window.handleDelete = async (docId, name) => {
    if (!db || !userId) {
        showMessageBox("Error", "Database is not ready.", 'error');
        return;
    }
    
    const path = getInventoryPath();
    if (!path) return;

    // Simple Confirmation Dialog
    if (!confirm(`Are you sure you want to permanently delete '${name}'?`)) {
        return;
    }

    try {
        await deleteDoc(doc(db, path, docId)); 
        showMessageBox("Success!", `'${name}' was permanently deleted.`, 'success');
        console.log(`Document deleted: ${docId}`);
    } catch (e) {
        console.error("Error deleting document: ", e);
        showMessageBox("Error", "Failed to delete product: " + e.message, 'error');
    }
};

// --- Sales & Billing Logic ---

/**
 * Filters the global inventory list based on search term and renders results for billing. (Dark Mode Optimized)
 * @param {string} searchTerm 
 */
window.searchInventory = (searchTerm) => {
    const resultsBody = document.getElementById('sales-search-results');
    resultsBody.innerHTML = '';
    const query = searchTerm.toLowerCase().trim();

    if (query.length < 2) {
        resultsBody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-400">Start typing to search available products.</td></tr>';
        return;
    }

    const filtered = window.allInventoryItems.filter(item => 
        (item.name.toLowerCase().includes(query) || item.batch.toLowerCase().includes(query)) && item.stock > 0
    );

    if (filtered.length === 0) {
        resultsBody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-red-500 font-medium">No active products found matching that search.</td></tr>';
        return;
    }

    filtered.forEach(item => {
        const row = resultsBody.insertRow();
        row.className = 'hover:bg-blue-900 hover:bg-opacity-50 cursor-pointer transition';
        
        row.insertCell().innerHTML = `<div class="px-4 py-2 text-sm font-medium text-gray-100">${item.name} <span class="text-xs text-gray-400">(${item.batch})</span></div>`;
        row.insertCell().innerHTML = `<div class="px-4 py-2 text-sm text-green-400">${item.stock} in stock</div>`;
        row.insertCell().innerHTML = `<div class="px-4 py-2 text-sm font-semibold text-gray-100">₹${parseFloat(item.price).toFixed(2)}</div>`;
        
        const actionCell = row.insertCell();
        actionCell.className = 'px-4 py-2 text-right';
        actionCell.innerHTML = `<button onclick="addToBill('${item.id}')" class="bg-blue-500 text-white text-xs font-semibold py-1 px-3 rounded-full hover:bg-blue-600 transition">Add</button>`;
    });
};

/**
 * Adds an item to the current bill or increments its quantity.
 * @param {string} itemId - The Firestore ID of the inventory item.
 */
window.addToBill = (itemId) => {
    const inventoryItem = window.allInventoryItems.find(item => item.id === itemId);
    if (!inventoryItem) return;

    let billItem = window.currentBill.find(item => item.id === itemId);

    if (billItem) {
        if (billItem.quantity < inventoryItem.stock) {
            billItem.quantity++;
        } else {
            showMessageBox("Stock Limit Reached", `Cannot add more '${inventoryItem.name}'. Only ${inventoryItem.stock} available.`, 'info');
        }
    } else {
        if (inventoryItem.stock > 0) {
            window.currentBill.push({
                id: itemId,
                name: inventoryItem.name,
                unitPrice: parseFloat(inventoryItem.price),
                quantity: 1,
                inventoryStock: inventoryItem.stock // For max quantity check
            });
        } else {
            showMessageBox("Out of Stock", `'${inventoryItem.name}' is out of stock.`, 'error');
        }
    }
    window.renderBill();
};

/**
 * Removes an item from the bill.
 * @param {string} itemId - The Firestore ID of the inventory item.
 */
window.removeFromBill = (itemId) => {
    const itemIndex = window.currentBill.findIndex(item => item.id === itemId);
    if (itemIndex > -1) {
        window.currentBill.splice(itemIndex, 1);
        window.renderBill();
    }
};

/**
 * Renders the current bill in the HTML table and recalculates totals. (Dark Mode Optimized)
 */
window.renderBill = () => {
    const billListBody = document.getElementById('current-bill-list');
    billListBody.innerHTML = '';
    
    if (window.currentBill.length === 0) {
        billListBody.innerHTML = '<tr id="empty-bill-row"><td colspan="5" class="p-4 text-center text-gray-400">No items added to the bill yet.</td></tr>';
        window.calculateBill();
        return;
    }

    window.currentBill.forEach(item => {
        const total = item.unitPrice * item.quantity;
        const row = billListBody.insertRow();
        // Dark Mode Row Hover
        row.className = 'bg-gray-800 hover:bg-gray-700 transition';

        // Dark Mode Text
        row.insertCell().innerHTML = `<div class="px-4 py-2 text-sm font-medium text-gray-100">${item.name}</div>`;
        
        // Quantity cell with increment/decrement controls - Darkened text/buttons
        const qtyCell = row.insertCell();
        qtyCell.className = 'px-4 py-2 text-sm text-gray-300 font-mono';
        qtyCell.innerHTML = `
            <div class="flex items-center space-x-2">
                <button onclick="changeBillQuantity('${item.id}', -1)" class="text-blue-400 hover:text-blue-300 disabled:text-gray-600" ${item.quantity <= 1 ? 'disabled' : ''}>-</button>
                <span>${item.quantity}</span>
                <button onclick="changeBillQuantity('${item.id}', 1)" class="text-blue-400 hover:text-blue-300 disabled:text-gray-600" ${item.quantity >= item.inventoryStock ? 'disabled' : ''}>+</button>
            </div>
        `;
        
        row.insertCell().innerHTML = `<div class="px-4 py-2 text-sm text-gray-400">₹${item.unitPrice.toFixed(2)}</div>`;
        row.insertCell().innerHTML = `<div class="px-4 py-2 text-sm font-bold text-gray-100">₹${total.toFixed(2)}</div>`;
        
        const removeCell = row.insertCell();
        removeCell.className = 'px-4 py-2 text-right';
        removeCell.innerHTML = `<button onclick="removeFromBill('${item.id}')" class="text-red-400 hover:text-red-300 transition">Remove</button>`;
    });

    window.calculateBill();
};

/**
 * Changes the quantity of a bill item and re-renders the bill.
 * @param {string} itemId 
 * @param {number} delta 
 */
window.changeBillQuantity = (itemId, delta) => {
    let billItem = window.currentBill.find(item => item.id === itemId);
    if (billItem) {
        const newQuantity = billItem.quantity + delta;
        
        if (newQuantity >= 1 && newQuantity <= billItem.inventoryStock) {
            billItem.quantity = newQuantity;
            window.renderBill();
        } else if (newQuantity > billItem.inventoryStock) {
            showMessageBox("Stock Limit Reached", `Cannot exceed stock of ${billItem.inventoryStock} for ${billItem.name}.`, 'info');
        }
    }
};

/**
 * Calculates the subtotal, tax, and grand total of the bill.
 */
window.calculateBill = () => {
    let subtotal = 0;
    window.currentBill.forEach(item => {
        subtotal += item.unitPrice * item.quantity;
    });

    const tax = subtotal * TAX_RATE;
    const grandTotal = subtotal + tax;

    document.getElementById('bill-subtotal').textContent = `₹${subtotal.toFixed(2)}`;
    document.getElementById('bill-tax').textContent = `₹${tax.toFixed(2)}`;
    document.getElementById('bill-grand-total').textContent = `₹${grandTotal.toFixed(2)}`;
};

/**
 * FINALIZED: Processes the checkout and updates the stock in Firestore.
 */
window.handleCheckout = async () => {
    if (window.currentBill.length === 0) {
        showMessageBox("Cannot Checkout", "The bill is empty. Please add products first.", 'error');
        return;
    }

    if (!db || !userId) {
        showMessageBox("Error", "Database is not ready. Please try again.", 'error');
        return;
    }

    const path = getInventoryPath();
    const updates = []; 

    // 1. Prepare all stock deduction updates
    for (const item of window.currentBill) {
        const oldInventoryItem = window.allInventoryItems.find(i => i.id === item.id);
        if (oldInventoryItem) {
            const newStock = (parseInt(oldInventoryItem.stock) || 0) - item.quantity;
            
            if (newStock < 0) {
                showMessageBox("Error", `Stock error: Not enough ${item.name} available.`, 'error');
                return;
            }

            const docRef = doc(db, path, item.id);
            updates.push(updateDoc(docRef, { 
                stock: newStock, 
                updatedAt: new Date().toISOString() 
            }));
        }
    }
    
    const total = parseFloat(document.getElementById('bill-grand-total').textContent.replace('₹', ''));

    try {
        // 2. Execute all batch updates
        await Promise.all(updates);

        // 3. Success message and reset
        showMessageBox(
            "Transaction Complete!", 
            `Sale of ₹${total.toFixed(2)} processed successfully. Inventory stock has been deducted.`, 
            'success'
        );
        
        // Clear the bill after successful stock deduction
        window.currentBill = [];
        window.renderBill();
    } catch (e) {
        console.error("Error updating stock during checkout:", e);
        showMessageBox("Database Error", "Failed to finalize sale and update inventory. Check console for details.", 'error');
    }
};

// --- Reports Logic ---

/**
 * Renders the detailed inventory reports and calculates key metrics. (Dark Mode Optimized)
 */
window.renderReports = () => {
    const items = window.allInventoryItems;
    const tableBody = document.getElementById('report-valuation-list');
    tableBody.innerHTML = '';

    let totalValue = 0;
    let totalStock = 0;
    let highValueCount = 0;

    if (items.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-400">No inventory data available to generate report.</td></tr>';
    }

    // Calculate metrics and populate table
    items.forEach(item => {
        const stock = parseInt(item.stock, 10) || 0;
        const price = parseFloat(item.price) || 0;
        const value = stock * price;

        totalValue += value;
        totalStock += stock;

        if (price >= HIGH_VALUE_THRESHOLD) {
            highValueCount++;
        }

        const row = tableBody.insertRow();
        row.className = 'bg-gray-800 hover:bg-gray-700 transition';

        row.insertCell().innerHTML = `<div class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-100">${item.name}</div>`;
        row.insertCell().innerHTML = `<div class="px-6 py-4 whitespace-nowrap text-sm text-gray-400">₹${price.toFixed(2)}</div>`;
        row.insertCell().innerHTML = `<div class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">${stock}</div>`;
        
        const valueCell = row.insertCell();
        valueCell.className = 'px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-gray-100';
        valueCell.innerHTML = `₹${value.toFixed(2)}`;
    });

    // Update Report Cards
    document.getElementById('report-total-value').textContent = `₹${totalValue.toFixed(2)}`;
    document.getElementById('report-total-stock').textContent = totalStock;
    document.getElementById('report-high-value').textContent = highValueCount;
};


/**
 * Mocks initial data if the collection is empty upon first load.
 */
async function mockInitialData() {
    const path = getInventoryPath();
    if (!path) return;

    try {
        const collRef = collection(db, path);
        
        // Mock data
        const mockItems = [
            { name: "Paracetamol 500mg", batch: "P500-A22", expiryDate: "2026-03-01", stock: 150, price: 2.50 },
            { name: "Amoxicillin 250mg", batch: "AMX-B14", expiryDate: "2025-01-20", stock: 8, price: 4.00 },
            { name: "Band-Aids Pack (100)", batch: "BA-C90", expiryDate: "2027-10-15", stock: 45, price: 50.00 },
            { name: "Insulin Pen 3ml", batch: "IP-D05", expiryDate: "2025-03-05", stock: 5, price: 800.00 },
            { name: "Cough Syrup (100ml)", batch: "CS-E67", expiryDate: "2025-06-15", stock: 22, price: 120.00 },
            { name: "Vitamins B12 Inject.", batch: "VB12-Z7", expiryDate: "2026-11-01", stock: 12, price: 950.00 } // High Value Item
        ];
        
        const sentinelDocRef = doc(db, path, "MOCK_DATA_SENTINEL");
        
        if (!localStorage.getItem(`medisync_mocked_${userId}`)) {
            console.log("Adding initial mock data...");
            for (const item of mockItems) {
                await addDoc(collRef, item);
            }
            await setDoc(sentinelDocRef, { initialized: true, userId: userId }, { merge: true });
            localStorage.setItem(`medisync_mocked_${userId}`, 'true');
            console.log("Mock data added and marked as initialized.");
        }

    } catch (e) {
        console.warn("Could not mock initial data (expected on subsequent loads or if Firestore is unreachable):", e.message);
    }
}


// --- Event Listeners and Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    initializeFirebase();
    renderSalesChart(); // Render the new chart immediately

    // Sidebar toggle logic for mobile
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    
    sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('-translate-x-full');
    });

    window.updateSidebarActiveState('nav-dashboard');
});