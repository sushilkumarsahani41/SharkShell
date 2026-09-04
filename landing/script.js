/* ═══════════════════════════════════════════
   SharkShell Landing — Interactions
   (analytics events are dispatched through
    window.ssTrack, defined in analytics.js)
   ═══════════════════════════════════════════ */

const track = (name, params) => window.ssTrack && window.ssTrack(name, params);

/* ── Scroll reveal (progressive enhancement: content is visible
      without JS; the reveal class is added only when JS runs) ── */
const revealTargets = document.querySelectorAll(
    '.bento-cell, .security-item, .qs-method, .arch-layout, .screenshot-viewer'
);
if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.body.classList.add('reveal-ready');
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    revealTargets.forEach((el) => revealObserver.observe(el));
}

/* ── Navbar scroll state ── */
const navbar = document.getElementById('navbar');
let navTick = false;
window.addEventListener('scroll', () => {
    if (navTick) return;
    navTick = true;
    requestAnimationFrame(() => {
        navbar.classList.toggle('scrolled', window.scrollY > 40);
        navTick = false;
    });
}, { passive: true });

/* ── Mobile nav ── */
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');
navToggle.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(open));
    if (open) track('menu_open', {});
});
navLinks.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
    });
});

/* ── Screenshot tabs ── */
const captions = {
    dashboard: 'Dashboard — SSH keys, saved hosts, and security status at a glance',
    terminal: 'Terminal — multi-tab SSH sessions with restored scrollback',
    hosts: 'Hosts — one-click connect, color-coded groups',
    keystore: 'Keystore — generate, upload, and manage keys securely',
    login: 'Login — secure authentication with TOTP 2FA'
};
const frameUrls = {
    dashboard: 'localhost:8080/dashboard',
    terminal: 'localhost:8080/dashboard/terminal',
    hosts: 'localhost:8080/dashboard/hosts',
    keystore: 'localhost:8080/dashboard/keys',
    login: 'localhost:8080/login'
};
document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach((b) => {
            b.classList.toggle('active', b === btn);
            b.setAttribute('aria-selected', String(b === btn));
        });
        document.querySelectorAll('.tab-image').forEach((img) => {
            img.classList.toggle('active', img.dataset.tab === tab);
        });
        const captionText = document.getElementById('captionText');
        if (captionText && captions[tab]) captionText.textContent = captions[tab];
        const frameUrl = document.getElementById('frameUrl');
        if (frameUrl) frameUrl.textContent = frameUrls[tab] || 'localhost:8080';
        track('screenshot_tab_view', { tab_name: tab });
    });
});

/* ── Hero deploy tabs: docker vs script ── */
const heroCmd = document.getElementById('heroCmd');
const heroCommands = {
    docker: '$ docker run -d -p 8080:80 greatsharktech/sharkshell:latest',
    script: '$ curl -fsSL https://sharkshell.in/get | sudo bash'
};
document.querySelectorAll('.deploy-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
        const method = tab.dataset.deploy;
        document.querySelectorAll('.deploy-tab').forEach((t) => {
            t.classList.toggle('active', t === tab);
            t.setAttribute('aria-selected', String(t === tab));
        });
        if (heroCmd) {
            heroCmd.innerHTML = heroCommands[method].replace(/^\$ /, '<span class="prompt">$</span> ');
        }
        track('deploy_tab_switch', { method });
    });
});

/* ── Quick Start method toggle (docker vs script) ── */
document.querySelectorAll('.qs-method-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        const method = btn.dataset.method;
        document.querySelectorAll('.qs-method-btn').forEach((b) => {
            b.classList.toggle('active', b === btn);
            b.setAttribute('aria-selected', String(b === btn));
        });
        document.querySelectorAll('.qs-method').forEach((panel) => {
            panel.classList.toggle('active', panel.dataset.method === method);
        });
        track('quickstart_method_switch', { method });
    });
});

/* ── Copy-to-clipboard (delegated; data-copy-target / data-copy-id) ── */
document.querySelectorAll('.code-copy').forEach((button) => {
    button.addEventListener('click', () => {
        const code = document.getElementById(button.dataset.copyTarget);
        if (!code) return;
        navigator.clipboard.writeText(code.textContent.replace(/^\$ /gm, '')).then(() => {
            button.classList.add('copied');
            const originalHTML = button.innerHTML;
            button.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
            setTimeout(() => {
                button.innerHTML = originalHTML;
                button.classList.remove('copied');
            }, 2000);
            track('copy_command', { command_id: button.dataset.copyId || button.dataset.copyTarget });
        });
    });
});

/* ── Smooth scroll for in-page anchors ── */
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
        const target = document.querySelector(anchor.getAttribute('href'));
        if (!target) return;
        e.preventDefault();
        const top = target.getBoundingClientRect().top + window.scrollY - 76;
        window.scrollTo({ top, behavior: 'smooth' });
    });
});

/* ── CTA + outbound + nav click tracking (data-track / data-cta) ── */
document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-track], a[href^="http"], a[href^="mailto:"]');
    if (!el) return;

    const params = {
        link_text: (el.textContent || '').trim().slice(0, 60),
        link_url: el.href || '',
        track_id: el.dataset.track || ''
    };

    if (el.dataset.cta) {
        // conversion-grade events for Google Ads
        track('cta_click', { ...params, cta_name: el.dataset.cta });
        if (el.dataset.cta === 'get_started') track('get_started', params);
    } else if (el.dataset.track) {
        track('ui_click', params);
    }

    if (el.href && /^https?:/.test(el.href)) {
        try {
            const url = new URL(el.href);
            if (url.hostname !== location.hostname) {
                track('outbound_click', {
                    link_domain: url.hostname,
                    link_url: el.href,
                    track_id: el.dataset.track || ''
                });
            }
        } catch { /* ignore malformed URLs */ }
    }
});
