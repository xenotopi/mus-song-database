(() => {
  "use strict";

  const readCard = (defaults, aliases = {}) => {
    const params = new URLSearchParams(window.location.search);
    return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => {
      const names = [key, ...(aliases[key] || [])];
      const raw = names.map((name) => params.get(name)).find((value) => value !== null);
      return [key, raw === undefined || raw.trim() === "" ? fallback : raw.trim()];
    }));
  };

  const bindText = (fields) => {
    Object.entries(fields).forEach(([id, text]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = text;
    });
  };

  const fitText = (element) => {
    const minimum = Number(element.dataset.minSize || 24);
    let size = Number.parseFloat(getComputedStyle(element).fontSize);
    while (size > minimum && (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth)) {
      size -= 1;
      element.style.fontSize = `${size}px`;
    }
  };

  const markReady = () => {
    document.querySelectorAll(".fit-text").forEach(fitText);
    document.documentElement.dataset.ready = "true";
  };

  const finish = () => {
    if (document.fonts?.ready) {
      document.fonts.ready.then(markReady, markReady);
    } else {
      markReady();
    }
  };

  window.MusdbPostCard = Object.freeze({ readCard, bindText, finish });
})();
