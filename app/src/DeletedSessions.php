<?php
declare(strict_types=1);

namespace KocoUI;

/**
 * Hermes writes a conversation's auto-generated title a few seconds after the
 * turn ends, and that write re-creates a session deleted in the meantime as an
 * empty row. Deleted ids are remembered for a while so the list can hide and
 * re-delete such ghosts. The daily file prune (deploy/templates/kocoui-files-prune.sh)
 * also reads them to remove the agent's files of deleted conversations.
 */
final class DeletedSessions
{
    private const KEEP_SECONDS = 3 * 86400;

    public static function add(string $id): void
    {
        Db::pdo()->prepare('INSERT OR REPLACE INTO deleted_sessions (id, deleted_at) VALUES (?, ?)')
            ->execute([$id, time()]);
    }

    /** @return array<string, true> */
    public static function recent(): array
    {
        $pdo = Db::pdo();
        $pdo->prepare('DELETE FROM deleted_sessions WHERE deleted_at < ?')->execute([time() - self::KEEP_SECONDS]);
        $ids = $pdo->query('SELECT id FROM deleted_sessions')->fetchAll(\PDO::FETCH_COLUMN);
        return array_fill_keys($ids, true);
    }
}
