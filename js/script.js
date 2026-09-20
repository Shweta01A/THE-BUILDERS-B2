/* ==========================================================================
   THE BUILDERS — SHARED SCRIPT
   Loaded on every page. Two independent features, each guarded so it only
   runs on pages that actually contain the relevant markup:
     1. Mobile navigation toggle (all pages)
     2. Contact form demo submission (contact.html only)
   ========================================================================== */

document.addEventListener("DOMContentLoaded", function () {

  /* ------------------------------------------------------------------------
     1. MOBILE NAVIGATION TOGGLE
     The hamburger button (.nav-toggle) shows/hides the nav list on small
     screens by adding/removing the "open" class that style.css targets.
     ------------------------------------------------------------------------ */
  var navToggle = document.querySelector(".nav-toggle");
  var navList = document.querySelector(".nav-list");

  if (navToggle && navList) {
    navToggle.addEventListener("click", function () {
      var isOpen = navList.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    // Close the menu automatically once a link is chosen, so it doesn't
    // stay open when the visitor lands on the next page.
    navList.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        navList.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ------------------------------------------------------------------------
     2. CONTACT FORM
     Validates the fields and shows a confirmation message client-side.
     There's no back end wired up yet, so no email is actually sent — the
     confirmation copy says exactly that rather than overstating it.
     ------------------------------------------------------------------------ */
  var contactForm = document.getElementById("contact-form");

  if (contactForm) {
    var confirmation = document.getElementById("form-confirmation");

    contactForm.addEventListener("submit", function (event) {
      event.preventDefault();

      var isValid = true;
      var fields = contactForm.querySelectorAll("[required]");

      fields.forEach(function (field) {
        var errorEl = document.getElementById(field.id + "-error");
        var fieldIsEmpty = field.value.trim() === "";
        var fieldIsInvalidEmail =
          field.type === "email" && field.value.trim() !== "" && !/^\S+@\S+\.\S+$/.test(field.value.trim());

        if (fieldIsEmpty || fieldIsInvalidEmail) {
          isValid = false;
          if (errorEl) {
            errorEl.textContent = fieldIsEmpty
              ? "This field is required."
              : "Enter a valid email address.";
            errorEl.classList.add("visible");
          }
        } else if (errorEl) {
          errorEl.classList.remove("visible");
        }
      });

      if (!isValid) {
        if (confirmation) confirmation.classList.remove("visible");
        return;
      }

      // All fields valid — show a confirmation and reset the form.
      if (confirmation) {
        var firstName = contactForm.querySelector("#name").value.trim();
        confirmation.textContent =
          "Thanks, " + firstName + ". This form isn't connected to a live inbox yet, so your message wasn't sent — once it is, it'll reach The Builders team directly from here.";
        confirmation.classList.add("visible");
      }
      contactForm.reset();
    });
  }

});
