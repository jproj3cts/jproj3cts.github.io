/* ==========================================================================
   JEK Systems — quote cart
   Shared by every page. Items live in localStorage under JEK_QUOTE_CART.

   Item shape:
     { part, name, price, currency, note, qty, url }

   Prices are stored as numbers with their currency symbol kept alongside,
   so a cart holding more than one currency is subtotalled per currency
   rather than summed into a meaningless single figure.
   ========================================================================== */

(function (window, document) {
  "use strict";

  var KEY = "JEK_QUOTE_CART";
  var SALES_EMAIL = "sales@jeksys.net";

  /* ------------------------------------------------------- environment */

  /**
   * Pages opened straight from disk run on the file: protocol. Firefox and
   * Safari give each local file its own storage origin, so anything written
   * on one page is invisible to the next and the cart silently appears empty.
   * Chrome shares it, which makes the fault look intermittent. Served over
   * http(s) — as on GitHub Pages — this is never a problem.
   */
  function isFileProtocol() {
    return window.location.protocol === "file:";
  }

  /** True when localStorage can be written at all in this document. */
  function storageWorks() {
    try {
      window.localStorage.setItem("__jek_probe__", "1");
      window.localStorage.removeItem("__jek_probe__");
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------------------------------------------------------------- store */

  function read() {
    try {
      var raw = window.localStorage.getItem(KEY);
      var items = raw ? JSON.parse(raw) : [];
      return Array.isArray(items) ? items.filter(valid) : [];
    } catch (e) {
      // Private browsing or storage disabled — behave as an empty cart
      return [];
    }
  }

  function write(items) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(items));
      return true;
    } catch (e) {
      return false;
    }
  }

  function valid(it) {
    return it && typeof it.part === "string" && typeof it.qty === "number" && it.qty > 0;
  }

  /* ------------------------------------------------------------ operations */

  function add(item, qty) {
    qty = Math.max(1, parseInt(qty, 10) || 1);
    var items = read();
    var found = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].part === item.part) { found = items[i]; break; }
    }
    if (found) {
      found.qty += qty;
    } else {
      items.push({
        part: item.part,
        name: item.name,
        price: item.price,
        currency: item.currency || "",
        note: item.note || "",
        url: item.url || "",
        qty: qty
      });
    }
    write(items);
    refreshCount();
    return items;
  }

  function setQty(part, qty) {
    qty = parseInt(qty, 10);
    var items = read();
    if (!(qty > 0)) return remove(part);
    for (var i = 0; i < items.length; i++) {
      if (items[i].part === part) { items[i].qty = qty; break; }
    }
    write(items);
    refreshCount();
    return items;
  }

  function remove(part) {
    var items = read().filter(function (it) { return it.part !== part; });
    write(items);
    refreshCount();
    return items;
  }

  function clear() {
    write([]);
    refreshCount();
    return [];
  }

  function count() {
    return read().reduce(function (n, it) { return n + it.qty; }, 0);
  }

  /* ----------------------------------------------------------- formatting */

  function money(currency, value) {
    return (currency || "") + value.toFixed(2);
  }

  /** Subtotal per currency — never sums across currencies. */
  function totals(items) {
    var by = {};
    items.forEach(function (it) {
      if (typeof it.price !== "number" || isNaN(it.price)) return;
      var cur = it.currency || "";
      by[cur] = (by[cur] || 0) + it.price * it.qty;
    });
    return Object.keys(by).map(function (cur) {
      return { currency: cur, value: by[cur] };
    });
  }

  /** True when the cart mixes currencies, so a single total would mislead. */
  function isMixed(items) {
    return totals(items).length > 1;
  }

  /* ------------------------------------------------------- quote email */

  function quoteBody(items) {
    var lines = [];
    lines.push("Dear Sir/Madam,");
    lines.push("");
    lines.push(
      "I am enquiring regarding the following " +
      (items.length === 1 ? "item" : "items") +
      " and would like to request a quotation."
    );
    lines.push("");

    items.forEach(function (it, i) {
      var priced = typeof it.price === "number" && !isNaN(it.price);
      lines.push((i + 1) + ". " + it.part + " - " + it.name);
      lines.push("   Quantity: " + it.qty);
      if (priced) {
        lines.push("   Unit price: " + money(it.currency, it.price) + (it.note ? " " + it.note : ""));
        if (it.qty > 1) {
          lines.push("   Line total: " + money(it.currency, it.price * it.qty) + (it.note ? " " + it.note : ""));
        }
      } else {
        lines.push("   Unit price: on application");
      }
      lines.push("");
    });

    var subs = totals(items);
    if (subs.length === 1) {
      lines.push("Total: " + money(subs[0].currency, subs[0].value));
    } else if (subs.length > 1) {
      lines.push("Totals:");
      subs.forEach(function (s) { lines.push("   " + money(s.currency, s.value)); });
    }

    lines.push("");
    lines.push("Please could you confirm availability, lead time, and a full quotation including shipping and any applicable taxes.");
    lines.push("");
    lines.push("Kind regards,");
    lines.push("");

    return lines.join("\n");
  }

  function quoteSubject(items) {
    if (items.length === 1) {
      return "Quotation request: " + items[0].part;
    }
    return "Quotation request: " + items.length + " items";
  }

  function mailtoUrl(items) {
    return "mailto:" + SALES_EMAIL +
      "?subject=" + encodeURIComponent(quoteSubject(items)) +
      "&body=" + encodeURIComponent(quoteBody(items));
  }

  /**
   * Open the user's mail client with the quote pre-filled.
   * Very long carts exceed what some mail clients accept from a mailto link,
   * so past a safe length we hand back the text instead of silently truncating.
   */
  function sendQuote(items, onTooLong) {
    if (!items.length) return false;
    var url = mailtoUrl(items);
    if (url.length > 1900 && typeof onTooLong === "function") {
      onTooLong(quoteBody(items), quoteSubject(items));
      return false;
    }
    window.location.href = url;
    return true;
  }

  /* --------------------------------------------------------- nav badge */

  function refreshCount() {
    var n = count();
    var nodes = document.querySelectorAll("[data-cart-count]");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = n;
      nodes[i].setAttribute("data-empty", n === 0 ? "true" : "false");
    }
  }

  /* ------------------------------------------ product page wiring */

  function readProduct(el) {
    var price = parseFloat(el.getAttribute("data-price"));
    return {
      part: el.getAttribute("data-part") || "",
      name: el.getAttribute("data-name") || "",
      price: isNaN(price) ? null : price,
      currency: el.getAttribute("data-currency") || "",
      note: el.getAttribute("data-note") || "",
      url: window.location.href.split("#")[0]
    };
  }

  function flash(btn, message) {
    if (btn.dataset.busy === "1") return;
    var original = btn.textContent;
    btn.dataset.busy = "1";
    btn.textContent = message;
    btn.classList.add("is-added");
    window.setTimeout(function () {
      btn.textContent = original;
      btn.classList.remove("is-added");
      btn.dataset.busy = "0";
    }, 1600);
  }

  function initProductButtons() {
    var addBtns = document.querySelectorAll("[data-add-to-quote]");
    for (var i = 0; i < addBtns.length; i++) {
      addBtns[i].addEventListener("click", function (ev) {
        ev.preventDefault();
        var item = readProduct(this);
        if (!item.part) return;
        add(item, 1);
        flash(this, "Added to quote");
      });
    }

    // "Quote now" sends this single item, whatever is in the cart
    var nowBtns = document.querySelectorAll("[data-quote-now]");
    for (var j = 0; j < nowBtns.length; j++) {
      nowBtns[j].addEventListener("click", function (ev) {
        ev.preventDefault();
        var item = readProduct(this);
        if (!item.part) return;
        item.qty = 1;
        sendQuote([item]);
      });
    }
  }

  /* ------------------------------------------------- environment notice */

  /**
   * Show a plain explanation instead of letting the cart look broken.
   * Injected from here so it appears on every page without editing markup.
   */
  function showEnvNotice() {
    if (!isFileProtocol() && storageWorks()) return;
    if (document.querySelector(".cart-env-notice")) return;

    var hasCartUi = document.querySelector("[data-add-to-quote], [data-quote-now], .cart-panel");
    if (!hasCartUi) return;

    var msg = isFileProtocol()
      ? "Preview mode: these pages are open directly from disk, so the quote cart cannot carry between pages. " +
        "It will work normally once the site is published, or if you preview it through a local web server."
      : "Your browser is blocking site storage, so the quote cart cannot be saved. " +
        "Check your privacy settings, or use Quote now to email a single item.";

    var el = document.createElement("p");
    el.className = "cart-env-notice";
    el.setAttribute("role", "status");
    el.textContent = msg;

    var panel = document.querySelector(".cart-panel");
    var main = document.querySelector(".main-content");
    if (panel) {
      panel.insertBefore(el, panel.firstChild);
    } else if (main) {
      var title = main.querySelector(".page-title");
      main.insertBefore(el, title ? title.nextSibling : main.firstChild);
    }
  }

  /* ------------------------------------------------------------- expose */

  window.JEKCart = {
    read: read,
    add: add,
    setQty: setQty,
    remove: remove,
    clear: clear,
    count: count,
    totals: totals,
    isMixed: isMixed,
    money: money,
    quoteBody: quoteBody,
    quoteSubject: quoteSubject,
    sendQuote: sendQuote,
    refreshCount: refreshCount,
    isFileProtocol: isFileProtocol,
    storageWorks: storageWorks,
    salesEmail: SALES_EMAIL
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      refreshCount();
      initProductButtons();
      showEnvNotice();
    });
  } else {
    refreshCount();
    initProductButtons();
    showEnvNotice();
  }

  // Keep the badge honest when the cart changes in another tab
  window.addEventListener("storage", function (e) {
    if (e.key === KEY) refreshCount();
  });
})(window, document);
