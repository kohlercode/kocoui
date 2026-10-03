<?php
// Copy to config.php (chmod 600, owned by the app user). deploy/install-release.sh
// generates it automatically on the first install.
return [
    'app_name' => 'Hermes',
    // Public origin of this UI, without trailing slash. Used for the Origin check.
    'base_url' => 'https://ui.example.com',
    // Fallback UI language when the browser asks for none we have: 'en' or 'de'.
    'default_lang' => 'en',

    'hermes' => [
        'base_url' => 'http://127.0.0.1:8642',
        // API_SERVER_KEY from the Hermes .env. Never put this anywhere the browser can see.
        'api_key' => '',
        'connect_timeout' => 5,
        'timeout' => 600,
        // Status polls for push notifications. A silent gateway must not hold the timer.
        'push_watch_timeout' => 10,
        // The only Hermes-home file the app may read or write. Provision grants access to this path alone.
        'soul_path' => '/home/hermes/.hermes/SOUL.md',
    ],

    // Shared folder for uploads (inbox/) and files the agent sends (outbox/), created by
    // deploy/provision.sh. max_upload_mb must not exceed provision's --upload-max-mb (nginx limit).
    'files' => [
        'root' => '/srv/kocoui/files',
        'max_upload_mb' => 50,
        'max_per_message' => 10,
    ],

    'security' => [
        // 64 hex chars (openssl rand -hex 32). Encrypts TOTP secrets at rest.
        'secret' => '',
        'session_idle' => 7200,
        'session_absolute' => 43200,
        'login_max_attempts' => 5,
        'login_window' => 900,
    ],

    // Web Push (optional). Generate with: php bin/kocoui push:vapid
    // Leave keys empty to disable. Subject must be a mailto: or https: URL.
    'push' => [
        'vapid_subject' => 'mailto:admin@example.com',
        'vapid_public' => '',
        'vapid_private' => '',
    ],
];
