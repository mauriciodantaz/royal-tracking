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
  var EVENT_DEDUP_MS = 800;
  var TICKET_LINE_RE = /\[rt:[^\]]+\]/;

  var metaPixelIds = [];
  var ga4MeasurementIds = [];
  var ga4ScriptOk = false;
  var tagsReady = null;
  var ticketCode = null;
  var snippetConfig = {
    rules: [],
    url_preserve_params: [],
    auto_ecommerce: false,
    listen_datalayer: false,
  };
  var lastEmit = { url: "", name: "", at: 0 };
  var spaHooked = false;
  var ecomHooked = false;
  var dlHooked = false;
  var frameworkHint = null;

  var META_STANDARD = {
    PageView: "PageView",
    page_view: "PageView",
    Lead: "Lead",
    CompleteRegistration: "CompleteRegistration",
    InitiateCheckout: "InitiateCheckout",
    initiate_checkout: "InitiateCheckout",
    begin_checkout: "InitiateCheckout",
    AddToCart: "AddToCart",
    add_to_cart: "AddToCart",
    Purchase: "Purchase",
    purchase: "Purchase",
    ViewContent: "ViewContent",
    view_content: "ViewContent",
    view_item: "ViewContent",
    view_item_list: "ViewContent",
    AddToWishlist: "AddToWishlist",
    add_to_wishlist: "AddToWishlist",
    RemoveFromCart: "RemoveFromCart",
    remove_from_cart: "RemoveFromCart",
    ViewCart: "ViewContent",
    view_cart: "ViewContent",
    AddPaymentInfo: "AddPaymentInfo",
    add_payment_info: "AddPaymentInfo",
    AddShippingInfo: "AddShippingInfo",
    add_shipping_info: "AddShippingInfo",
    Search: "Search",
    search: "Search",
    Contact: "Contact",
    Subscribe: "Subscribe",
  };

  var STRIP_PARAMS = {
    gclid: 1,
    fbclid: 1,
    ttclid: 1,
    msclkid: 1,
    yclid: 1,
    mc_cid: 1,
    mc_eid: 1,
    _ga: 1,
    _gl: 1,
    vero_id: 1,
    ref: 1,
    source: 1,
    campaign: 1,
    wbraid: 1,
    gbraid: 1,
    gclsrc: 1,
    dclid: 1,
    li_fat_id: 1,
    twclid: 1,
    srsltid: 1,
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

  /** Elementor: form_fields[rt_ticket] / form-field-rt_ticket → rt_ticket */
  function normalizeFormFieldKey(raw) {
    var s = String(raw || "").trim();
    var m = /^form_fields\[([^\]]+)\]$/i.exec(s);
    if (m && m[1]) return m[1].toLowerCase();
    return s.replace(/^form-field-/i, "").toLowerCase();
  }

  function isTrackingTicketField(el) {
    if (!el) return false;
    if (el.getAttribute && el.getAttribute("data-trck") === "ticket") return true;
    if (el.classList && el.classList.contains("trck-ticket")) return true;
    var name = normalizeFormFieldKey(el.name || "");
    var id = normalizeFormFieldKey(el.id || "");
    return (
      name === "rt_ticket" ||
      name === "trck_ticket" ||
      id === "rt_ticket" ||
      id === "trck_ticket"
    );
  }

  function isTrckUserIdField(el) {
    if (!el) return false;
    if (el.getAttribute && el.getAttribute("data-trck") === "user_id") return true;
    var name = normalizeFormFieldKey(el.name || "");
    var id = normalizeFormFieldKey(el.id || "");
    return name === "trck_user_id" || id === "trck_user_id";
  }

  /**
   * Preenche hidden fields para redirect Elementor → WhatsApp.
   * rt_ticket / trck_ticket → "[rt:CODE]"; trck_user_id → id cru.
   */
  function fillTrackingFields(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var code = getTicketCode();
    var id = getTrckId() || window.TRCK_USER_ID || null;
    var ticketValue = code ? formatTicketLine(code) : "";
    var els = scope.querySelectorAll("input, textarea");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (ticketValue && isTrackingTicketField(el)) {
        el.value = ticketValue;
      } else if (id && isTrckUserIdField(el)) {
        el.value = id;
      }
    }
  }

  var fillFieldsTimer = null;
  function scheduleFillTrackingFields() {
    if (fillFieldsTimer) clearTimeout(fillFieldsTimer);
    fillFieldsTimer = setTimeout(function () {
      fillFieldsTimer = null;
      fillTrackingFields();
    }, 50);
  }

  function watchTrackingFields() {
    if (window.__TRCK_FIELDS_WATCH) return;
    window.__TRCK_FIELDS_WATCH = true;

    if (typeof MutationObserver !== "undefined" && document.documentElement) {
      var mo = new MutationObserver(function () {
        scheduleFillTrackingFields();
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    }

    document.addEventListener("elementor/popup/show", scheduleFillTrackingFields);
    document.addEventListener(
      "elementor/popup/after_show",
      scheduleFillTrackingFields
    );
    if (window.jQuery) {
      try {
        window.jQuery(document).on(
          "elementor/popup/show elementor/popup/after_show",
          scheduleFillTrackingFields
        );
      } catch (e) {}
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
    if (name === "ViewContent" || name === "view_content") return "view_item";
    if (name === "Search") return "search";
    return String(name)
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .toLowerCase();
  }

  function shouldStripParam(key) {
    var k = String(key || "").toLowerCase();
    var preserve = snippetConfig.url_preserve_params || [];
    for (var i = 0; i < preserve.length; i++) {
      if (String(preserve[i]).toLowerCase() === k) return false;
    }
    if (k.indexOf("utm_") === 0) return true;
    return !!STRIP_PARAMS[k];
  }

  function canonicalUrl(href) {
    try {
      var u = new URL(href || window.location.href, window.location.origin);
      u.hostname = u.hostname.toLowerCase();
      if (
        (u.protocol === "http:" && u.port === "80") ||
        (u.protocol === "https:" && u.port === "443")
      ) {
        u.port = "";
      }
      var pairs = [];
      u.searchParams.forEach(function (value, key) {
        if (!shouldStripParam(key)) pairs.push([key, value]);
      });
      pairs.sort(function (a, b) {
        return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
      });
      u.search = "";
      for (var i = 0; i < pairs.length; i++) {
        u.searchParams.append(pairs[i][0], pairs[i][1]);
      }
      u.hash = "";
      var path = u.pathname || "/";
      if (path.length > 1 && path.charAt(path.length - 1) === "/") {
        path = path.slice(0, -1);
      }
      u.pathname = path;
      return u.toString();
    } catch (e) {
      return href || window.location.href;
    }
  }

  function ruleContext() {
    var href = window.location.href;
    var u;
    try {
      u = new URL(href);
    } catch (e) {
      u = { hostname: "", pathname: href, search: "", hash: "" };
    }
    return {
      url: href,
      hostname: u.hostname || "",
      path: u.pathname || "",
      query: (u.search || "").replace(/^\?/, ""),
      hash: (u.hash || "").replace(/^#/, ""),
      title: document.title || "",
      referrer: document.referrer || "",
    };
  }

  function fieldValue(ctx, field) {
    return ctx[field] != null ? String(ctx[field]) : "";
  }

  function evalCondition(cond, ctx) {
    var actual = fieldValue(ctx, cond.field);
    var expected = cond.value != null ? String(cond.value) : "";
    var a = actual.toLowerCase();
    var e = expected.toLowerCase();
    switch (cond.op) {
      case "equals":
        return a === e;
      case "not_equals":
        return a !== e;
      case "contains":
        return a.indexOf(e) >= 0;
      case "not_contains":
        return a.indexOf(e) < 0;
      case "starts_with":
        return a.indexOf(e) === 0;
      case "ends_with":
        return a.length >= e.length && a.slice(-e.length) === e;
      case "exists":
        return actual.length > 0;
      case "regex":
        if (!expected || expected.length > 200) return false;
        try {
          return new RegExp(expected, "i").test(actual);
        } catch (err) {
          return false;
        }
      default:
        return false;
    }
  }

  function ruleMatches(rule, ctx) {
    if (rule.enabled === false) return false;
    var conditions = rule.conditions || [];
    if (!conditions.length) return false;
    if (rule.match === "or") {
      for (var i = 0; i < conditions.length; i++) {
        if (evalCondition(conditions[i], ctx)) return true;
      }
      return false;
    }
    for (var j = 0; j < conditions.length; j++) {
      if (!evalCondition(conditions[j], ctx)) return false;
    }
    return true;
  }

  var BUILTIN_RULES = [
    {
      id: "builtin-wp-admin",
      match: "or",
      conditions: [
        { field: "path", op: "contains", value: "/wp-admin" },
        { field: "path", op: "contains", value: "/logout" },
        { field: "path", op: "contains", value: "/preview" },
        { field: "query", op: "contains", value: "preview=true" },
      ],
      action: "exclude_pageview",
    },
    {
      id: "builtin-wp-admin-lead",
      match: "or",
      conditions: [
        { field: "path", op: "contains", value: "/wp-admin" },
        { field: "path", op: "contains", value: "/logout" },
        { field: "query", op: "contains", value: "preview=true" },
      ],
      action: "exclude_lead",
    },
  ];

  function evaluateRules(ctx) {
    var rules = BUILTIN_RULES.concat(snippetConfig.rules || []);
    var out = {
      excludePageview: false,
      excludeLead: false,
      forceEvents: [],
      eventMap: {},
    };
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      if (!ruleMatches(rule, ctx)) continue;
      if (rule.action === "exclude_pageview") out.excludePageview = true;
      else if (rule.action === "exclude_lead") out.excludeLead = true;
      else if (rule.action === "force_event" && rule.event_name) {
        out.forceEvents.push(rule.event_name);
      } else if (rule.action === "map_event_name" && rule.event_name) {
        out.eventMap["*"] = rule.event_name;
      }
    }
    return out;
  }

  function isDuplicateEmit(name, url) {
    var now = Date.now();
    if (
      lastEmit.name === name &&
      lastEmit.url === url &&
      now - lastEmit.at < EVENT_DEDUP_MS
    ) {
      return true;
    }
    lastEmit = { name: name, url: url, at: now };
    return false;
  }

  // --- Form field classifier (mirrors src/lib/tracking/form-field-classifier.ts) ---
  var FIELD_DICT = {
    email: [
      "email",
      "e-mail",
      "e_mail",
      "mail",
      "emailaddress",
      "email_address",
      "correo",
    ],
    phone: [
      "telefone",
      "fone",
      "celular",
      "cel",
      "whatsapp",
      "whats",
      "zap",
      "phone",
      "telephone",
      "mobile",
      "mobile_phone",
      "phone_number",
      "cell",
      "cellphone",
      "tel",
      "billing_phone",
      "shipping_phone",
    ],
    name: [
      "nome_completo",
      "nome completo",
      "primeiro_nome",
      "full_name",
      "fullname",
      "first_name",
      "firstname",
      "last_name",
      "lastname",
      "billing_name",
      "sobrenome",
      "nome",
      "name",
    ],
    cpf: ["cpf", "cpf_cliente", "tax_id"],
    cnpj: ["cnpj", "company_document", "company_tax_id"],
    company: [
      "empresa",
      "company",
      "organization",
      "organisation",
      "business",
      "corporation",
    ],
    city: ["cidade", "city", "municipio", "municipality"],
    state: ["estado", "uf", "state", "province"],
    cep: ["cep", "zipcode", "postalcode", "postal_code", "zip", "zip_code"],
    address: [
      "address",
      "endereco",
      "endereço",
      "logradouro",
      "street",
      "road",
      "avenue",
      "rua",
    ],
    number: ["numero", "número", "number", "house_number"],
    neighborhood: ["bairro", "district", "neighborhood", "neighbourhood"],
  };
  var FIELD_KINDS = [
    "email",
    "phone",
    "name",
    "cpf",
    "cnpj",
    "company",
    "city",
    "state",
    "cep",
    "address",
    "number",
    "neighborhood",
  ];

  function normText(s) {
    var out = String(s || "").toLowerCase();
    try {
      out = out.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    } catch (e) {}
    return out.trim();
  }

  function tokenScore(hay, tokens, weight) {
    if (!hay) return 0;
    var best = 0;
    for (var i = 0; i < tokens.length; i++) {
      var t = normText(tokens[i]);
      if (!t) continue;
      if (hay === t || hay.indexOf(t) >= 0) {
        best = Math.max(best, weight + Math.min(20, t.length));
      }
    }
    return best;
  }

  function associatedLabel(el) {
    if (!el) return "";
    if (el.id) {
      var byFor = document.querySelector('label[for="' + el.id + '"]');
      if (byFor) return byFor.textContent || "";
    }
    var parent = el.closest && el.closest("label");
    if (parent) return parent.textContent || "";
    return "";
  }

  function dataAttrsText(el) {
    if (!el || !el.attributes) return "";
    var parts = [];
    for (var i = 0; i < el.attributes.length; i++) {
      var a = el.attributes[i];
      if (a && a.name && a.name.indexOf("data-") === 0) {
        parts.push(a.name + " " + (a.value || ""));
      }
    }
    return parts.join(" ");
  }

  function scoreFieldKind(kind, signals) {
    var tokens = FIELD_DICT[kind] || [];
    var score = 0;
    var type = normText(signals.type);
    var ac = normText(signals.autocomplete);
    var im = normText(signals.inputmode);
    if (kind === "email") {
      if (type === "email") score += 100;
      if (ac === "email" || ac.indexOf("email") >= 0) score += 80;
    }
    if (kind === "phone") {
      if (type === "tel") score += 100;
      if (ac === "tel" || ac.indexOf("tel") === 0 || ac.indexOf("phone") >= 0)
        score += 80;
      if (im === "tel" || im === "numeric") score += 70;
    }
    if (kind === "name") {
      if (
        ac === "name" ||
        ac === "given-name" ||
        ac === "family-name" ||
        ac === "nickname"
      )
        score += 80;
    }
    if (kind === "cep" && ac === "postal-code") score += 80;
    if (
      kind === "address" &&
      (ac === "street-address" || ac === "address-line1")
    )
      score += 80;
    if (kind === "city" && ac === "address-level2") score += 80;
    if (kind === "state" && ac === "address-level1") score += 80;
    if (kind === "company" && ac === "organization") score += 80;

    score += tokenScore(normText(signals.name), tokens, 70);
    score += tokenScore(normText(signals.id), tokens, 60);
    score += tokenScore(normText(signals.placeholder), tokens, 50);
    score += tokenScore(normText(signals.label), tokens, 40);
    score += tokenScore(normText(signals.ariaLabel), tokens, 40);
    score += tokenScore(normText(signals.dataAttrs), tokens, 30);
    score += tokenScore(normText(signals.className), tokens, 20);

    var val = String(signals.value || "").trim();
    if (val) {
      if (kind === "email" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) score += 35;
      if (kind === "phone") {
        var d = val.replace(/\D/g, "");
        if (d.length >= 10 && d.length <= 13) score += 35;
      }
      if (kind === "cpf" && val.replace(/\D/g, "").length === 11) score += 35;
      if (kind === "cnpj" && val.replace(/\D/g, "").length === 14) score += 35;
      if (kind === "cep" && val.replace(/\D/g, "").length === 8) score += 35;
    }
    return score;
  }

  function classifyFieldSignals(signals) {
    var best = null;
    for (var i = 0; i < FIELD_KINDS.length; i++) {
      var kind = FIELD_KINDS[i];
      var score = scoreFieldKind(kind, signals);
      if (score < 60) continue;
      if (!best || score > best.score) best = { kind: kind, score: score };
    }
    return best;
  }

  function classifyFormElement(el) {
    return classifyFieldSignals({
      name: normalizeFormFieldKey(el.name || ""),
      id: normalizeFormFieldKey(el.id || ""),
      type: el.type || "",
      autocomplete: el.getAttribute("autocomplete") || "",
      inputmode: el.getAttribute("inputmode") || "",
      placeholder: el.placeholder || "",
      ariaLabel: el.getAttribute("aria-label") || "",
      className: el.className || "",
      dataAttrs: dataAttrsText(el),
      label: associatedLabel(el),
      value: el.value || "",
    });
  }

  function detectFramework() {
    if (frameworkHint) return frameworkHint;
    var w = window;
    var hints = [];
    if (w.Shopify || document.querySelector("[data-shopify]")) hints.push("shopify");
    if (w.wc_add_to_cart_params || document.body.classList.contains("woocommerce"))
      hints.push("woocommerce");
    if (w.vtex || document.querySelector(".vtex-")) hints.push("vtex");
    if (w.__NEXT_DATA__) hints.push("next");
    if (w.React || document.querySelector("[data-reactroot]")) hints.push("react");
    if (w.Vue || document.querySelector("[data-v-]")) hints.push("vue");
    if (w.ng || document.querySelector("[ng-version]")) hints.push("angular");
    if (document.querySelector(".elementor")) hints.push("elementor");
    frameworkHint = hints.join(",") || "unknown";
    return frameworkHint;
  }

  function loadSnippetConfig() {
    return getJson("/api/tracking/config")
      .then(function (cfg) {
        if (!cfg || typeof cfg !== "object") return snippetConfig;
        snippetConfig = {
          rules: cfg.rules || [],
          url_preserve_params: cfg.url_preserve_params || [],
          auto_ecommerce: !!cfg.auto_ecommerce,
          listen_datalayer: !!cfg.listen_datalayer,
        };
        return snippetConfig;
      })
      .catch(function () {
        return snippetConfig;
      });
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
    var ctx = ruleContext();
    var rules = evaluateRules(ctx);
    var eventName = name;
    if (rules.eventMap["*"]) eventName = rules.eventMap["*"];
    var canon = canonicalUrl(window.location.href);
    if (isDuplicateEmit(eventName, canon)) {
      return Promise.resolve({ ok: true, deduped: true });
    }
    var eventId = extra.event_id || uuid();
    var params = browserParamsFromExtra(extra);

    return trackBrowser(eventName, eventId, params).then(function (web) {
      var body = Object.assign(
        {
          trck_user_id: id,
          event_name: eventName,
          event_id: eventId,
          event_source_url: window.location.href,
          canonical_url: canon,
          ga_client_id: getGaClientId(),
          client_web: web,
        },
        extra
      );
      body.event_name = eventName;
      body.event_id = eventId;
      body.client_web = web;
      body.canonical_url = canon;
      if (!body.ga_client_id) body.ga_client_id = getGaClientId();
      return post("/api/event", body);
    });
  }

  function emitPageView(reason) {
    var id = getTrckId() || window.TRCK_USER_ID;
    if (!id) return Promise.resolve();
    var ctx = ruleContext();
    var rules = evaluateRules(ctx);
    if (rules.excludePageview) return Promise.resolve();
    var canon = canonicalUrl(window.location.href);
    if (isDuplicateEmit("PageView", canon)) {
      return Promise.resolve({ ok: true, deduped: true });
    }
    var eventId = uuid();
    return trackBrowser("PageView", eventId, {}).then(function (web) {
      return post("/api/event", {
        trck_user_id: id,
        event_name: "PageView",
        event_id: eventId,
        event_source_url: window.location.href,
        canonical_url: canon,
        utm_source: getQuery("utm_source"),
        utm_medium: getQuery("utm_medium"),
        utm_campaign: getQuery("utm_campaign"),
        utm_term: getQuery("utm_term"),
        utm_content: getQuery("utm_content"),
        ga_client_id: getGaClientId(),
        client_web: web,
      }).then(function (res) {
        for (var i = 0; i < rules.forceEvents.length; i++) {
          sendEvent(rules.forceEvents[i], {}).catch(function () {});
        }
        if (snippetConfig.auto_ecommerce) {
          maybeAutoEcommerce(reason || "page");
        }
        return res;
      });
    });
  }

  function hookSpaNavigation() {
    if (spaHooked) return;
    spaHooked = true;
    var lastPath = window.location.href;
    function onNav() {
      var next = window.location.href;
      if (next === lastPath) return;
      lastPath = next;
      emitPageView("spa").catch(function () {});
    }
    var _push = history.pushState;
    var _replace = history.replaceState;
    history.pushState = function () {
      var r = _push.apply(this, arguments);
      onNav();
      return r;
    };
    history.replaceState = function () {
      var r = _replace.apply(this, arguments);
      onNav();
      return r;
    };
    window.addEventListener("popstate", onNav);
    window.addEventListener("hashchange", onNav);
  }

  function pathSuggests(path, needles) {
    var p = String(path || "").toLowerCase();
    for (var i = 0; i < needles.length; i++) {
      if (p.indexOf(needles[i]) >= 0) return true;
    }
    return false;
  }

  function maybeAutoEcommerce(reason) {
    if (!snippetConfig.auto_ecommerce) return;
    detectFramework();
    var ctx = ruleContext();
    var q = ctx.query || "";
    if (
      /(^|&)(q|s|search)=/.test(q) ||
      pathSuggests(ctx.path, ["/search", "/busca"])
    ) {
      sendEvent("search", {}).catch(function () {});
      return;
    }
    if (pathSuggests(ctx.path, ["/cart", "/carrinho", "/bag"])) {
      sendEvent("view_cart", {}).catch(function () {});
      return;
    }
    if (
      pathSuggests(ctx.path, [
        "/checkout",
        "/finalizar",
        "/pagamento",
        "/checkout/",
      ])
    ) {
      sendEvent("begin_checkout", {}).catch(function () {});
      return;
    }
    if (
      pathSuggests(ctx.path, [
        "/obrigado",
        "/thank",
        "/order-received",
        "/pedido-recebido",
        "/success",
      ])
    ) {
      sendEvent("purchase", {}).catch(function () {});
      return;
    }
    if (
      reason === "page" &&
      document.querySelector(
        "[itemtype*='Product'], .product-price, [data-product-id], [data-sku], .price"
      )
    ) {
      sendEvent("view_item", {}).catch(function () {});
    }
  }

  function hookEcommerceClicks() {
    if (ecomHooked || !snippetConfig.auto_ecommerce) return;
    ecomHooked = true;
    var CTA_RE =
      /(adicionar|comprar|add to cart|buy now|comprar agora|adicionar ao carrinho)/i;
    document.addEventListener(
      "click",
      function (ev) {
        if (!snippetConfig.auto_ecommerce) return;
        var el = ev.target && ev.target.closest
          ? ev.target.closest("button, a, input[type=submit]")
          : null;
        if (!el) return;
        var text =
          (el.innerText || el.value || el.getAttribute("aria-label") || "") +
          " " +
          (el.className || "");
        if (!CTA_RE.test(text)) return;
        sendEvent("add_to_cart", {}).catch(function () {});
      },
      true
    );
  }

  function hookDataLayer() {
    if (dlHooked || !snippetConfig.listen_datalayer) return;
    dlHooked = true;
    window.dataLayer = window.dataLayer || [];
    var dl = window.dataLayer;
    var _push = dl.push;
    var GA4_ECOM = {
      add_to_cart: "add_to_cart",
      remove_from_cart: "remove_from_cart",
      begin_checkout: "begin_checkout",
      purchase: "purchase",
      view_item: "view_item",
      view_item_list: "view_item_list",
      view_cart: "view_cart",
      add_payment_info: "add_payment_info",
      add_shipping_info: "add_shipping_info",
      add_to_wishlist: "add_to_wishlist",
      search: "search",
    };
    dl.push = function () {
      var args = Array.prototype.slice.call(arguments);
      try {
        for (var i = 0; i < args.length; i++) {
          var item = args[i];
          var evName =
            item && typeof item === "object"
              ? item.event || item.event_name
              : null;
          if (evName && GA4_ECOM[evName]) {
            var canon = canonicalUrl(window.location.href);
            if (!isDuplicateEmit("dl:" + evName, canon)) {
              var extra = {};
              if (item.value != null) extra.value = item.value;
              if (item.currency) extra.currency = item.currency;
              sendEvent(GA4_ECOM[evName], extra).catch(function () {});
            }
          }
        }
      } catch (e) {}
      return _push.apply(dl, args);
    };
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
    if (evaluateRules(ruleContext()).excludeLead) {
      return Promise.resolve({ ok: true, skipped: "exclude_lead" });
    }
    if (wasLeadRecentlySent(null)) {
      return Promise.resolve({ ok: true, deduped: true });
    }
    markLeadSent(null);

    var id = getTrckId() || window.TRCK_USER_ID;
    var eventId = data.event_id || uuid();
    var eventName = data.event_name || "Lead";
    var canon = canonicalUrl(data.page_url || window.location.href);

    return trackBrowser(eventName, eventId, {}).then(function (web) {
      return post(
        "/api/lead",
        Object.assign(
          {
            trck_user_id: id || undefined,
            page_url: window.location.href,
            canonical_url: canon,
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
            canonical_url: canon,
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

    return loadSnippetConfig().then(function () {
      hookSpaNavigation();
      hookEcommerceClicks();
      hookDataLayer();
      detectFramework();

      return post("/api/identify", payload).then(function (data) {
        var id =
          (data && data.trck_user_id) ||
          existing ||
          "trck_" + uuid().replace(/-/g, "");
        saveTrckId(id);
        window.TRCK_USER_ID = id;
        if (data && data.ticket_code) saveTicketCode(data.ticket_code);
        patchLinks(id);
        fillTrackingFields();
        watchTrackingFields();
        return emitPageView("boot").then(function () {
          return id;
        });
      });
    });
  }

  function isSensitiveField(el) {
    if (!el) return true;
    var type = (el.type || "").toLowerCase();
    var name = String(el.name || el.id || "").toLowerCase();
    if (!el.name && !el.id) return true;
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
    var classification = {};
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
      var classified = classifyFormElement(el);
      if (classified) {
        var prev = classification[classified.kind];
        if (!prev || classified.score > prev.score) {
          classification[classified.kind] = {
            key: key,
            score: classified.score,
          };
        }
      }
    }
    return { fields: fields, classification: classification };
  }

  function captureForms() {
    if (window.__TRCK_FORMS_CAPTURED) return;
    window.__TRCK_FORMS_CAPTURED = true;

    document.addEventListener(
      "submit",
      function (ev) {
        var form = ev.target;
        if (!form || form.tagName !== "FORM") return;
        // Sempre preenche ticket/hidden antes do redirect (Elementor), mesmo com ignore.
        fillTrackingFields(form);
        if (form.getAttribute("data-trck-ignore") != null) return;
        if (evaluateRules(ruleContext()).excludeLead) return;
        if (wasLeadRecentlySent(form)) return;

        var collected = collectFormFields(form);
        var fields = collected.fields;
        var classification = collected.classification;
        var keys = Object.keys(fields);
        if (!keys.length) return;

        markLeadSent(form);

        var id = getTrckId() || window.TRCK_USER_ID;
        var eventId = uuid();
        var clicks = gatedClickIds();
        var canon = canonicalUrl(window.location.href);
        var emailVal =
          (classification.email && fields[classification.email.key]) ||
          fields.email ||
          fields.Email ||
          undefined;
        var phoneVal =
          (classification.phone && fields[classification.phone.key]) ||
          fields.phone ||
          fields.telefone ||
          fields.whatsapp ||
          fields.tel ||
          undefined;
        var nameVal =
          (classification.name && fields[classification.name.key]) ||
          undefined;
        var payload = {
          trck_user_id: id || undefined,
          form_label:
            form.getAttribute("name") ||
            form.id ||
            form.getAttribute("aria-label") ||
            undefined,
          form_action: form.getAttribute("action") || undefined,
          page_url: window.location.href,
          canonical_url: canon,
          fields: fields,
          field_classification: classification,
          email: emailVal,
          phone: phoneVal,
          name: nameVal,
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

        if (id && (emailVal || phoneVal || nameVal)) {
          post("/api/identify", {
            trck_user_id: id,
            email: emailVal,
            phone: phoneVal,
            first_name: nameVal,
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
        if (res && res.ticket_code) saveTicketCode(res.ticket_code);
        fillTrackingFields();
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
    fillTrackingFields: function (root) {
      fillTrackingFields(root);
    },
    canonicalUrl: function (href) {
      return canonicalUrl(href);
    },
    getConfig: function () {
      return snippetConfig;
    },
    framework: function () {
      return detectFramework();
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      identifyAndTrack().catch(function () {});
      captureForms();
      watchTrackingFields();
    });
  } else {
    identifyAndTrack().catch(function () {});
    captureForms();
    watchTrackingFields();
  }
})();
