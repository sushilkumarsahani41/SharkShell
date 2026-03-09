/* ═══════════════════════════════════════════
   SharkShell Landing Page — Interactions
   ═══════════════════════════════════════════ */

// Scroll-triggered animations
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
        }
    });
}, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

document.querySelectorAll('.animate-in').forEach(el => observer.observe(el));

// Navbar scroll effect
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 50);
});

// Mobile nav toggle
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');
navToggle.addEventListener('click', () => {
    navLinks.classList.toggle('open');
});

// Close mobile nav on link click
navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => navLinks.classList.remove('open'));
});

// Screenshot tab switching
const captions = {
    dashboard: 'Dashboard — Overview of your SSH keys, saved hosts, and security status at a glance',
    terminal: 'Terminal — Multi-tab SSH sessions with live connections to your servers',
    hosts: 'Hosts — Manage your server connections with one-click connect',
    keystore: 'Keystore — Generate, upload, and manage your SSH keys securely',
    login: 'Login — Secure authentication with a modern glassmorphic design'
};

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;

        // Update active tab button
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Switch image
        document.querySelectorAll('.tab-image').forEach(img => img.classList.remove('active'));
        const targetImg = document.querySelector(`.tab-image[data-tab="${tab}"]`);
        if (targetImg) targetImg.classList.add('active');

        // Update caption
        const captionText = document.getElementById('captionText');
        if (captionText && captions[tab]) {
            captionText.textContent = captions[tab];
        }

        // Update frame URL
        const frameUrl = document.querySelector('.frame-url');
        if (frameUrl) {
            const urls = {
                dashboard: 'localhost:8080/dashboard',
                terminal: 'localhost:8080/dashboard/terminal',
                hosts: 'localhost:8080/dashboard/hosts',
                keystore: 'localhost:8080/dashboard/keys',
                login: 'localhost:8080/login'
            };
            frameUrl.textContent = urls[tab] || 'localhost:8080';
        }
    });
});

// Copy to clipboard
function copyCode(button, elementId) {
    const code = document.getElementById(elementId);
    if (!code) return;
    const text = code.textContent;
    navigator.clipboard.writeText(text).then(() => {
        button.classList.add('copied');
        const svg = button.querySelector('svg');
        const originalHTML = button.innerHTML;
        button.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
        setTimeout(() => {
            button.innerHTML = originalHTML;
            button.classList.remove('copied');
        }, 2000);
    });
}

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector(anchor.getAttribute('href'));
        if (target) {
            const offset = 80;
            const top = target.getBoundingClientRect().top + window.scrollY - offset;
            window.scrollTo({ top, behavior: 'smooth' });
        }
    });
});
