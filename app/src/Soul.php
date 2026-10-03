<?php
declare(strict_types=1);

namespace KocoUI;

use KocoUI\Http\HttpError;

/**
 * The agent's persona file (SOUL.md), the only path in the Hermes home this app
 * may touch. Hermes reads it from disk when it builds a prompt, so a save applies
 * to the next turn. The previous text is kept in the app's own var directory.
 */
final class Soul
{
    /** Hermes keeps at least this many characters of a context file; longer texts are shortened. */
    public const MAX_CHARS = 20000;

    public static function read(): array
    {
        $path = self::path();
        $content = file_get_contents($path);
        if ($content === false || strlen($content) > self::MAX_CHARS * 4) {
            throw new HttpError(503, 'persona_unavailable', 'The persona file is not available');
        }
        return [
            'content' => $content,
            'max_chars' => self::MAX_CHARS,
            'has_previous' => is_file(self::previous()),
        ];
    }

    public static function write(string $content): array
    {
        $content = str_replace("\r\n", "\n", $content);
        if (str_contains($content, "\0") || !mb_check_encoding($content, 'UTF-8')) {
            throw new HttpError(400, 'persona_invalid', 'The persona text must be plain UTF-8');
        }
        if (mb_strlen($content) > self::MAX_CHARS || strlen($content) > self::MAX_CHARS * 4) {
            throw new HttpError(400, 'persona_too_long', 'The persona text is too long', ['max_chars' => self::MAX_CHARS]);
        }
        $path = self::path();
        $fh = fopen($path, 'r+');
        if ($fh === false) {
            throw new HttpError(503, 'persona_unavailable', 'The persona file is not available');
        }
        try {
            if (!flock($fh, LOCK_EX)) {
                throw new HttpError(503, 'persona_unavailable', 'The persona file is not available');
            }
            $current = stream_get_contents($fh);
            if ($current === false) {
                throw new HttpError(503, 'persona_unavailable', 'The persona file is not available');
            }
            $current = str_replace("\r\n", "\n", $current);
            if ($current !== $content) {
                self::keepPrevious($current);
                rewind($fh);
                $written = fwrite($fh, $content);
                if ($written !== strlen($content) || !ftruncate($fh, strlen($content))) {
                    rewind($fh);
                    fwrite($fh, $current);
                    ftruncate($fh, strlen($current));
                    throw new HttpError(500, 'persona_unavailable', 'The persona file could not be saved');
                }
                fflush($fh);
            }
        } finally {
            flock($fh, LOCK_UN);
            fclose($fh);
        }
        return ['saved' => true, 'has_previous' => is_file(self::previous())];
    }

    public static function restore(): array
    {
        $previous = self::previous();
        if (!is_file($previous)) {
            throw new HttpError(404, 'persona_no_previous', 'There is no previous persona to restore');
        }
        $content = file_get_contents($previous);
        if ($content === false) {
            throw new HttpError(503, 'persona_unavailable', 'The persona file is not available');
        }
        self::write($content);
        return ['content' => $content, 'has_previous' => is_file(self::previous())];
    }

    private static function path(): string
    {
        $path = (string) Config::get('hermes.soul_path', '/home/hermes/.hermes/SOUL.md');
        if (!preg_match('#^/[A-Za-z0-9._/-]+$#', $path) || str_contains($path, '..') || is_link($path)) {
            throw new HttpError(503, 'persona_unavailable', 'The persona file is not available');
        }
        $real = realpath($path);
        if ($real === false || $real !== $path || !is_file($real) || !is_readable($real) || !is_writable($real)) {
            throw new HttpError(503, 'persona_unavailable', 'The persona file is not available');
        }
        return $real;
    }

    private static function previous(): string
    {
        return APP_ROOT . '/var/soul/previous.md';
    }

    private static function keepPrevious(string $content): void
    {
        $dir = dirname(self::previous());
        if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
            throw new HttpError(500, 'persona_unavailable', 'The persona file could not be saved');
        }
        $tmp = self::previous() . '.' . bin2hex(random_bytes(4));
        if (file_put_contents($tmp, $content) === false) {
            throw new HttpError(500, 'persona_unavailable', 'The persona file could not be saved');
        }
        chmod($tmp, 0600);
        if (!rename($tmp, self::previous())) {
            @unlink($tmp);
            throw new HttpError(500, 'persona_unavailable', 'The persona file could not be saved');
        }
    }
}
