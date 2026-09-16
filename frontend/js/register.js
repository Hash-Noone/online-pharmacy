const registerForm = document.getElementById("register-form");

registerForm.addEventListener("submit", function(event) {
    event.preventDefault();

    const username = document.getElementById("username").value;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    fetch("/register", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            username: username,
            email: email,
            password: password
        })
    })
    .then(response => response.json())
    .then(data => {
        console.log(data);

        if (data.detail) {
            document.getElementById("register-message").textContent =
                data.detail;
            return;
        }

        document.getElementById("register-message").textContent =
            "Account created successfully!";

        registerForm.reset();
    })
    .catch(error => {
        console.error("Error:", error);
    });
});