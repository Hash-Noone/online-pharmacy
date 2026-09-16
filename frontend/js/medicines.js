fetch("/medicines")
    .then(response => response.json())
    .then(medicines => {
        const medicineList = document.getElementById("medicine-list");

        medicines.forEach(medicine => {
            const medicineCard = document.createElement("div");

            medicineCard.className = "medicine-card";

            medicineCard.innerHTML = `
                <div class="medicine-icon">💊</div>

                <div class="medicine-info">
                    <span class="medicine-category">
                        ${medicine.category}
                    </span>

                    <h3>${medicine.name}</h3>

                    <p class="medicine-description">
                        ${medicine.description}
                    </p>

                    <p class="medicine-stock">
                        ${medicine.stock} available
                    </p>

                    <div class="medicine-bottom">
                        <strong>₦${medicine.price.toLocaleString()}</strong>

                        <button class="add-to-cart" data-id="${medicine.id}">
                            Add to Cart
                        </button>
                    </div>
                </div>
            `;

            medicineList.appendChild(medicineCard);
        });
        document.querySelectorAll(".add-to-cart").forEach(button => {

    button.addEventListener("click", function() {

        const medicineId = this.dataset.id;

        addToCart(medicineId);

    });

});
    })
    .catch(error => {
        console.error("Error loading medicines:", error);
    });

    function addToCart(medicineId) {

    const token = localStorage.getItem("access_token");

    if (!token) {
        alert("Please login before adding items to your cart.");
        window.location.href = "login.html";
        return;
    }

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
    .then(response => response.json())
    .then(data => {

        console.log(data);

        if (data.detail) {
            alert(data.detail);
            return;
        }

        alert("Medicine added to cart!");

    })
    .catch(error => {
        console.error("Error adding to cart:", error);
    });
}