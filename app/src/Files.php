<?php
declare(strict_types=1);

namespace KocoUI;

/**
 * The shared files folder: uploads in inbox/ (written here, read by the agent) and
 * agent output in outbox/ (written by the agent, read here). Every path from the
 * browser or from an agent reply goes through resolve(), which only accepts regular
 * files whose real path lies inside the root — symlinks and ../ cannot escape it.
 */
final class Files
{
    public const THUMB_WIDTHS = [160, 320, 480, 960];

    private const INLINE_TYPES = [
        'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp',
        'video/mp4', 'video/webm', 'video/ogg',
        'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/flac', 'audio/x-flac',
        'audio/mp4', 'audio/aac', 'audio/x-m4a',
        'application/pdf', 'text/plain',
    ];

    public static function root(): string
    {
        $root = realpath((string) Config::get('files.root', '/srv/kocoui/files'));
        if ($root === false || !is_dir($root)) {
            throw new Http\HttpError(503, 'files_unavailable', 'The shared files folder is not set up');
        }
        return $root;
    }

    public static function inbox(): string
    {
        return self::root() . '/inbox';
    }

    public static function outbox(): string
    {
        return self::root() . '/outbox';
    }

    public static function resolve(string $path): ?string
    {
        if ($path === '' || strlen($path) > 2048 || str_contains($path, "\0") || $path[0] !== '/') {
            return null;
        }
        $real = realpath($path);
        $root = self::root();
        if ($real === false || !str_starts_with($real, $root . '/') || !is_file($real) || !is_readable($real)) {
            return null;
        }
        return $real;
    }

    public static function relative(string $real): string
    {
        return substr($real, strlen(self::root()) + 1);
    }

    public static function origin(string $real): string
    {
        return str_starts_with($real, self::inbox() . '/') ? 'upload' : 'agent';
    }

    public static function mime(string $real): string
    {
        $mime = (string) (finfo_file(finfo_open(FILEINFO_MIME_TYPE), $real) ?: 'application/octet-stream');
        // finfo reports audio-only MP4/WebM containers as video; the extension knows better.
        $ext = strtolower(pathinfo($real, PATHINFO_EXTENSION));
        if ($mime === 'video/mp4' && in_array($ext, ['m4a', 'aac'], true)) {
            return 'audio/mp4';
        }
        if ($mime === 'video/webm' && $ext === 'weba') {
            return 'audio/webm';
        }
        return $mime;
    }

    public static function kind(string $mime): string
    {
        return match (true) {
            $mime === 'image/svg+xml' => 'file',
            str_starts_with($mime, 'image/') => 'image',
            in_array($mime, ['video/mp4', 'video/webm', 'video/ogg'], true) => 'video',
            str_starts_with($mime, 'audio/') => 'audio',
            $mime === 'application/pdf' => 'pdf',
            default => 'file',
        };
    }

    public static function inlineSafe(string $mime): bool
    {
        return in_array($mime, self::INLINE_TYPES, true);
    }

    /** @return array<string, mixed> */
    public static function info(string $real): array
    {
        $mime = self::mime($real);
        $kind = self::kind($mime);
        $info = [
            'path' => $real,
            'name' => basename($real),
            'size' => (int) filesize($real),
            'mime' => $mime,
            'kind' => $kind,
            'origin' => self::origin($real),
            'modified' => (int) filemtime($real),
            'url' => '/api/files?path=' . rawurlencode($real),
        ];
        if ($kind === 'image') {
            $dim = @getimagesize($real);
            if ($dim) {
                $info['width'] = (int) $dim[0];
                $info['height'] = (int) $dim[1];
            }
            if (self::thumbable($mime)) {
                $info['thumb'] = '/api/files/thumb?path=' . rawurlencode($real);
            }
        }
        return $info;
    }

    public static function thumbable(string $mime): bool
    {
        return in_array($mime, ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp'], true)
            && function_exists('imagecreatefromstring');
    }

    public static function sanitizeName(string $name): string
    {
        $name = basename(str_replace('\\', '/', $name));
        $name = preg_replace('/[\x00-\x1F\x7F\/:*?"<>|]+/u', '_', $name) ?? '';
        $name = trim(preg_replace('/\s+/u', ' ', $name) ?? '', " .\t");
        if ($name === '' || preg_match('/^\.+$/', $name)) {
            $name = 'file';
        }
        if (mb_strlen($name) > 120) {
            $ext = pathinfo($name, PATHINFO_EXTENSION);
            $ext = $ext !== '' && mb_strlen($ext) <= 10 ? '.' . $ext : '';
            $name = mb_substr(pathinfo($name, PATHINFO_FILENAME), 0, 120 - mb_strlen($ext)) . $ext;
        }
        return $name;
    }

    public static function humanSize(int $bytes): string
    {
        $units = ['B', 'KB', 'MB', 'GB'];
        $i = 0;
        $n = (float) $bytes;
        while ($n >= 1024 && $i < count($units) - 1) {
            $n /= 1024;
            $i++;
        }
        return ($i === 0 ? (string) $bytes : number_format($n, $n < 10 ? 1 : 0)) . ' ' . $units[$i];
    }
}
