<<<<<<< HEAD
/* ============================================================
   ServiGo — main.js
   Lightweight vanilla JS interactions (no framework)
   ============================================================ */
(function () {
    'use strict';

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* --------------------------------------------------------
       1. Auto-dismiss flash messages
       -------------------------------------------------------- */
    document.querySelectorAll('.flash-messages .alert').forEach(function (alert) {
        if (prefersReducedMotion) return; // keep messages persistent if user prefers reduced motion
        setTimeout(function () {
            const closeBtn = alert.querySelector('.btn-close');
            if (closeBtn) closeBtn.click();
        }, 5000);
    });

    /* --------------------------------------------------------
       2. Sidebar mobile toggle (dashboards)
       -------------------------------------------------------- */
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('dashboardSidebar');
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', function () {
            sidebar.classList.toggle('mobile-open');
            const expanded = sidebar.classList.contains('mobile-open');
            sidebarToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        });
    }

    /* --------------------------------------------------------
       3. Confirm dialogs for destructive actions
       -------------------------------------------------------- */
    document.querySelectorAll('[data-confirm]').forEach(function (el) {
        el.addEventListener('click', function (event) {
            if (!window.confirm(el.dataset.confirm)) {
                event.preventDefault();
            }
        });
    });

    /* --------------------------------------------------------
       4. Password visibility toggle
       -------------------------------------------------------- */
    document.querySelectorAll('.password-toggle').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const targetId = btn.dataset.target;
            const input = document.getElementById(targetId);
            if (!input) return;
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            const icon = btn.querySelector('i');
            if (icon) {
                icon.className = show ? 'bi bi-eye-slash' : 'bi bi-eye';
            }
            btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        });
    });

    /* --------------------------------------------------------
       5. Scroll-to-top button
       -------------------------------------------------------- */
    const scrollTopBtn = document.getElementById('scrollTopBtn');
    if (scrollTopBtn) {
        window.addEventListener('scroll', function () {
            const show = window.pageYOffset > 600;
            scrollTopBtn.classList.toggle('visible', show);
        }, { passive: true });

        scrollTopBtn.addEventListener('click', function () {
            window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
        });
    }

    /* --------------------------------------------------------
       6. Service booking form — duration & price hint
       -------------------------------------------------------- */
    const bookingDate = document.getElementById('id_preferred_date');
    if (bookingDate) {
        const today = new Date();
        const minDate = today.toISOString().split('T')[0];
        if (!bookingDate.value || bookingDate.value < minDate) {
            bookingDate.setAttribute('min', minDate);
        }
    }

    /* --------------------------------------------------------
       7. Station search autosubmit (filters)
       -------------------------------------------------------- */
    const stationFilterForm = document.getElementById('stationFilterForm');
    if (stationFilterForm) {
        const submitBtn = stationFilterForm.querySelector('button[type="submit"]');
        stationFilterForm.querySelectorAll('select, input').forEach(function (field) {
            if (field.type === 'search') return; // wait for submit on search inputs
            field.addEventListener('change', function () {
                if (submitBtn) submitBtn.click();
            });
        });
    }

    /* --------------------------------------------------------
       8. Count-up animation for stat values
       -------------------------------------------------------- */
    if (!prefersReducedMotion) {
        const counters = document.querySelectorAll('[data-count-up]');
        if (counters.length && 'IntersectionObserver' in window) {
            const observer = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    const el = entry.target;
                    const target = parseInt(el.dataset.countUp, 10) || 0;
                    const duration = 1200;
                    const start = performance.now();

                    function tick(now) {
                        const progress = Math.min((now - start) / duration, 1);
                        const eased = 1 - Math.pow(1 - progress, 3);
                        el.textContent = Math.round(target * eased).toLocaleString();
                        if (progress < 1) requestAnimationFrame(tick);
                    }
                    requestAnimationFrame(tick);
                    observer.unobserve(el);
                });
            }, { threshold: 0.4 });
            counters.forEach(function (el) { observer.observe(el); });
        }
    }
})();
=======
(function ($) {
    "use strict";

    // Spinner
    var spinner = function () {
        setTimeout(function () {
            if ($('#spinner').length > 0) {
                $('#spinner').removeClass('show');
            }
        }, 1);
    };
    spinner(0);
    
    
    // Initiate the wowjs
    new WOW().init();


    // Header carousel
    $(".header-carousel").owlCarousel({
        animateOut: 'fadeOut',
        items: 1,
        margin: 0,
        stagePadding: 0,
        autoplay: true,
        smartSpeed: 1000,
        dots: false,
        loop: true,
        nav : true,
        navText : [
            '<i class="bi bi-arrow-left"></i>',
            '<i class="bi bi-arrow-right"></i>'
        ],
    });


   // Service-carousel
   $(".service-carousel").owlCarousel({
    autoplay: true,
    smartSpeed: 2000,
    center: false,
    dots: false,
    loop: true,
    margin: 25,
    nav : true,
    navText : [
        '<i class="bi bi-arrow-left"></i>',
        '<i class="bi bi-arrow-right"></i>'
    ],
    responsiveClass: true,
    responsive: {
        0:{
            items:1
        },
        576:{
            items:1
        },
        768:{
            items:2
        },
        992:{
            items:2
        },
        1200:{
            items:2
        }
    }
    });


    // testimonial carousel
    $(".testimonial-carousel").owlCarousel({
        autoplay: true,
        smartSpeed: 1500,
        center: false,
        dots: true,
        loop: true,
        margin: 25,
        nav : false,
        navText : [
            '<i class="fa fa-angle-right"></i>',
            '<i class="fa fa-angle-left"></i>'
        ],
        responsiveClass: true,
        responsive: {
            0:{
                items:1
            },
            576:{
                items:1
            },
            768:{
                items:1
            },
            992:{
                items:1
            },
            1200:{
                items:2
            }
        }
    });


   // Back to top button
   $(window).scroll(function () {
    if ($(this).scrollTop() > 300) {
        $('.back-to-top').fadeIn('slow');
    } else {
        $('.back-to-top').fadeOut('slow');
    }
    });
    $('.back-to-top').click(function () {
        $('html, body').animate({scrollTop: 0}, 1500, 'easeInOutExpo');
        return false;
    });


})(jQuery);

>>>>>>> 203200fa3b3d26eef6b0f23658fa9daac987005b
