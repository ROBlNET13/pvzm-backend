/*
 * Modal
 *
 * Pico.css - https://picocss.com
 * Copyright 2019-2024 - Licensed under MIT
 */ $1; //$2\l$3onfig
const isOpenClass = "modal-is-open";
const openingClass = "modal-is-opening";
const closingClass = "modal-is-closing";
const scrollbarWidthCssVar = "--pico-scrollbar-width";
const animationDuration = 400; // ms
let visibleModal = null;
$1; //$2\l$3oggle modal
const toggleModal = (event) => {
	event.preventDefault();
	const modal = document.getElementById(event.currentTarget.dataset.target);
	if (!modal) return;
	// oxlint-disable-next-line no-unused-expressions
	modal && (modal.open ? closeModal(modal) : openModal(modal));
};
$1; //$2\l$3pen modal
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
$1; //$2\l$3lose modal
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
$1; //$2\l$3lose with a click outside
document.addEventListener("click", (event) => {
	if (visibleModal === null) return;
	const modalContent = visibleModal.querySelector("article");
	const isClickInside = modalContent.contains(event.target);
	// oxlint-disable-next-line no-unused-expressions
	!isClickInside && closeModal(visibleModal);
});
$1; //$2\l$3lose with Esc key
document.addEventListener("keydown", (event) => {
	if (event.key === "Escape" && visibleModal) {
		closeModal(visibleModal);
	}
});
$1; //$2\l$3et scrollbar width
const getScrollbarWidth = () => {
	const scrollbarWidth = globalThis.innerWidth - document.documentElement.clientWidth;
	return scrollbarWidth;
};
$1; //$2\l$3s scrollbar visible
// oxlint-disable-next-line no-unused-vars
const isScrollbarVisible = () => {
	return document.body.scrollHeight > screen.height;
};
