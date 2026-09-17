// Runs on every page to keep the top nav in sync with who's logged in.
document.addEventListener("DOMContentLoaded", function () {
    const token = localStorage.getItem("access_token");
    const role = localStorage.getItem("role");
    const navLinks = document.querySelector("nav div");

    if (!navLinks) {
        return;
    }

    const loginLink = navLinks.querySelector('a[href="login.html"]');

    if (token && role === "admin") {
        // Admins don't need the customer-facing cart link, but do need a
        // way back to their dashboard.
        const cartLink = navLinks.querySelector('a[href="cart.html"]');
        if (cartLink) {
            cartLink.remove();
        }

        if (loginLink) {
            loginLink.textContent = "Admin Dashboard";
            loginLink.setAttribute("href", "admin.html");
        }

        addLogoutLink(navLinks);
    } else if (token && role === "customer") {
        if (loginLink) {
            loginLink.remove();
        }
        addOrdersLink(navLinks);
        addLogoutLink(navLinks);
    }
    // Not logged in: leave the nav as-is (Login link visible).
});

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
