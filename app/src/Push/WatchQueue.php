<?php
declare(strict_types=1);

namespace KocoUI\Push;

use KocoUI\Db;

/** Runs waiting for a push notification. A timer drains this table. */
final class WatchQueue
{
    public static function add(string $runId, int $userId, string $sessionId, int $ttlSeconds = 1800): void
    {
        $now = time();
        Db::pdo()->prepare(
            'INSERT OR REPLACE INTO watch_queue (run_id, user_id, session_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)'
        )->execute([$runId, $userId, $sessionId, $now, $now + $ttlSeconds]);
    }

    /** @return list<array{run_id:string,user_id:int,session_id:string,created_at:int,expires_at:int}> */
    public static function due(int $limit = 20): array
    {
        $st = Db::pdo()->prepare(
            'SELECT run_id, user_id, session_id, created_at, expires_at FROM watch_queue WHERE expires_at >= ? ORDER BY created_at ASC LIMIT ?'
        );
        $st->bindValue(1, time(), \PDO::PARAM_INT);
        $st->bindValue(2, $limit, \PDO::PARAM_INT);
        $st->execute();
        return $st->fetchAll() ?: [];
    }

    public static function forget(string $runId): void
    {
        Db::pdo()->prepare('DELETE FROM watch_queue WHERE run_id = ?')->execute([$runId]);
    }

    public static function purge(): void
    {
        Db::pdo()->prepare('DELETE FROM watch_queue WHERE expires_at < ?')->execute([time()]);
    }
}
