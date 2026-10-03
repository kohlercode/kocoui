<?php
declare(strict_types=1);

namespace KocoUI\Push;

use KocoUI\Db;
use PDO;

final class Subscriptions
{
    /** @return list<array{endpoint:string,p256dh:string,auth:string}> */
    public static function forUser(int $userId): array
    {
        $st = Db::pdo()->prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?');
        $st->execute([$userId]);
        return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    public static function countForUser(int $userId): int
    {
        $st = Db::pdo()->prepare('SELECT COUNT(*) FROM push_subscriptions WHERE user_id = ?');
        $st->execute([$userId]);
        return (int) $st->fetchColumn();
    }

    public static function upsert(int $userId, string $endpoint, string $p256dh, string $auth, string $userAgent): void
    {
        $now = time();
        $st = Db::pdo()->prepare(
            'INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, user_agent, created_at, last_seen_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(endpoint) DO UPDATE SET
               user_id = excluded.user_id,
               p256dh = excluded.p256dh,
               auth = excluded.auth,
               user_agent = excluded.user_agent,
               last_seen_at = excluded.last_seen_at',
        );
        $st->execute([$endpoint, $userId, $p256dh, $auth, mb_substr($userAgent, 0, 300), $now, $now]);
    }

    public static function deleteForUser(int $userId, string $endpoint): void
    {
        $st = Db::pdo()->prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?');
        $st->execute([$userId, $endpoint]);
    }

    public static function deleteEndpoint(string $endpoint): void
    {
        $st = Db::pdo()->prepare('DELETE FROM push_subscriptions WHERE endpoint = ?');
        $st->execute([$endpoint]);
    }
}
