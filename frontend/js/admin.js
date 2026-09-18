// --- Access guard: only logged-in admins get past this page ---
const token = localStorage.getItem("access_token");
const role = localStorage.getItem("role");

if (!token || role !== "admin") {
    window.location.href = "login.html";
}

function authHeaders(extra = {}) {
    return { "Authorization": `Bearer ${token}`, ...extra };
}

function handleAuthError(response) {
    if (response.status === 401 || response.status === 403) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("role");
        window.location.href = "login.html";
        return true;
    }
    return false;
}

// --- Tabs ---
document.querySelectorAll(".admin-tab-button").forEach(button => {
    button.addEventListener("click", () => {
        document.querySelectorAll(".admin-tab-button").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".admin-tab-panel").forEach(p => p.classList.add("hidden"));

        button.classList.add("active");
        document.getElementById(button.dataset.tab).classList.remove("hidden");

        if (button.dataset.tab === "analytics-tab") {
            loadAnalytics();
        }
    });
});

// --- Medicines ---
function loadMedicines() {
    fetch("/medicines")
        .then(response => response.json())
        .then(medicines => {
            const tbody = document.getElementById("medicines-table-body");
            tbody.innerHTML = "";

            medicines.forEach(medicine => {
                const row = document.createElement("tr");
                const thumb = medicine.image_url
                    ? `<img class="medicine-thumb" src="${medicine.image_url}" alt="${medicine.name}" onerror="this.style.visibility='hidden';">`
                    : "—";
                row.innerHTML = `
                    <td>${thumb}</td>
                    <td>${medicine.name}</td>
                    <td>${medicine.category}</td>
                    <td>₦${medicine.price.toLocaleString()}</td>
                    <td>${medicine.stock}</td>
                    <td><button class="delete-medicine" data-id="${medicine.id}">Delete</button></td>
                `;
                tbody.appendChild(row);
            });

            document.querySelectorAll(".delete-medicine").forEach(button => {
                button.addEventListener("click", () => deleteMedicine(button.dataset.id));
            });
        })
        .catch(error => console.error("Error loading medicines:", error));
}

document.getElementById("show-add-medicine").addEventListener("click", () => {
    document.getElementById("add-medicine-form").classList.toggle("hidden");
});

document.getElementById("add-medicine-form").addEventListener("submit", function (event) {
    event.preventDefault();

    const imageUrl = document.getElementById("med-image-url").value.trim();

    const payload = {
        name: document.getElementById("med-name").value,
        price: Number(document.getElementById("med-price").value),
        category: document.getElementById("med-category").value,
        stock: Number(document.getElementById("med-stock").value),
        description: document.getElementById("med-description").value,
        image_url: imageUrl || null,
    };

    fetch("/medicines", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
    })
        .then(response => {
            if (handleAuthError(response)) return;
            return response.json();
        })
        .then(data => {
            if (!data) return;
            if (data.detail) {
                alert(data.detail);
                return;
            }
            this.reset();
            this.classList.add("hidden");
            loadMedicines();
        })
        .catch(error => console.error("Error adding medicine:", error));
});

function deleteMedicine(medicineId) {
    if (!confirm("Delete this medicine?")) return;

    fetch(`/medicines/${medicineId}`, {
        method: "DELETE",
        headers: authHeaders(),
    })
        .then(response => {
            if (handleAuthError(response)) return;
            return response.json();
        })
        .then(data => {
            if (!data) return;
            if (data.detail) {
                alert(data.detail);
                return;
            }
            loadMedicines();
        })
        .catch(error => console.error("Error deleting medicine:", error));
}

// --- Orders ---
const ORDER_TRANSITIONS = {
    "Pending": ["Processing", "Cancelled"],
    "Processing": ["Shipped", "Cancelled"],
    "Shipped": ["Delivered"],
};

