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
                row.innerHTML = `
                    <td>${medicine.name}</td>
                    <td>${medicine.category}</td>
                    <td>₦${medicine.price.toLocaleString()}</td>
                    <td>${medicine.stock}</td>
                    <td>${medicine.prescription_required ? "Yes" : "No"}</td>
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

    const payload = {
        name: document.getElementById("med-name").value,
        price: Number(document.getElementById("med-price").value),
        category: document.getElementById("med-category").value,
        stock: Number(document.getElementById("med-stock").value),
        description: document.getElementById("med-description").value,
        prescription_required: document.getElementById("med-prescription").checked,
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

// --- Prescriptions ---
function loadPrescriptions() {
    fetch("/admin/prescriptions", { headers: authHeaders() })
        .then(response => {
            if (handleAuthError(response)) return;
            return response.json();
        })
        .then(prescriptions => {
            if (!prescriptions) return;
            const tbody = document.getElementById("prescriptions-table-body");
            tbody.innerHTML = "";

            prescriptions.forEach(prescription => {
                const canReview = prescription.status === "Pending";
                const row = document.createElement("tr");
                row.innerHTML = `
                    <td>${prescription.id}</td>
                    <td>${prescription.customer_username}</td>
                    <td>${prescription.medicine_id}</td>
                    <td>${prescription.doctor_name}</td>
                    <td>${new Date(prescription.expiry_date).toLocaleDateString()}</td>
                    <td>${prescription.status}</td>
                    <td>
                        ${canReview
                            ? `<button class="approve-prescription" data-id="${prescription.id}">Approve</button>
                               <button class="reject-prescription" data-id="${prescription.id}">Reject</button>`
                            : "—"}
                    </td>
                `;
                tbody.appendChild(row);
            });

            document.querySelectorAll(".approve-prescription").forEach(button => {
                button.addEventListener("click", () => updatePrescriptionStatus(button.dataset.id, "Approved"));
            });
            document.querySelectorAll(".reject-prescription").forEach(button => {
                button.addEventListener("click", () => updatePrescriptionStatus(button.dataset.id, "Rejected"));
            });
        })
        .catch(error => console.error("Error loading prescriptions:", error));
}

function updatePrescriptionStatus(prescriptionId, status) {
    fetch(`/admin/prescriptions/${prescriptionId}/status`, {
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
            loadPrescriptions();
        })
        .catch(error => console.error("Error updating prescription:", error));
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
loadPrescriptions();
