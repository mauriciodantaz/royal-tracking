/**
 * Royal Tracking — snippet para o site do cliente.
 * Servido em: https://tracking.royalserver.com.br/snippet.js
 *
 * Uso mínimo:
 *   <script src="https://tracking.royalserver.com.br/snippet.js" async></script>
 *
 * Opcional (antes do script):
 *   <script>window.TRCK_ENDPOINT="https://tracking.royalserver.com.br";</script>
 */
(function () {
  "use strict";

  var ENDPOINT = (
    window.TRCK_ENDPOINT || "https://tracking.royalserver.com.br"
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
    });
  } else {
    identifyAndTrack().catch(function () {});
  }
})();
