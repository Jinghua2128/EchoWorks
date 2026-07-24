const destination = new URL("scenario.html", window.location.href);
destination.search = window.location.search;
destination.hash = window.location.hash;
document.getElementById("scenarioLink").href = destination.href;
window.location.replace(destination.href);