/**
 * Royal Tracking — snippet para o site do cliente.
 * Servido em: https://SEU_DOMINIO/snippet.js
 *
 * Uso mínimo:
 *   <script src="https://SEU_DOMINIO/snippet.js" async></script>
 *
 * Opcional (antes do script) — só se o endpoint for outro host:
 *   <script>window.TRCK_ENDPOINT="https://SEU_DOMINIO";</script>
 *
 * Endpoint: TRCK_ENDPOINT → origem do src do script (fail-closed se nenhum).
 * Fluxo: gera um event_id → dispara Pixel/gtag (web) + POST API (server) em paralelo.
 * Compras via webhook de marketplace são só server (sem pixel neste snippet).
 */
(function () {
  "use strict";

  // Evita listener/PageView duplicados se o script for injetado 2x (GTM + tema, etc.).
  if (window.__TRCK_SNIPPET_LOADED) return;

  function resolveEndpoint() {
    if (window.TRCK_ENDPOINT) {
      return String(window.TRCK_ENDPOINT).replace(/\/$/, "");
    }
    // Classic script (incl. async): currentScript está setado durante a avaliação.
    var el = document.currentScript;
    if (!el || !el.src) {
      var scripts = document.getElementsByTagName("script");
      for (var i = scripts.length - 1; i >= 0; i--) {
        var s = scripts[i];
        if (s.src && /\/snippet\.js(\?|#|$)/i.test(s.src)) {
          el = s;
          break;
        }
      }
    }
    if (el && el.src) {
      try {
        return new URL(el.src).origin;
      } catch (e) {}
    }
    return "";
  }

  var ENDPOINT = resolveEndpoint();
  if (!ENDPOINT) {
    console.error(
      "[Royal Tracking] Não foi possível resolver o endpoint. " +
        "Carregue via <script src=\"https://SEU_DOMINIO/snippet.js\"> " +
        "ou defina window.TRCK_ENDPOINT antes do script."
    );
    return;
  }
  window.__TRCK_SNIPPET_LOADED = true;
  var STORAGE_KEY = "trck_user_id";
  var TICKET_CODE_KEY = "trck_ticket_code";
  var GCLID_KEY = "trck_gclid";
  var TTCLID_KEY = "trck_ttclid";
  var WBRAID_KEY = "trck_wbraid";
  var GBRAID_KEY = "trck_gbraid";
  var COOKIE_DAYS = 365;
  var LEAD_DEDUP_MS = 5000;
  var TICKET_LINE_RE = /\[rt:[^\]]+\]/;

  var metaPixelIds = [];
  var ga4MeasurementIds = [];
  var ga4ScriptOk = false;
  var tagsReady = null;
  var ticketCode = null;

  var META_STANDARD = {
    PageView: "PageView",
    page_view: "PageView",
    Lead: "Lead",
    CompleteRegistration: "CompleteRegistration",
    InitiateCheckout: "InitiateCheckout",
    initiate_checkout: "InitiateCheckout",
    AddToCart: "AddToCart",
    add_to_cart: "AddToCart",
    Purchase: "Purchase",
    purchase: "Purchase",
    ViewContent: "ViewContent",
    view_content: "ViewContent",
    Contact: "Contact",
    Subscribe: "Subscribe",
  };

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

  function getTicketCode() {
    if (ticketCode) return ticketCode;
    try {
      var fromLs = localStorage.getItem(TICKET_CODE_KEY);
      if (fromLs) return fromLs;
    } catch (e) {}
    return getCookie(TICKET_CODE_KEY) || null;
  }

  function saveTicketCode(code) {
    if (!code) return;
    ticketCode = String(code);
    try {
      localStorage.setItem(TICKET_CODE_KEY, ticketCode);
    } catch (e) {}
    setCookie(TICKET_CODE_KEY, ticketCode, COOKIE_DAYS);
  }

  function getQuery(name) {
    return new URLSearchParams(window.location.search).get(name) || undefined;
  }

  function getGaClientId() {
    var ga = getCookie("_ga");
    if (!ga) return undefined;
    var parts = ga.split(".");
    if (parts.length >= 4) return parts[2] + "." + parts[3];
    return undefined;
  }

  function getGaSessionId() {
    return undefined;
  }

  function lsGet(key) {
    try {
      return localStorage.getItem(key) || undefined;
    } catch (e) {
      return undefined;
    }
  }

  function lsSet(key, value) {
    try {
      if (value) localStorage.setItem(key, value);
    } catch (e) {}
  }

  function rememberClickId(param, storageKey) {
    var fromUrl = getQuery(param);
    if (fromUrl) {
      lsSet(storageKey, fromUrl);
      return fromUrl;
    }
    return lsGet(storageKey);
  }

  function getGclid() {
    return rememberClickId("gclid", GCLID_KEY);
  }

  function getTtclid() {
    return rememberClickId("ttclid", TTCLID_KEY);
  }

  function getWbraid() {
    return rememberClickId("wbraid", WBRAID_KEY);
  }

  function getGbraid() {
    return rememberClickId("gbraid", GBRAID_KEY);
  }

  /**
   * Marketing consent for CMP integration (ANPD).
   * Default true (legacy). Set window.TRCK_CONSENT = false before/after load
   * to withhold click IDs / consent flag until the user accepts.
   */
  function hasMarketingConsent() {
    if (typeof window.TRCK_CONSENT === "boolean") return window.TRCK_CONSENT;
    return true;
  }

  function gatedClickIds() {
    if (!hasMarketingConsent()) {
      return {
        gclid: undefined,
        ttclid: undefined,
        wbraid: undefined,
        gbraid: undefined,
        fbp: undefined,
        fbc: undefined,
      };
    }
    return {
      gclid: getGclid(),
      ttclid: getTtclid(),
      wbraid: getWbraid(),
      gbraid: getGbraid(),
      fbp: getCookie("_fbp") || undefined,
      fbc: getFbc(),
    };
  }

  /** Meta fbc from cookie, or build from fbclid when missing. */
  function getFbc() {
    var cookie = getCookie("_fbc");
    if (cookie) return cookie;
    var fbclid = getQuery("fbclid");
    if (!fbclid) return undefined;
    return "fb.1." + Math.floor(Date.now() / 1000) + "." + fbclid;
  }

  function coalesceTrackingValue(id) {
    return (
      getTicketCode() ||
      id ||
      getCookie("_fbp") ||
      getGaClientId() ||
      getGclid() ||
      getTtclid() ||
      undefined
    );
  }

  function formatTicketLine(value) {
    return "[rt:" + value + "]";
  }

  /** Keep the human message; only put/replace [rt:…] at the end. */
  function replaceTicketInText(text, value) {
    var line = formatTicketLine(value);
    if (TICKET_LINE_RE.test(text)) {
      return text.replace(TICKET_LINE_RE, line);
    }
    if (text) {
      return text.replace(/\s+$/g, "") + "\n\n" + line;
    }
    return line;
  }

  function withWhatsAppTicket(url, id, messageOverride) {
    var tracking = coalesceTrackingValue(id);
    if (!tracking) return withTrck(url, id);
    try {
      var u = new URL(url, window.location.origin);
      var lower = u.hostname.toLowerCase() + u.pathname.toLowerCase();
      var isWa =
        lower.indexOf("wa.me") >= 0 ||
        lower.indexOf("api.whatsapp.com") >= 0;
      if (id) u.searchParams.set("trck_user_id", id);
      if (!isWa) return u.toString();

      var text = messageOverride;
      if (text == null) text = u.searchParams.get("text") || "";
      try {
        text = decodeURIComponent(text.replace(/\+/g, " "));
      } catch (e) {}
      text = replaceTicketInText(text, tracking);
      u.searchParams.set("text", text);
      return u.toString();
    } catch (e) {
      return withTrck(url, id);
    }
  }

  function post(path, body) {
    return fetch(ENDPOINT + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
      credentials: "include",
    }).then(function (res) {
      return res.json().catch(function () {
        return {};
      });
    });
  }

  function getJson(path) {
    return fetch(ENDPOINT + path, {
      method: "GET",
      credentials: "include",
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
        var lower = href.toLowerCase();
        var isWa =
          lower.indexOf("wa.me") >= 0 || lower.indexOf("api.whatsapp.com") >= 0;
        var interesting =
          isWa ||
          lower.indexOf("hotmart") >= 0 ||
          lower.indexOf("kiwify") >= 0 ||
          lower.indexOf("eduzz") >= 0 ||
          lower.indexOf("checkout") >= 0 ||
          lower.indexOf("pay.") >= 0 ||
          a.hasAttribute("data-trck") ||
          a.classList.contains("trck-link");
        if (!interesting) return;
        a.href = isWa ? withWhatsAppTicket(href, id) : withTrck(href, id);
      },
      true
    );
  }

  function loadScript(src) {
    return new Promise(function (resolve) {
      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing) {
        resolve(true);
        return;
      }
      var s = document.createElement("script");
      s.async = true;
      s.src = src;
      s.onload = function () {
        resolve(true);
      };
      s.onerror = function () {
        resolve(false);
      };
      document.head.appendChild(s);
    });
  }

  function ensureFbqStub() {
    if (window.fbq) return;
    var n = (window.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    });
    if (!window._fbq) window._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
  }

  function ensureGtagStub() {
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag !== "function") {
      window.gtag = function () {
        window.dataLayer.push(arguments);
      };
      window.gtag("js", new Date());
    }
  }

  function initBrowserTags() {
    if (tagsReady) return tagsReady;
    tagsReady = Promise.all([
      getJson("/api/meta/ids").catch(function () {
        return {};
      }),
      getJson("/api/ga4/ids").catch(function () {
        return {};
      }),
    ]).then(function (results) {
      metaPixelIds = (results[0] && results[0].pixel_ids) || [];
      ga4MeasurementIds = (results[1] && results[1].measurement_ids) || [];

      var loads = [];
      if (metaPixelIds.length) {
        ensureFbqStub();
        loads.push(
          loadScript("https://connect.facebook.net/en_US/fbevents.js").then(
            function (ok) {
              if (!ok) return false;
              try {
                for (var i = 0; i < metaPixelIds.length; i++) {
                  window.fbq("init", metaPixelIds[i]);
                }
                return true;
              } catch (e) {
                return false;
              }
            }
          )
        );
      }
      if (ga4MeasurementIds.length) {
        ensureGtagStub();
        loads.push(
          loadScript(
            "https://www.googletagmanager.com/gtag/js?id=" +
              encodeURIComponent(ga4MeasurementIds[0])
          ).then(function (ok) {
            if (!ok) {
              ga4ScriptOk = false;
              return false;
            }
            try {
              for (var j = 0; j < ga4MeasurementIds.length; j++) {
                window.gtag("config", ga4MeasurementIds[j], {
                  send_page_view: false,
                });
              }
              ga4ScriptOk = true;
              return true;
            } catch (e) {
              ga4ScriptOk = false;
              return false;
            }
          })
        );
      }
      return Promise.all(loads);
    });
    return tagsReady;
  }

  function trackMeta(name, eventId, params) {
    if (!metaPixelIds.length || typeof window.fbq !== "function") return false;
    try {
      var standard = META_STANDARD[name];
      var data = params || {};
      var opts = { eventID: eventId };
      if (standard) {
        window.fbq("track", standard, data, opts);
      } else {
        window.fbq("trackCustom", name, data, opts);
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function ga4EventName(name) {
    if (name === "PageView" || name === "page_view") return "page_view";
    if (name === "Lead") return "generate_lead";
    if (name === "Purchase" || name === "purchase") return "purchase";
    if (name === "InitiateCheckout" || name === "initiate_checkout") {
      return "begin_checkout";
    }
    if (name === "AddToCart" || name === "add_to_cart") return "add_to_cart";
    return String(name)
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .toLowerCase();
  }

  function trackGa4(name, eventId, params) {
    if (
      !ga4ScriptOk ||
      !ga4MeasurementIds.length ||
      typeof window.gtag !== "function"
    ) {
      return false;
    }
    try {
      var payload = Object.assign({}, params || {}, { event_id: eventId });
      window.gtag("event", ga4EventName(name), payload);
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Dispara tags web; retorna { meta, ga4 } para o server classificar canais. */
  function trackBrowser(name, eventId, params) {
    return initBrowserTags().then(function () {
      return {
        meta: trackMeta(name, eventId, params),
        ga4: trackGa4(name, eventId, params),
      };
    }).catch(function () {
      return { meta: false, ga4: false };
    });
  }

  function browserParamsFromExtra(extra) {
    var params = {};
    if (!extra) return params;
    if (extra.value != null) params.value = extra.value;
    if (extra.currency) params.currency = extra.currency;
    if (extra.content_name) params.content_name = extra.content_name;
    if (extra.content_ids) params.content_ids = extra.content_ids;
    return params;
  }

  function sendEvent(name, extra) {
    var id = getTrckId() || window.TRCK_USER_ID;
    if (!id) return Promise.resolve();
    extra = extra || {};
    var eventId = extra.event_id || uuid();
    var params = browserParamsFromExtra(extra);

    return trackBrowser(name, eventId, params).then(function (web) {
      var body = Object.assign(
        {
          trck_user_id: id,
          event_name: name,
          event_id: eventId,
          event_source_url: window.location.href,
          ga_client_id: getGaClientId(),
          client_web: web,
        },
        extra
      );
      body.event_id = eventId;
      body.client_web = web;
      if (!body.ga_client_id) body.ga_client_id = getGaClientId();
      return post("/api/event", body);
    });
  }

  function markLeadSent(form) {
    window.__TRCK_LAST_LEAD_AT = Date.now();
    if (form && form.setAttribute) {
      form.setAttribute("data-trck-captured-at", String(Date.now()));
    }
  }

  function wasLeadRecentlySent(form) {
    var now = Date.now();
    if (
      window.__TRCK_LAST_LEAD_AT &&
      now - window.__TRCK_LAST_LEAD_AT < LEAD_DEDUP_MS
    ) {
      return true;
    }
    if (form && form.getAttribute) {
      var last = form.getAttribute("data-trck-captured-at");
      if (last && now - Number(last) < LEAD_DEDUP_MS) return true;
    }
    return false;
  }

  function sendLead(data) {
    data = data || {};
    if (wasLeadRecentlySent(null)) {
      return Promise.resolve({ ok: true, deduped: true });
    }
    markLeadSent(null);

    var id = getTrckId() || window.TRCK_USER_ID;
    var eventId = data.event_id || uuid();
    var eventName = data.event_name || "Lead";

    return trackBrowser(eventName, eventId, {}).then(function (web) {
      return post(
        "/api/lead",
        Object.assign(
          {
            trck_user_id: id || undefined,
            page_url: window.location.href,
            event_name: eventName,
            event_id: eventId,
            ga_client_id: getGaClientId(),
            client_web: web,
          },
          gatedClickIds(),
          data,
          {
            event_id: eventId,
            client_web: web,
            consent: hasMarketingConsent(),
          }
        )
      );
    });
  }

  function identifyAndTrack() {
    var existing = getTrckId();
    var clicks = gatedClickIds();
    var payload = {
      trck_user_id: existing || undefined,
      fbp: clicks.fbp,
      fbc: clicks.fbc,
      ga_client_id: getGaClientId(),
      ga_session_id: getGaSessionId(),
      gclid: clicks.gclid,
      ttclid: clicks.ttclid,
      wbraid: clicks.wbraid,
      gbraid: clicks.gbraid,
      utm_source: getQuery("utm_source"),
      utm_medium: getQuery("utm_medium"),
      utm_campaign: getQuery("utm_campaign"),
      utm_term: getQuery("utm_term"),
      utm_content: getQuery("utm_content"),
      referrer: document.referrer || undefined,
    };

    initBrowserTags().catch(function () {});

    return post("/api/identify", payload).then(function (data) {
      var id = (data && data.trck_user_id) || existing || "trck_" + uuid().replace(/-/g, "");
      saveTrckId(id);
      window.TRCK_USER_ID = id;
      if (data && data.ticket_code) saveTicketCode(data.ticket_code);
      patchLinks(id);

      var eventId = uuid();
      return trackBrowser("PageView", eventId, {}).then(function (web) {
        return post("/api/event", {
          trck_user_id: id,
          event_name: "PageView",
          event_id: eventId,
          event_source_url: window.location.href,
          utm_source: payload.utm_source,
          utm_medium: payload.utm_medium,
          utm_campaign: payload.utm_campaign,
          utm_term: payload.utm_term,
          utm_content: payload.utm_content,
          ga_client_id: getGaClientId(),
          client_web: web,
        }).then(function () {
          return id;
        });
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
    if (window.__TRCK_FORMS_CAPTURED) return;
    window.__TRCK_FORMS_CAPTURED = true;

    document.addEventListener(
      "submit",
      function (ev) {
        var form = ev.target;
        if (!form || form.tagName !== "FORM") return;
        if (form.getAttribute("data-trck-ignore") != null) return;
        if (wasLeadRecentlySent(form)) return;

        var fields = collectFormFields(form);
        var keys = Object.keys(fields);
        if (!keys.length) return;

        markLeadSent(form);

        var id = getTrckId() || window.TRCK_USER_ID;
        var eventId = uuid();
        var clicks = gatedClickIds();
        var payload = {
          trck_user_id: id || undefined,
          form_label:
            form.getAttribute("name") ||
            form.id ||
            form.getAttribute("aria-label") ||
            undefined,
          form_action: form.getAttribute("action") || undefined,
          page_url: window.location.href,
          fields: fields,
          fbp: clicks.fbp,
          fbc: clicks.fbc,
          ga_client_id: getGaClientId(),
          gclid: clicks.gclid,
          ttclid: clicks.ttclid,
          wbraid: clicks.wbraid,
          gbraid: clicks.gbraid,
          utm_source: getQuery("utm_source"),
          utm_medium: getQuery("utm_medium"),
          utm_campaign: getQuery("utm_campaign"),
          utm_term: getQuery("utm_term"),
          utm_content: getQuery("utm_content"),
          event_name: "Lead",
          event_id: eventId,
          consent: hasMarketingConsent(),
        };

        trackBrowser("Lead", eventId, {}).then(function (web) {
          payload.client_web = web;
          post("/api/lead", payload).catch(function () {});
        });

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
            gclid: payload.gclid,
            ttclid: payload.ttclid,
            wbraid: payload.wbraid,
            gbraid: payload.gbraid,
            utm_source: payload.utm_source,
            utm_medium: payload.utm_medium,
            utm_campaign: payload.utm_campaign,
          }).catch(function () {});
        }
      },
      true
    );
  }

  window.trck = {
    event: function (name, extra) {
      return sendEvent(name, extra);
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
      return sendLead(data);
    },
    getId: function () {
      return getTrckId() || window.TRCK_USER_ID || null;
    },
    withTrckUserId: function (url) {
      var id = this.getId();
      return id ? withTrck(url, id) : url;
    },
    withWhatsAppTicket: function (url, message) {
      return withWhatsAppTicket(url, this.getId(), message);
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
