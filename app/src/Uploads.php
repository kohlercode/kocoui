<?php
declare(strict_types=1);

namespace KocoUI;

use KocoUI\Http\HttpError;

/** Uploaded files and who owns them; the bytes live in Files::inbox(). */
final class Uploads
{
    public static function add(string $id, int $userId, string $name, string $mime, int $size, string $relPath): void
    {
        Db::pdo()->prepare('INSERT INTO uploads (id, user_id, name, mime, size, rel_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            ->execute([$id, $userId, $name, $mime, $size, $relPath, time()]);
    }

    public static function find(string $id, int $userId): ?array
    {
        $st = Db::pdo()->prepare('SELECT * FROM uploads WHERE id = ? AND user_id = ?');
        $st->execute([$id, $userId]);
        return $st->fetch() ?: null;
    }

    /**
     * Claims the user's uploads for a conversation and returns them in the given order.
     * An upload already sent in another conversation is refused.
     *
     * @param list<string> $ids
     * @return list<array<string, mixed>>
     */
    public static function claim(array $ids, int $userId, string $sessionId): array
    {
        $out = [];
        foreach ($ids as $id) {
            $row = self::find($id, $userId);
            if ($row === null || ($row['session_id'] !== null && $row['session_id'] !== $sessionId)) {
                throw new HttpError(400, 'invalid_attachment', 'Unknown or already used attachment');
            }
            $out[] = $row;
        }
        $st = Db::pdo()->prepare('UPDATE uploads SET session_id = ? WHERE id = ?');
        foreach ($out as $row) {
            $st->execute([$sessionId, $row['id']]);
        }
        return $out;
    }

    public static function remove(array $row): void
    {
        $file = Files::inbox() . '/' . $row['rel_path'];
        if (is_file($file)) {
            unlink($file);
        }
        $dir = dirname($file);
        if (str_starts_with($dir, Files::inbox() . '/') && is_dir($dir) && count(scandir($dir)) === 2) {
            rmdir($dir);
        }
        Db::pdo()->prepare('DELETE FROM uploads WHERE id = ?')->execute([$row['id']]);
    }

    public static function removeForSession(string $sessionId): void
    {
        $st = Db::pdo()->prepare('SELECT * FROM uploads WHERE session_id = ?');
        $st->execute([$sessionId]);
        foreach ($st->fetchAll() as $row) {
            self::remove($row);
        }
    }
}
