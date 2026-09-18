// Runs on every page and updates the navigation
// based on the user's login status.

document.addEventListener("DOMContentLoaded", function () {

    addWhatsAppButton();

    const token = localStorage.getItem("access_token");
    const role = localStorage.getItem("role");

    const navLinks = document.querySelector("nav div");

    if (!navLinks) {
        return;
    }

    // Remove any links that nav.js controls.
    // This prevents duplicates.
    navLinks.querySelectorAll("#orders-link, #logout-link, #admin-link").forEach(link => {
        link.remove();
    });

    const loginLink = navLinks.querySelector('a[href="login.html"]');
    const registerLink = navLinks.querySelector('a[href="register.html"]');
    const cartLink = navLinks.querySelector('a[href="cart.html"]');

    // -------------------------
    // ADMIN
    // -------------------------

    if (token && role === "admin") {

        // Admin doesn't need Register.
        if (registerLink) {
            registerLink.remove();
        }

        // Admin doesn't need customer cart.
        if (cartLink) {
            cartLink.remove();
        }

        // Change Login to Admin Dashboard.
        if (loginLink) {
            loginLink.textContent = "Admin Dashboard";
            loginLink.href = "admin.html";
            loginLink.id = "admin-link";
        } else {
            const adminLink = document.createElement("a");

            adminLink.href = "admin.html";
            adminLink.id = "admin-link";
            adminLink.textContent = "Admin Dashboard";

            navLinks.appendChild(adminLink);
        }

        addLogoutLink(navLinks);

        return;
    }

    // -------------------------
    // CUSTOMER
    // -------------------------

    if (token && role === "customer") {

        // Customer doesn't need Register.
        if (registerLink) {
            registerLink.remove();
        }

        // Customer doesn't need Login.
        if (loginLink) {
            loginLink.remove();
        }

        // Add My Orders.
        addOrdersLink(navLinks);

        // Keep Cart visible.
        // Add Logout.
        addLogoutLink(navLinks);

        return;
    }

    // -------------------------
    // NOT LOGGED IN
    // -------------------------

    // Leave the normal navigation unchanged.
});


// Floating "Chat with a Pharmacist" button, shown on every page.
// Pulls the support number from /config so it can be changed server-side
// without touching the frontend.
function addWhatsAppButton() {

    if (document.getElementById("whatsapp-float")) {
        return;
    }

    const link = document.createElement("a");
    link.id = "whatsapp-float";
    link.className = "whatsapp-float";
    link.target = "_blank";
    link.rel = "noopener";
    link.innerHTML = `<span class="whatsapp-icon">💬</span><span class="whatsapp-label">Chat with a Pharmacist</span>`;

    // Sensible default while /config is loading (or if it fails).
    link.href = "https://wa.me/2348000000000?text=" +
        encodeURIComponent("Hi, I have a question about a medicine on PharmaHub.");

    document.body.appendChild(link);

    fetch("/config")
        .then(response => response.json())
        .then(config => {
            if (config && config.whatsapp_number) {
                link.href = `https://wa.me/${config.whatsapp_number}?text=` +
                    encodeURIComponent("Hi, I have a question about a medicine on PharmaHub.");
            }
        })
        .catch(() => {
            // Keep the default link if /config isn't reachable.
        });
}


function addOrdersLink(navLinks) {

    // Don't create a duplicate.
    if (navLinks.querySelector("#orders-link")) {
        return;
    }

    const ordersLink = document.createElement("a");

    ordersLink.href = "orders.html";
    ordersLink.id = "orders-link";
    ordersLink.textContent = "My Orders";

    const cartLink = navLinks.querySelector('a[href="cart.html"]');

    if (cartLink) {
        navLinks.insertBefore(ordersLink, cartLink);
    } else {
        navLinks.appendChild(ordersLink);
    }
}


function addLogoutLink(navLinks) {

    // Don't create a duplicate.
    if (navLinks.querySelector("#logout-link")) {
        return;
    }

    const logoutLink = document.createElement("a");

    logoutLink.href = "#";
    logoutLink.id = "logout-link";
    logoutLink.textContent = "Logout";

    logoutLink.addEventListener("click", function (event) {

        event.preventDefault();

        localStorage.removeItem("access_token");
        localStorage.removeItem("role");

        window.location.href = "login.html";
    });

    navLinks.appendChild(logoutLink);
}
