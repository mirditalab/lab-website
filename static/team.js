function onReady(callback) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", callback, { once: true });
  } else {
    callback();
  }
}

function initTeamDetails() {
  const grids = Array.from(document.querySelectorAll(".team-grid"));
  if (!grids.length) return;

  const sections = [];
  const allDetailIds = new Set();

  function getHashId() {
    return window.location.hash ? window.location.hash.slice(1) : "";
  }

  function updateHash(targetId) {
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, "", `#${targetId}`);
    } else {
      window.location.hash = targetId;
    }
  }

  function clearHash() {
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    } else {
      window.location.hash = "";
    }
  }

  grids.forEach((grid) => {
    const section = grid.closest("section") || document;
    const detailPanels = Array.from(section.querySelectorAll(".team-details .team-detail"));
    if (!detailPanels.length) return;

    const cards = Array.from(grid.querySelectorAll("[data-team-target]"));
    if (!cards.length) return;

    const detailsById = new Map();
    detailPanels.forEach((panel) => {
      if (panel.id) {
        detailsById.set(panel.id, panel);
        allDetailIds.add(panel.id);
      }
    });

    const cardsByTarget = new Map();
    cards.forEach((card) => {
      const targetId = card.getAttribute("data-team-target");
      if (targetId) {
        cardsByTarget.set(targetId, card);
      }
    });

    function closeAll() {
      cards.forEach((card) => {
        card.setAttribute("aria-expanded", "false");
        card.classList.remove("is-active");
      });
      detailPanels.forEach((panel) => {
        panel.hidden = true;
        panel.setAttribute("aria-hidden", "true");
      });
    }

    function openDetail(card, targetId) {
      const panel = detailsById.get(targetId);
      if (!panel) return;
      closeAll();
      panel.hidden = false;
      panel.setAttribute("aria-hidden", "false");
      card.setAttribute("aria-expanded", "true");
      card.classList.add("is-active");
    }

    function openById(targetId) {
      const card = cardsByTarget.get(targetId);
      if (!card) return false;
      openDetail(card, targetId);
      return true;
    }

    grid.addEventListener("click", (event) => {
      const card = event.target.closest("[data-team-target]");
      if (!card || !grid.contains(card)) return;
      const targetId = card.getAttribute("data-team-target");
      if (!targetId) return;
      const isExpanded = card.getAttribute("aria-expanded") === "true";
      if (isExpanded) {
        closeAll();
        if (getHashId() === targetId) {
          clearHash();
        }
        return;
      }
      openDetail(card, targetId);
      updateHash(targetId);
    });

    grid.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const card = event.target.closest("[data-team-target]");
      if (!card || !grid.contains(card)) return;
      event.preventDefault();
      const targetId = card.getAttribute("data-team-target");
      if (!targetId) return;
      const isExpanded = card.getAttribute("aria-expanded") === "true";
      if (isExpanded) {
        closeAll();
        if (getHashId() === targetId) {
          clearHash();
        }
        return;
      }
      openDetail(card, targetId);
      updateHash(targetId);
    });

    sections.push({ closeAll, openById });
  });

  function closeAllSections() {
    sections.forEach((section) => section.closeAll());
  }

  function openByHash() {
    const targetId = getHashId();
    if (!targetId || !allDetailIds.has(targetId)) return;
    closeAllSections();
    sections.some((section) => section.openById(targetId));
  }

  window.addEventListener("hashchange", openByHash);
  openByHash();
}

onReady(initTeamDetails);
