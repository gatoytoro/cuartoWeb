import { mountSunrise } from "./sunrise.mjs";

for (const mark of document.querySelectorAll("[data-sunrise-spin]")) {
  mountSunrise(mark);
}

const input = document.querySelector("#help-q");
if (input) {
  const sections = [...document.querySelectorAll("[data-help-section]")];
  const empty = document.querySelector("#help-empty");

  const apply = () => {
    const query = input.value.trim().toLowerCase();
    let shown = 0;
    for (const section of sections) {
      const hit = query === "" || section.textContent.toLowerCase().includes(query);
      section.hidden = !hit;
      if (hit) shown += 1;
    }
    if (empty) empty.hidden = query === "" || shown > 0;
  };

  input.addEventListener("input", apply);
  input.form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const url = new URL(location.href);
    const query = input.value.trim();
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    history.replaceState(null, "", url);
    apply();
  });

  const initial = new URL(location.href).searchParams.get("q");
  if (initial) {
    input.value = initial;
    apply();
  }
}
