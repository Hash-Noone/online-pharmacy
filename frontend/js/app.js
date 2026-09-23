// Someone who's already logged in (customer or admin) has no use for the
// "Create Account" button in the hero section.
if (localStorage.getItem("access_token")) {
    const createAccountLink = document.getElementById("create-account-link");
    if (createAccountLink) {
        createAccountLink.remove();
    }
}

fetch("/medicines")
    .then(response => response.json())
    .then(data => {
        console.log(data);
    })
    .catch(error => {
        console.error("Error:", error);
    });