function loadOrders() {
    fetch("/admin/orders", { headers: authHeaders() })
        .then(response => {
            if (handleAuthError(response)) return;
            return response.json();
        })
        .then(orders => {
            if (!orders) return;
            const tbody = document.getElementById("orders-table-body");
            tbody.innerHTML = "";

            orders.forEach(order => {
                const nextStatuses = ORDER_TRANSITIONS[order.status] || [];
                const options = nextStatuses
                    .map(status => `<option value="${status}">${status}</option>`)
                    .join("");

                const row = document.createElement("tr");
                row.innerHTML = `
                    <td>${order.id}</td>
                    <td>${order.customer_username}</td>
                    <td>${order.delivery_address}</td>
                    <td>₦${order.total_price.toLocaleString()}</td>
                    <td>${order.status}</td>
                    <td>${order.payment_status}</td>
                    <td>
                        ${options
                            ? `<select class="order-status-select" data-id="${order.id}">
                                   <option value="">Change status…</option>
                                   ${options}
                               </select>`
                            : "—"}
                    </td>
                `;
                tbody.appendChild(row);
            });

            document.querySelectorAll(".order-status-select").forEach(select => {
                select.addEventListener("change", () => {
                    if (!select.value) return;
                    updateOrderStatus(select.dataset.id, select.value);
                });
            });
        })
        .catch(error => console.error("Error loading orders:", error));
}

function updateOrderStatus(orderId, status) {
    fetch(`/admin/orders/${orderId}/status`, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status }),
    })
        .then(response => {
            if (handleAuthError(response)) return;
            return response.json();
        })
        .then(data => {
            if (!data) return;
            if (data.detail) {
                alert(data.detail);
                return;
            }
            loadOrders();
        })
        .catch(error => console.error("Error updating order:", error));
}

// --- Analytics ---
function loadAnalytics() {
    fetch("/admin/analytics", { headers: authHeaders() })
        .then(response => {
            if (handleAuthError(response)) return;
            return response.json();
        })
        .then(data => {
            if (!data) return;
            if (data.detail) return;

            document.getElementById("analytics-today-revenue").textContent = `₦${data.today.revenue.toLocaleString()}`;
            document.getElementById("analytics-today-orders").textContent = `${data.today.orders} paid order${data.today.orders === 1 ? "" : "s"}`;

            document.getElementById("analytics-week-revenue").textContent = `₦${data.this_week.revenue.toLocaleString()}`;
            document.getElementById("analytics-week-orders").textContent = `${data.this_week.orders} paid order${data.this_week.orders === 1 ? "" : "s"}`;

            document.getElementById("analytics-month-revenue").textContent = `₦${data.this_month.revenue.toLocaleString()}`;
            document.getElementById("analytics-month-orders").textContent = `${data.this_month.orders} paid order${data.this_month.orders === 1 ? "" : "s"}`;

            const lowStockBody = document.getElementById("low-stock-table-body");
            lowStockBody.innerHTML = "";
            if (data.low_stock.length === 0) {
                lowStockBody.innerHTML = `<tr><td colspan="3">All medicines are well stocked.</td></tr>`;
            } else {
                data.low_stock.forEach(medicine => {
                    const row = document.createElement("tr");
                    row.innerHTML = `
                        <td>${medicine.name}</td>
                        <td>${medicine.category}</td>
                        <td><span class="low-stock-badge">${medicine.stock} left</span></td>
                    `;
                    lowStockBody.appendChild(row);
                });
            }

            const bestSellersBody = document.getElementById("best-sellers-table-body");
            bestSellersBody.innerHTML = "";
            if (data.best_sellers.length === 0) {
                bestSellersBody.innerHTML = `<tr><td colspan="3">No sales yet.</td></tr>`;
            } else {
                data.best_sellers.forEach(medicine => {
                    const row = document.createElement("tr");
                    row.innerHTML = `
                        <td>${medicine.name}</td>
                        <td>${medicine.quantity_sold}</td>
                        <td>₦${medicine.revenue.toLocaleString()}</td>
                    `;
                    bestSellersBody.appendChild(row);
                });
            }
        })
        .catch(error => console.error("Error loading analytics:", error));
}

// --- Admins ---
document.getElementById("add-admin-form").addEventListener("submit", function (event) {
    event.preventDefault();

    const payload = {
        username: document.getElementById("admin-username").value,
        password: document.getElementById("admin-password").value,
    };

    fetch("/admin/admins", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
    })
        .then(response => {
            if (handleAuthError(response)) return;
            return response.json();
        })
        .then(data => {
            if (!data) return;
            document.getElementById("admin-message").textContent =
                data.detail || data.message;
            if (!data.detail) this.reset();
        })
        .catch(error => console.error("Error creating admin:", error));
});

// --- Initial load ---
loadMedicines();
loadOrders();
loadAnalytics();
