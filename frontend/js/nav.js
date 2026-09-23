// PharmaHub navigation
// Updates the navbar based on the user's login status.

document.addEventListener("DOMContentLoaded", function () {
    addWhatsAppButton();

    const token = localStorage.getItem("access_token");
    const role = localStorage.getItem("role");

    const nav = document.querySelector("nav");

    if (!nav) {
        return;
    }

    const navLinks = nav.querySelector("div");

    if (!navLinks) {
        return;
    }

    // Create mobile menu button
    addMobileMenuButton(nav, navLinks);

    // Add dark mode button
    addThemeToggle(navLinks);

    // Remove links controlled by nav.js.
    navLinks
        .querySelectorAll("#orders-link, #logout-link, #admin-link")
        .forEach(link => link.remove());

    const loginLink = navLinks.querySelector('a[href="login.html"]');
    const registerLink = navLinks.querySelector('a[href="register.html"]');
    const cartLink = navLinks.querySelector('a[href="cart.html"]');

    // -------------------------
    // ADMIN
    // -------------------------

    if (token && role === "admin") {
        if (registerLink) {
            registerLink.remove();
        }

        if (cartLink) {
            cartLink.remove();
        }

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
        if (registerLink) {
            registerLink.remove();
        }

        if (loginLink) {
            loginLink.remove();
        }

        addOrdersLink(navLinks);
        addLogoutLink(navLinks);

        return;
    }

    // -------------------------
    // NOT LOGGED IN
    // -------------------------

    // Keep the normal Login / Register / Cart links.
});


// -------------------------
// Mobile menu
// -------------------------

function addMobileMenuButton(nav, navLinks) {
    if (document.getElementById("mobile-menu-toggle")) {
        return;
    }

    const button = document.createElement("button");

    button.id = "mobile-menu-toggle";
    button.type = "button";
    button.setAttribute("aria-label", "Open navigation menu");
    button.setAttribute("aria-expanded", "false");
    button.textContent = "☰";

    nav.insertBefore(button, navLinks);

    button.addEventListener("click", function () {
        const isOpen = navLinks.classList.toggle("mobile-menu-open");

        button.textContent = isOpen ? "✕" : "☰";
        button.setAttribute("aria-expanded", isOpen ? "true" : "false");
        button.setAttribute(
            "aria-label",
            isOpen ? "Close navigation menu" : "Open navigation menu"
        );
    });

    // Close the menu after clicking a navigation link.
    navLinks.addEventListener("click", function (event) {
        if (event.target.tagName === "A") {
            navLinks.classList.remove("mobile-menu-open");

            button.textContent = "☰";
            button.setAttribute("aria-expanded", "false");
            button.setAttribute("aria-label", "Open navigation menu");
        }
    });
}


// -------------------------
// My Orders
// -------------------------

function addOrdersLink(navLinks) {
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


// -------------------------
// Logout
// -------------------------

function addLogoutLink(navLinks) {
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


// -------------------------
// WhatsApp
// -------------------------

function addWhatsAppButton() {
    if (document.getElementById("whatsapp-float")) {
        return;
    }

    const link = document.createElement("a");

    link.id = "whatsapp-float";
    link.className = "whatsapp-float";
    link.target = "_blank";
    link.rel = "noopener";

    link.innerHTML = `
        <span class="whatsapp-icon">💬</span>
        <span class="whatsapp-label">Chat with a Pharmacist</span>
    `;

    link.href =
        "https://wa.me/2348000000000?text=" +
        encodeURIComponent(
            "Hi, I have a question about a medicine on PharmaHub."
        );

    document.body.appendChild(link);

    fetch("/config")
        .then(response => response.json())
        .then(config => {
            if (config && config.whatsapp_number) {
                link.href =
                    `https://wa.me/${config.whatsapp_number}?text=` +
                    encodeURIComponent(
                        "Hi, I have a question about a medicine on PharmaHub."
                    );
            }
        })
        .catch(() => {
            // Keep the default link.
        });
}


// -------------------------
// Dark mode
// -------------------------

function addThemeToggle(navLinks) {
    if (document.getElementById("theme-toggle")) {
        return;
    }

    const button = document.createElement("button");

    button.id = "theme-toggle";
    button.type = "button";

    function currentTheme() {
        return document.documentElement.getAttribute("data-theme") === "dark"
            ? "dark"
            : "light";
    }

    function updateLabel() {
        button.textContent =
            currentTheme() === "dark"
                ? "☀️ Light"
                : "🌙 Dark";
    }

    button.addEventListener("click", function () {
        const next =
            currentTheme() === "dark"
                ? "light"
                : "dark";

        document.documentElement.setAttribute("data-theme", next);

        localStorage.setItem("theme", next);

        updateLabel();
    });

    updateLabel();

    navLinks.appendChild(button);
}