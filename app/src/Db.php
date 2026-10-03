<?php
declare(strict_types=1);

namespace KocoUI;

use PDO;

final class Db
{
    private static ?PDO $pdo = null;

    /** Schema steps, applied in order; PRAGMA user_version records how many ran. */
    private const MIGRATIONS = [
        <<<'SQL'
        CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            totp_secret_enc TEXT NOT NULL,
            totp_last_step INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            last_login_at INTEGER
        );
        CREATE TABLE login_attempts (
            ip TEXT NOT NULL,
            username TEXT NOT NULL COLLATE NOCASE,
            ts INTEGER NOT NULL,
            success INTEGER NOT NULL
        );
        CREATE INDEX login_attempts_ts ON login_attempts (ts);
        SQL,
        <<<'SQL'
        CREATE TABLE deleted_sessions (
            id TEXT PRIMARY KEY,
            deleted_at INTEGER NOT NULL
        );
        SQL,
        <<<'SQL'
        CREATE TABLE uploads (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            session_id TEXT,
            name TEXT NOT NULL,
            mime TEXT NOT NULL,
            size INTEGER NOT NULL,
            rel_path TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX uploads_session ON uploads (session_id);
        SQL,
        <<<'SQL'
        CREATE TABLE push_subscriptions (
            endpoint TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            user_agent TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL,
            last_seen_at INTEGER NOT NULL
        );
        CREATE INDEX push_subscriptions_user ON push_subscriptions (user_id);
        CREATE TABLE push_sent (
            run_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            sent_at INTEGER NOT NULL,
            PRIMARY KEY (run_id, kind)
        );
        SQL,
        <<<'SQL'
        CREATE TABLE watch_queue (
            run_id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            session_id TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL
        );
        CREATE INDEX watch_queue_expires ON watch_queue (expires_at);
        SQL,
    ];

    public static function pdo(): PDO
    {
        if (self::$pdo === null) {
            $file = APP_ROOT . '/var/data/app.sqlite';
            if (!is_file($file)) {
                touch($file);
                chmod($file, 0600);
            }
            $pdo = new PDO('sqlite:' . $file, null, null, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
            $pdo->exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
            self::migrate($pdo);
            self::$pdo = $pdo;
        }
        return self::$pdo;
    }

    private static function migrate(PDO $pdo): void
    {
        $version = (int) $pdo->query('PRAGMA user_version')->fetchColumn();
        for ($i = $version; $i < count(self::MIGRATIONS); $i++) {
            $pdo->beginTransaction();
            $pdo->exec(self::MIGRATIONS[$i]);
            $pdo->exec('PRAGMA user_version = ' . ($i + 1));
            $pdo->commit();
        }
    }
}
