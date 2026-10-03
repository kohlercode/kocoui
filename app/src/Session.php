<?php
declare(strict_types=1);

namespace KocoUI;

/**
 * PHP file sessions lock for the whole request, so every route that does not
 * write the session releases it right after the auth check. Otherwise one
 * long-running request (polling a turn, streaming) blocks every other tab.
 */
final class Session
{
    public const NAME = '__Host-hwsid';

    public static function start(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }
        // The provided PHP-FPM pool locks these with php_admin_value; setting a locked
        // value again logs a warning, so only apply what is not already in effect.
        if (session_name() !== self::NAME) {
            session_name(self::NAME);
        }
        $cookie = session_get_cookie_params();
        if (!$cookie['secure'] || !$cookie['httponly'] || $cookie['samesite'] !== 'Strict' || $cookie['path'] !== '/') {
            session_set_cookie_params([
                'lifetime' => 0,
                'path' => '/',
                'secure' => true,
                'httponly' => true,
                'samesite' => 'Strict',
            ]);
        }
        $options = [];
        foreach (['use_strict_mode', 'use_only_cookies'] as $opt) {
            if (ini_get("session.$opt") !== '1') {
                $options[$opt] = true;
            }
        }
        session_start($options);

        $now = time();
        if (isset($_SESSION['uid'])) {
            $idle = (int) Config::get('security.session_idle', 7200);
            $absolute = (int) Config::get('security.session_absolute', 43200);
            if ($now - (int) ($_SESSION['last_seen'] ?? 0) > $idle || $now - (int) ($_SESSION['login_at'] ?? 0) > $absolute) {
                self::reset();
            }
        }
        $_SESSION['last_seen'] = $now;
        if (empty($_SESSION['csrf'])) {
            $_SESSION['csrf'] = bin2hex(random_bytes(32));
        }
    }

    public static function release(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }
    }

    /** Fresh session id and empty data, keeping the session open. */
    public static function reset(): void
    {
        session_regenerate_id(true);
        $_SESSION = ['csrf' => bin2hex(random_bytes(32)), 'last_seen' => time()];
    }

    public static function login(int $userId, string $username): void
    {
        session_regenerate_id(true);
        $now = time();
        $_SESSION = [
            'uid' => $userId,
            'username' => $username,
            'login_at' => $now,
            'last_seen' => $now,
            'csrf' => bin2hex(random_bytes(32)),
        ];
    }

    public static function csrf(): string
    {
        return (string) ($_SESSION['csrf'] ?? '');
    }

    public static function userId(): ?int
    {
        return isset($_SESSION['uid']) ? (int) $_SESSION['uid'] : null;
    }
}
