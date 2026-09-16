const loginForm = document.getElementById("login-form");

loginForm.addEventListener("submit", function(event) {
    event.preventDefault();

    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    const formData = new URLSearchParams();

    formData.append("username", username);
    formData.append("password", password);

    fetch("/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: formData
    })
    .then(response => response.json())
    .then(data => {

        console.log(data);

        if (data.detail) {
            document.getElementById("login-message").textContent =
                data.detail;

            return;
        }

        localStorage.setItem("access_token", data.access_token);

        document.getElementById("login-message").textContent =
            "Login successful!";

        loginForm.reset();

    })
    .catch(error => {
        console.error("Error:", error);
    });
});