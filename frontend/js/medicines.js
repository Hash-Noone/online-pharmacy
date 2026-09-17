function loadMedicines() {

    const medicineList = document.getElementById("medicine-list");

    fetch("/medicines")

        .then(response => {

            if (!response.ok) {
                throw new Error("Failed to load medicines");
            }

            return response.json();
        })

        .then(medicines => {

            medicineList.innerHTML = "";

            if (medicines.length === 0) {

                medicineList.innerHTML = `
                    <p class="cart-empty">
                        No medicines are currently available.
                    </p>
                `;

                return;
            }

            medicines.forEach(medicine => {

                const medicineCard = document.createElement("div");

                medicineCard.className = "medicine-card";

                medicineCard.innerHTML = `
                    <div class="medicine-icon">
                        💊
                    </div>

                    <div class="medicine-info">

                        <span class="medicine-category">
                            ${medicine.category}
                        </span>

                        <h3>
                            ${medicine.name}
                        </h3>

                        <p class="medicine-description">
                            ${medicine.description}
                        </p>

                        <p class="medicine-stock">
                            ${medicine.stock} available
                        </p>

                        <div class="medicine-bottom">

                            <strong>
                                ₦${medicine.price.toLocaleString()}
                            </strong>

                            <button
                                class="add-to-cart"
                                data-id="${medicine.id}"
                                ${medicine.stock === 0 ? "disabled" : ""}
                            >
                                ${medicine.stock === 0 ? "Out of Stock" : "Add to Cart"}
                            </button>

                        </div>

                    </div>
                `;

                medicineList.appendChild(medicineCard);
            });


            // Add click events to all Add to Cart buttons

            document.querySelectorAll(".add-to-cart").forEach(button => {

                button.addEventListener("click", function () {

                    const medicineId = this.dataset.id;

                    addToCart(medicineId, this);

                });

            });

        })

        .catch(error => {

            console.error("Error loading medicines:", error);

            medicineList.innerHTML = `
                <p class="cart-empty">
                    Unable to load medicines.
                    Please try again later.
                </p>
            `;

        });
}


function addToCart(medicineId, button) {

    const token = localStorage.getItem("access_token");

    // User isn't logged in

    if (!token) {

        alert("Please login before adding items to your cart.");

        window.location.href = "login.html";

        return;
    }


    // Prevent multiple clicks while request is running

    button.disabled = true;

    button.textContent = "Adding...";


    fetch("/cart", {

        method: "POST",

        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },

        body: JSON.stringify({
            medicine_id: Number(medicineId),
            quantity: 1
        })

    })

        .then(response => {

            if (response.status === 401 || response.status === 403) {

                localStorage.removeItem("access_token");
                localStorage.removeItem("role");

                alert("Your session has expired. Please login again.");

                window.location.href = "login.html";

                return null;
            }

            return response.json();

        })

        .then(data => {

            if (!data) {
                return;
            }


            if (data.detail) {

                alert(data.detail);

                button.disabled = false;
                button.textContent = "Add to Cart";

                return;
            }


            alert("Medicine added to cart!");

            button.disabled = false;
            button.textContent = "Added ✓";


            // Change the button back after a short delay

            setTimeout(() => {

                button.textContent = "Add to Cart";

            }, 1500);

        })

        .catch(error => {

            console.error("Error adding to cart:", error);

            alert("Something went wrong. Please try again.");

            button.disabled = false;
            button.textContent = "Add to Cart";

        });

}


// Load medicines when the page opens

loadMedicines();