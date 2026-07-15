/* ═══════════════════════════════════════════════════════════════
   SharkShell Landing — Deep GA4 Analytics
   ───────────────────────────────────────────────────────────────
   ⚠ SET YOUR GA4 MEASUREMENT ID BELOW (Admin → Data Streams → Web)
   Everything else works out of the box.

   Events emitted (mark as key events / conversions in GA4 UI):
     get_started        ← primary ad conversion
     copy_command       ← strong intent (user grabbed the deploy cmd)
     outbound_click     ← GitHub / Docker Hub exits
     cta_click          ← every CTA with cta_name + location
     section_view       ← per-section visibility (funnel analysis)
     scroll_depth       ← 25 / 50 / 75 / 90
     screenshot_tab_view, ui_click, menu_open
     time_on_page       ← 30s / 60s / 120s / 300s engaged time
     web_vitals         ← LCP / CLS / INP field data
   User properties: first-touch UTM + landing referrer.
   ═══════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var GA_MEASUREMENT_ID = 'G-7PCL3Q0EE2';

    /* ── gtag bootstrap ── */
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;

    /* ── Consent Mode v2 ──
       Denied-by-default in EEA/UK/CH (Google Ads requirement),
       granted elsewhere. Wire the update call to a CMP banner if you
       later target EU traffic seriously. */
    var EEA = ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU',
               'IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES',
               'SE','IS','LI','NO','GB','CH'];
    gtag('consent', 'default', {
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: 'denied',
        region: EEA,
        wait_for_update: 500
    });
    gtag('consent', 'default', {
        ad_storage: 'granted',
        ad_user_data: 'granted',
        ad_personalization: 'granted',
        analytics_storage: 'granted'
    });

    gtag('js', new Date());

    /* ── First-touch attribution (persisted) ── */
    var ATTR_KEY = 'ss_first_touch';
    var attribution = null;
    try {
        attribution = JSON.parse(localStorage.getItem(ATTR_KEY) || 'null');
        if (!attribution) {
            var q = new URLSearchParams(location.search);
            attribution = {
                utm_source: q.get('utm_source') || '(none)',
                utm_medium: q.get('utm_medium') || '(none)',
                utm_campaign: q.get('utm_campaign') || '(none)',
                utm_term: q.get('utm_term') || '(none)',
                utm_content: q.get('utm_content') || '(none)',
                gclid: q.get('gclid') ? 'yes' : 'no',
                first_referrer: document.referrer || '(direct)',
                first_seen: new Date().toISOString().slice(0, 10)
            };
            localStorage.setItem(ATTR_KEY, JSON.stringify(attribution));
        }
    } catch (e) { /* storage unavailable — proceed without attribution */ }

    gtag('config', GA_MEASUREMENT_ID, {
        send_page_view: true,
        anonymize_ip: true
    });
    if (attribution) {
        gtag('set', 'user_properties', {
            ft_source: attribution.utm_source,
            ft_medium: attribution.utm_medium,
            ft_campaign: attribution.utm_campaign,
            ft_gclid: attribution.gclid,
            ft_referrer: attribution.first_referrer.slice(0, 90),
            ft_date: attribution.first_seen
        });
    }

    /* ── load gtag.js ── */
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_MEASUREMENT_ID;
    document.head.appendChild(s);

    /* ── public tracker used by script.js ── */
    window.ssTrack = function (name, params) {
        gtag('event', name, params || {});
    };

    /* ── everything below waits for the DOM ── */
    function onReady(fn) {
        if (document.readyState !== 'loading') fn();
        else document.addEventListener('DOMContentLoaded', fn);
    }

    onReady(function () {

        /* section_view: fire once per section at 40% visibility */
        if ('IntersectionObserver' in window) {
            var seen = {};
            var sectionObserver = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    var id = entry.target.id;
                    if (entry.isIntersecting && !seen[id]) {
                        seen[id] = true;
                        window.ssTrack('section_view', { section_id: id });
                        sectionObserver.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.4 });
            ['hero', 'features', 'mcp', 'screenshots', 'architecture', 'security', 'quickstart', 'cta']
                .forEach(function (id) {
                    var el = document.getElementById(id);
                    if (el) sectionObserver.observe(el);
                });
        }

        /* scroll_depth: 25 / 50 / 75 / 90 */
        var marks = [25, 50, 75, 90];
        var fired = {};
        var depthTick = false;
        window.addEventListener('scroll', function () {
            if (depthTick) return;
            depthTick = true;
            requestAnimationFrame(function () {
                depthTick = false;
                var scrollable = document.documentElement.scrollHeight - window.innerHeight;
                if (scrollable <= 0) return;
                var pct = (window.scrollY / scrollable) * 100;
                marks.forEach(function (m) {
                    if (pct >= m && !fired[m]) {
                        fired[m] = true;
                        window.ssTrack('scroll_depth', { percent_scrolled: m });
                    }
                });
            });
        }, { passive: true });

        /* time_on_page: engaged-time milestones (pauses when tab hidden) */
        var engaged = 0;
        var milestones = { 30: false, 60: false, 120: false, 300: false };
        setInterval(function () {
            if (document.visibilityState !== 'visible') return;
            engaged += 5;
            Object.keys(milestones).forEach(function (t) {
                if (engaged >= +t && !milestones[t]) {
                    milestones[t] = true;
                    window.ssTrack('time_on_page', { engaged_seconds: +t });
                }
            });
        }, 5000);
    });

    /* ── Web Vitals (LCP / CLS / INP) via PerformanceObserver ── */
    function sendVital(name, value) {
        window.ssTrack('web_vitals', {
            metric_name: name,
            metric_value: Math.round(name === 'CLS' ? value * 1000 : value),
            non_interaction: true
        });
    }
    try {
        var lcp = 0;
        new PerformanceObserver(function (list) {
            var entries = list.getEntries();
            lcp = entries[entries.length - 1].startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });

        var cls = 0;
        new PerformanceObserver(function (list) {
            list.getEntries().forEach(function (e) {
                if (!e.hadRecentInput) cls += e.value;
            });
        }).observe({ type: 'layout-shift', buffered: true });

        var inp = 0;
        new PerformanceObserver(function (list) {
            list.getEntries().forEach(function (e) {
                var d = e.duration;
                if (d > inp) inp = d;
            });
        }).observe({ type: 'event', durationThreshold: 40, buffered: true });

        // report once when the page is hidden (end of session proxy)
        document.addEventListener('visibilitychange', function report() {
            if (document.visibilityState !== 'hidden') return;
            if (lcp) sendVital('LCP', lcp);
            if (cls) sendVital('CLS', cls);
            if (inp) sendVital('INP', inp);
            document.removeEventListener('visibilitychange', report);
        });
    } catch (e) { /* older browser — vitals skipped */ }
})();
