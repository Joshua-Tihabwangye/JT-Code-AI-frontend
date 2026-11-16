# Security headers for every SPA response (included by each location of nginx.conf, because a location
# with its own add_header does not inherit the server's).
add_header Content-Security-Policy $jt_csp always;
add_header X-Frame-Options $jt_frame_options always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(self \"https://js.stripe.com\")" always;
add_header Cross-Origin-Opener-Policy "same-origin-allow-popups" always;
