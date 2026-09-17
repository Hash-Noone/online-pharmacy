const token = localStorage.getItem("access_token");

const titleEl = document.getElementById("payment-title");
const messageEl = document.getElementById("payment-message");
const spinnerEl = document.getElementById("payment-spinner");
const ordersLinkEl = document.getElementById("payment-orders-link");

function showResult(success, title, message) {
    spinnerEl.textContent = success ? "✅" : "❌";
    titleEl.textContent = title;
    messageEl.textContent = message;
    ordersLinkEl.classList.remove("hidden");
}

if (!token) {
    showResult(
        false,
        "You're not logged in",
        "Log in again, then check your order history to see the latest payment status."
    );
    ordersLinkEl.textContent = "Go to Login";
    ordersLinkEl.href = "login.html";
} else {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("order_id");
    // Paystack appends one of these depending on integration version.
    const reference = params.get("reference") || params.get("trxref");

    if (!orderId || !reference) {
        showResult(
            false,
            "Missing payment details",
            "We couldn't find a payment reference in the URL. If you completed a payment, check your order history for its status."
        );
    } else {
        fetch(`/orders/${orderId}/payment/verify?reference=${encodeURIComponent(reference)}`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}` },
        })
            .then(response => response.json())
            .then(data => {
                if (data.detail) {
                    showResult(false, "Verification failed", data.detail);
                    return;
                }

                if (data.order && data.order.payment_status === "Paid") {
                    showResult(true, "Payment successful!", "Your order has been paid for and is now being processed.");
                } else {
                    showResult(false, "Payment not confirmed", data.message || "Paystack reported this payment did not succeed.");
                }
            })
            .catch(error => {
                console.error("Error verifying payment:", error);
                showResult(false, "Something went wrong", "We couldn't verify this payment. Please check your order history in a moment.");
            });
    }
}
