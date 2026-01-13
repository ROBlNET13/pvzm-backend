/*
 * Modal
 *
 * Pico.css - https://picocss.com
 * Copyright 2019-2024 - Licensed under MIT
 */
// deno-lint-ignore-file
// oxlint-disable

const isOpenClass = "modal-is-open";
const openingClass = "modal-is-opening";
const closingClass = "modal-is-closing";
const scrollbarWidthCssVar = "--pico-scrollbar-width";
const animationDuration = 400; // ms
let visibleModal = null;
// toggle modal
// deno-lint-ignore no-unused-vars
const toggleModal = (event) => {
	event.preventDefault();
	const modal = document.getElementById(event.currentTarget.dataset.target);
	if (!modal) return;
	modal && (modal.open ? closeModal(modal) : openModal(modal));
};
// open modal
const openModal = (modal) => {
	const { documentElement: html } = document;
	const scrollbarWidth = getScrollbarWidth();
	if (scrollbarWidth) {
		html.style.setProperty(scrollbarWidthCssVar, `${scrollbarWidth}px`);
	}
	html.classList.add(isOpenClass, openingClass);
	setTimeout(() => {
		visibleModal = modal;
		html.classList.remove(openingClass);
	}, animationDuration);
	modal.showModal();
};
// close modal
const closeModal = (modal) => {
	visibleModal = null;
	const { documentElement: html } = document;
	html.classList.add(closingClass);
	setTimeout(() => {
		html.classList.remove(closingClass, isOpenClass);
		html.style.removeProperty(scrollbarWidthCssVar);
		modal.close();
	}, animationDuration);
};
// close with a click outside
document.addEventListener("click", (event) => {
	if (visibleModal === null) return;
	const modalContent = visibleModal.querySelector("article");
	const isClickInside = modalContent.contains(event.target);
	!isClickInside && closeModal(visibleModal);
});
// close with Esc key
document.addEventListener("keydown", (event) => {
	if (event.key === "Escape" && visibleModal) {
		closeModal(visibleModal);
	}
});
// get scrollbar width
const getScrollbarWidth = () => {
	const scrollbarWidth = globalThis.innerWidth - document.documentElement.clientWidth;
	return scrollbarWidth;
};
// is scrollbar visible
const isScrollbarVisible = () => {
	return document.body.scrollHeight > screen.height;
};
