import { $ } from "./dom.js";

export function setCollapsibleCardCollapsed(cardId, isCollapsed) {
  const card = $(cardId);
  const toggle = card?.querySelector(".collapse-toggle");
  const toggleText = toggle?.querySelector(".collapse-toggle-text");

  if (!card || !toggle || !toggleText) {
    return;
  }

  card.classList.toggle("is-collapsed", isCollapsed);
  toggle.setAttribute("aria-expanded", String(!isCollapsed));
  toggleText.textContent = isCollapsed ? "Expand" : "Collapse";
}

export function setupCollapsibleCard(cardId, contentId, toggleId) {
  const card = $(cardId);
  const content = $(contentId);
  const toggle = $(toggleId);

  if (!card || !content || !toggle) {
    return;
  }

  setCollapsibleCardCollapsed(cardId, card.classList.contains("is-collapsed"));
  toggle.addEventListener("click", () => {
    setCollapsibleCardCollapsed(cardId, !card.classList.contains("is-collapsed"));
  });
}
