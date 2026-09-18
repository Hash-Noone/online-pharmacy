const token = localStorage.getItem("access_token");
const role = localStorage.getItem("role");

if (!token || role !== "customer") {
    alert("Please login as a customer to view your cart.");
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

function loadCart() {
    fetch("/cart", { headers: authHeaders() })
        .then(response => {
            if (handleAuthError(response)) return;
            return response.json();
        })
        .then(data => {
            if (!data) return;
            renderCart(data);
        })
        .catch(error => console.error("Error loading cart:", error));
}

function renderCart(data) {
    const items = data.cart;
    const container = document.getElementById("cart-items");
    const summaryEl = document.getElementById("cart-summary");
    const deliveryAddressSection = document.getElementById("delivery-address-section");
    const checkoutButton = document.getElementById("checkout-button");

    container.innerHTML = "";

    if (items.length === 0) {
        container.innerHTML = `<p class="cart-empty">Your cart is empty. <a href="medicines.html">Browse medicines</a> to add something.</p>`;
        summaryEl.classList.add("hidden");
        deliveryAddressSection.classList.add("hidden");
        checkoutButton.disabled = true;
        return;
    }

    checkoutButton.disabled = false;
    summaryEl.classList.remove("hidden");
    deliveryAddressSection.classList.remove("hidden");

    document.getElementById("summary-subtotal").textContent = `₦${data.subtotal.toLocaleString()}`;
    document.getElementById("summary-tax-label").textContent = `Tax (${(data.tax_rate * 100).toFixed(1)}% VAT)`;
    document.getElementById("summary-tax").textContent = `₦${data.tax_amount.toLocaleString()}`;
    document.getElementById("summary-delivery").textContent = `₦${data.delivery_fee.toLocaleString()}`;
    document.getElementById("summary-grand-total").textContent = `₦${data.grand_total.toLocaleString()}`;

    items.forEach(item => {
        const row = document.createElement("div");
        row.className = "cart-item";
        row.innerHTML = `
            <div class="cart-item-info">
                <h3>${item.name}</h3>
                <p>₦${item.price.toLocaleString()} each</p>
            </div>

            <div class="cart-item-controls">
                <input
                    type="number"
                    min="1"
                    value="${item.quantity}"
                    class="cart-quantity-input"
                    data-id="${item.medicine_id}"
                >
                <strong>₦${item.total_price.toLocaleString()}</strong>
                <button class="cart-remove" data-id="${item.medicine_id}">Remove</button>
            </div>
        `;
        container.appendChild(row);
    });

    document.querySelectorAll(".cart-quantity-input").forEach(input => {
        input.addEventListener("change", () => {
            const quantity = Number(input.value);
            if (quantity < 1) {
                input.value = 1;
                return;
            }
            updateQuantity(input.dataset.id, quantity);
        });
    });

    document.querySelectorAll(".cart-remove").forEach(button => {
        button.addEventListener("click", () => removeItem(button.dataset.id));
    });
}

function updateQuantity(medicineId, quantity) {
    fetch(`/cart/${medicineId}`, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ quantity }),
    })
        .then(response => {
            if (handleAuthError(response)) return;
            return response.json();
        })
        .then(data => {
            if (!data) return;
            if (data.detail) {
                alert(data.detail);
            }
            loadCart();
        })
        .catch(error => console.error("Error updating cart item:", error));
}

function removeItem(medicineId) {
    fetch(`/cart/${medicineId}`, {
        method: "DELETE",
        headers: authHeaders(),
    })
        .then(response => {
            if (handleAuthError(response)) return;
            return response.json();
        })
        .then(data => {
            if (!data) return;
            loadCart();
        })
        .catch(error => console.error("Error removing cart item:", error));
}

document.getElementById("checkout-button").addEventListener("click", function () {
    const deliveryAddress = document.getElementById("delivery-address").value.trim();

    if (deliveryAddress.length < 5) {
        alert("Please enter a delivery address (at least 5 characters).");
        return;
    }

    this.disabled = true;
    this.textContent = "Placing order…";

    fetch("/checkout", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ delivery_address: deliveryAddress }),
    })
        .then(response => {
            if (handleAuthError(response)) return;
            return response.json();
        })
        .then(data => {
            if (!data) return;

            if (data.detail) {
                alert(data.detail);
                this.disabled = false;
                this.textContent = "Checkout";
                return;
            }

            // Order placed — now kick off payment for it.
            const orderId = data.order.id;
            this.textContent = "Redirecting to payment…";
            return startPayment(orderId);
        })
        .catch(error => {
            console.error("Error during checkout:", error);
            this.disabled = false;
            this.textContent = "Checkout";
        });
});

function startPayment(orderId) {
    return fetch(`/orders/${orderId}/payment`, {
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
                return;
            }

            // Off to Paystack's hosted checkout; it will redirect back to
            // payment-callback.html when the shopper is done.
            window.location.href = data.authorization_url;
        })
        .catch(error => console.error("Error starting payment:", error));
}

loadCart();
