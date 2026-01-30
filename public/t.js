(function () {
  "use strict";
  var s = document.currentScript;
  if (!s) return;
  var account = s.getAttribute("data-account");
  if (!account) return;

  var endpoint = s.src.replace(/\/t\.js.*$/, "/api/realtime/track");
  var sid =
    sessionStorage.getItem("_mc_sid") ||
    (function () {
      var id =
        Math.random().toString(36).substring(2) +
        Date.now().toString(36);
      sessionStorage.setItem("_mc_sid", id);
      return id;
    })();

  var lastPath = "";

  function send(type) {
    var path = location.pathname;
    var body = JSON.stringify({
      ad_account_id: account,
      session_id: sid,
      page_path: path,
      event_type: type || "page_view",
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
    } else {
      var x = new XMLHttpRequest();
      x.open("POST", endpoint, true);
      x.setRequestHeader("Content-Type", "application/json");
      x.send(body);
    }
    lastPath = path;
  }

  // Initial page view
  send("page_view");

  // SPA route changes
  var origPush = history.pushState;
  history.pushState = function () {
    origPush.apply(this, arguments);
    if (location.pathname !== lastPath) send("page_view");
  };
  window.addEventListener("popstate", function () {
    if (location.pathname !== lastPath) send("page_view");
  });

  // Heartbeat every 15s while tab is visible
  setInterval(function () {
    if (document.visibilityState === "visible") {
      send("heartbeat");
    }
  }, 15000);
})();
