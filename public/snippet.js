/**
 * Royal Tracking — snippet para o site do cliente.
 * Servido em: https://tracking.royalgrowth.com.br/snippet.js
 *
 * Uso mínimo:
 *   <script src="https://tracking.royalgrowth.com.br/snippet.js" async></script>
 *
 * Opcional (antes do script):
 *   <script>window.TRCK_ENDPOINT="https://tracking.royalgrowth.com.br";</script>
 */
(function () {
  "use strict";

  var ENDPOINT = (
    window.TRCK_ENDPOINT || "https://tracking.royalgrowth.com.br"
  ).replace(/\/$/, "");
  var STORAGE_KEY = "trck_user_id";
  var COOKIE_DAYS = 365;

  function uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getCookie(name) {
    var m = document.cookie.match(
      new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)")
    );
    return m ? decodeURIComponent(m[1]) : null;
  }

  function setCookie(name, value, days) {
    var maxAge = days * 24 * 60 * 60;
    document.cookie =
      name +
      "=" +
      encodeURIComponent(value) +
      "; Path=/; Max-Age=" +
      maxAge +
      "; SameSite=Lax";
  }

  function getTrckId() {
    try {
      var fromLs = localStorage.getItem(STORAGE_KEY);
      if (fromLs) return fromLs;
    } catch (e) {}
    var fromCookie = getCookie(STORAGE_KEY);
    if (fromCookie) return fromCookie;
    var fromUrl = new URLSearchParams(window.location.search).get("trck_user_id");
    if (fromUrl) return fromUrl;
    return null;
  }

  function saveTrckId(id) {
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch (e) {}
    setCookie(STORAGE_KEY, id, COOKIE_DAYS);
  }

  function getQuery(name) {
    return new URLSearchParams(window.location.search).get(name) || undefined;
  }

  function getGaClientId() {
    var ga = getCookie("_ga");
    if (!ga) return undefined;
    // _ga=GA1.1.123456789.1234567890 → client_id = 123456789.1234567890
    var parts = ga.split(".");
    if (parts.length >= 4) return parts[2] + "." + parts[3];
    return undefined;
  }

  function getGaSessionId() {
    // Cookie _ga_<MEASUREMENT> is complex; leave undefined if unknown
    return undefined;
  }

  function post(path, body) {
    return fetch(ENDPOINT + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
      credentials: "omit",
    }).then(function (res) {
      return res.json().catch(function () {
        return {};
      });
    });
  }

  function withTrck(url, id) {
    try {
      var u = new URL(url, window.location.origin);
      u.searchParams.set("trck_user_id", id);
      return u.toString();
    } catch (e) {
      var sep = url.indexOf("?") >= 0 ? "&" : "?";
      return url + sep + "trck_user_id=" + encodeURIComponent(id);
    }
  }

  function patchLinks(id) {
    document.addEventListener(
      "click",
      function (ev) {
        var a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
        if (!a) return;
        var href = a.getAttribute("href");
        if (!href || href.charAt(0) === "#" || href.indexOf("javascript:") === 0) return;
        // Checkout / WhatsApp / external buy links
        var lower = href.toLowerCase();
        var interesting =
          lower.indexOf("wa.me") >= 0 ||
          lower.indexOf("api.whatsapp.com") >= 0 ||
          lower.indexOf("hotmart") >= 0 ||
          lower.indexOf("kiwify") >= 0 ||
          lower.indexOf("eduzz") >= 0 ||
          lower.indexOf("checkout") >= 0 ||
          lower.indexOf("pay.") >= 0 ||
          a.hasAttribute("data-trck") ||
          a.classList.contains("trck-link");
        if (!interesting) return;
        a.href = withTrck(href, id);
      },
      true
    );
  }

  function identifyAndTrack() {
    var existing = getTrckId();
    var payload = {
      trck_user_id: existing || undefined,
      fbp: getCookie("_fbp") || undefined,
      fbc: getCookie("_fbc") || undefined,
      ga_client_id: getGaClientId(),
      ga_session_id: getGaSessionId(),
      utm_source: getQuery("utm_source"),
      utm_medium: getQuery("utm_medium"),
      utm_campaign: getQuery("utm_campaign"),
      utm_term: getQuery("utm_term"),
      utm_content: getQuery("utm_content"),
      referrer: document.referrer || undefined,
    };

    return post("/api/identify", payload).then(function (data) {
      var id = (data && data.trck_user_id) || existing || "trck_" + uuid().replace(/-/g, "");
      saveTrckId(id);
      window.TRCK_USER_ID = id;
      patchLinks(id);

      return post("/api/event", {
        trck_user_id: id,
        event_name: "PageView",
        event_id: uuid(),
        event_source_url: window.location.href,
        utm_source: payload.utm_source,
        utm_medium: payload.utm_medium,
        utm_campaign: payload.utm_campaign,
        utm_term: payload.utm_term,
        utm_content: payload.utm_content,
      }).then(function () {
        return id;
      });
    });
  }

  function isSensitiveField(el) {
    if (!el || !el.name) return true;
    var type = (el.type || "").toLowerCase();
    var name = String(el.name || el.id || "").toLowerCase();
    if (
      type === "password" ||
      type === "hidden" ||
      type === "file" ||
      type === "submit" ||
      type === "button" ||
      type === "reset" ||
      type === "image"
    ) {
      return true;
    }
    if (
      name.indexOf("password") >= 0 ||
      name.indexOf("senha") >= 0 ||
      name.indexOf("card") >= 0 ||
      name.indexOf("cvv") >= 0 ||
      name.indexOf("cvc") >= 0 ||
      name.indexOf("cc-") >= 0
    ) {
      return true;
    }
    return false;
  }

  function collectFormFields(form) {
    var fields = {};
    var els = form.querySelectorAll("input, select, textarea");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (isSensitiveField(el)) continue;
      var key = el.name || el.id;
      if (!key) continue;
      if (el.type === "checkbox" || el.type === "radio") {
        if (!el.checked) continue;
      }
      fields[key] = el.value;
    }
    return fields;
  }

  function captureForms() {
    document.addEventListener(
      "submit",
      function (ev) {
        var form = ev.target;
        if (!form || form.tagName !== "FORM") return;
        if (form.getAttribute("data-trck-ignore") != null) return;

        var fields = collectFormFields(form);
        var keys = Object.keys(fields);
        if (!keys.length) return;

        var id = getTrckId() || window.TRCK_USER_ID;
        var payload = {
          trck_user_id: id || undefined,
          form_label: form.getAttribute("name") || form.id || form.getAttribute("aria-label") || undefined,
          form_action: form.getAttribute("action") || undefined,
          page_url: window.location.href,
          fields: fields,
          fbp: getCookie("_fbp") || undefined,
          fbc: getCookie("_fbc") || undefined,
          ga_client_id: getGaClientId(),
          utm_source: getQuery("utm_source"),
          utm_medium: getQuery("utm_medium"),
          utm_campaign: getQuery("utm_campaign"),
          utm_term: getQuery("utm_term"),
          utm_content: getQuery("utm_content"),
          event_name: "Lead",
          event_id: uuid(),
          consent: true,
        };

        // Fire-and-forget; do not block native submit
        post("/api/lead", payload).catch(function () {});
        if (id) {
          post("/api/identify", {
            trck_user_id: id,
            email: fields.email || fields.Email || undefined,
            phone:
              fields.phone ||
              fields.telefone ||
              fields.whatsapp ||
              fields.tel ||
              undefined,
            fbp: payload.fbp,
            fbc: payload.fbc,
            ga_client_id: payload.ga_client_id,
            utm_source: payload.utm_source,
            utm_medium: payload.utm_medium,
            utm_campaign: payload.utm_campaign,
          }).catch(function () {});
        }
      },
      true
    );
  }

  // API pública para o site do cliente
  window.trck = {
    event: function (name, extra) {
      var id = getTrckId() || window.TRCK_USER_ID;
      if (!id) return Promise.resolve();
      extra = extra || {};
      return post(
        "/api/event",
        Object.assign(
          {
            trck_user_id: id,
            event_name: name,
            event_id: uuid(),
            event_source_url: window.location.href,
          },
          extra
        )
      );
    },
    identify: function (data) {
      var id = getTrckId() || window.TRCK_USER_ID;
      data = data || {};
      return post(
        "/api/identify",
        Object.assign({ trck_user_id: id || undefined }, data)
      ).then(function (res) {
        if (res && res.trck_user_id) {
          saveTrckId(res.trck_user_id);
          window.TRCK_USER_ID = res.trck_user_id;
        }
        return res;
      });
    },
    lead: function (data) {
      var id = getTrckId() || window.TRCK_USER_ID;
      data = data || {};
      return post(
        "/api/lead",
        Object.assign(
          {
            trck_user_id: id || undefined,
            page_url: window.location.href,
            event_name: "Lead",
            event_id: uuid(),
            fbp: getCookie("_fbp") || undefined,
            fbc: getCookie("_fbc") || undefined,
            ga_client_id: getGaClientId(),
          },
          data
        )
      );
    },
    getId: function () {
      return getTrckId() || window.TRCK_USER_ID || null;
    },
    withTrckUserId: function (url) {
      var id = this.getId();
      return id ? withTrck(url, id) : url;
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      identifyAndTrack().catch(function () {});
      captureForms();
    });
  } else {
    identifyAndTrack().catch(function () {});
    captureForms();
  }
})();
