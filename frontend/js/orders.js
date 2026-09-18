const token = localStorage.getItem("access_token");
const role = localStorage.getItem("role");

if (!token || role !== "customer") {
    alert("Please login as a customer to view your orders.");
    window.location.href = "login.html";
}

function authHeaders(extra = {}) {
    return { "Authorization": `Bearer ${token}`, ...extra };
}

function handleAuthError(response) {
    if (response.status === 401 || response.status === 403) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("role");
        alert("Your session has expired. Please log in again.");
        window.location.href = "login.html";
        return true;
    }
    return false;
}

const PAYMENT_BADGE_CLASS = {
    "Pending": "badge-pending",
    "Paid": "badge-paid",
    "Failed": "badge-failed",
    "Refunded": "badge-refunded",
};

function loadOrders() {
    fetch("/customer/orders", { headers: authHeaders() })
        .then(response => {
            if (handleAuthError(response)) return;
            return response.json();
        })
        .then(orders => {
            if (!orders) return;
            renderOrders(orders);
        })
        .catch(error => console.error("Error loading orders:", error));
}

function renderOrders(orders) {
    const container = document.getElementById("orders-list");
    container.innerHTML = "";

    if (orders.length === 0) {
        container.innerHTML = `<p class="cart-empty">You haven't placed any orders yet. <a href="medicines.html">Browse medicines</a> to get started.</p>`;
        return;
    }

    // Most recent first.
    orders.slice().reverse().forEach(order => {
        const card = document.createElement("div");
        card.className = "order-card";

        const itemsList = order.items
            .map(item => `<li>${item.quantity} × ${item.name} — ₦${item.total_price.toLocaleString()}</li>`)
            .join("");

        const badgeClass = PAYMENT_BADGE_CLASS[order.payment_status] || "badge-pending";
        const canPay = order.payment_status === "Pending";

        card.innerHTML = `
            <div class="order-card-header">
                <div>
                    <h3>Order #${order.id}</h3>
                    <span class="order-status">${order.status}</span>
                </div>
                <span class="payment-badge ${badgeClass}">${order.payment_status}</span>
            </div>

            <ul class="order-items-list">${itemsList}</ul>

            <p class="order-delivery-address">🚚 Delivering to: ${order.delivery_address}</p>

            <div class="cart-summary-row">
                <span>Subtotal</span>
                <span>₦${order.subtotal.toLocaleString()}</span>
            </div>
            <div class="cart-summary-row">
                <span>Tax</span>
                <span>₦${order.tax_amount.toLocaleString()}</span>
            </div>
            <div class="cart-summary-row">
                <span>Delivery Fee</span>
                <span>₦${order.delivery_fee.toLocaleString()}</span>
            </div>

            <div class="order-card-footer">
                <strong>Total: ₦${order.total_price.toLocaleString()}</strong>
                ${canPay ? `<button class="pay-now" data-id="${order.id}">Pay Now</button>` : ""}
            </div>
        `;

        container.appendChild(card);
    });

    document.querySelectorAll(".pay-now").forEach(button => {
        button.addEventListener("click", () => payForOrder(button.dataset.id, button));
    });
}

function payForOrder(orderId, button) {
    button.disabled = true;
    button.textContent = "Redirecting…";

    fetch(`/orders/${orderId}/payment`, {
        method: "POST",
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
                button.disabled = false;
                button.textContent = "Pay Now";
                return;
            }

            window.location.href = data.authorization_url;
        })
        .catch(error => {
            console.error("Error starting payment:", error);
            button.disabled = false;
            button.textContent = "Pay Now";
        });
}

loadOrders();
