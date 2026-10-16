<?php
declare(strict_types=1);

namespace KocoUI;

/**
 * Read-only view of one operator-configured directory the agent writes.
 * Paths from the browser are relative to that root. realpath must stay inside
 * it, and symlinks are not followed. Chat files stay on Files::resolve().
 */
final class Work
{
    public const LIST_LIMIT = 500;
    public const TEXT_LIMIT = 262144;

    /** Source files the in-app preview may return. HTML and SVG are not included. */
    private const TEXT_EXTENSIONS = [
        'md', 'markdown', 'txt', 'text', 'log', 'csv', 'tsv',
        'json', 'jsonl', 'xml', 'yaml', 'yml', 'toml', 'ini', 'conf', 'cfg',
        'css', 'scss', 'less',
        'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx',
        'php', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'kts', 'c', 'h', 'cpp', 'hpp', 'cc', 'cs',
        'sql', 'sh', 'bash', 'zsh', 'ps1',
        'vue', 'svelte', 'rst', 'adoc',
        'gitignore', 'dockerignore', 'editorconfig',
    ];

    public static function enabled(): bool
    {
        return self::root() !== null;
    }

    public static function root(): ?string
    {
        $configured = Config::get('files.work_root', '');
        if (!is_string($configured) || $configured === '') {
            return null;
        }
        $real = realpath($configured);
        if ($real === false || !is_dir($real) || !is_readable($real)) {
            return null;
        }
        return self::norm($real);
    }

    /** Empty string is the work root. Null means the path is not usable. */
    public static function relative(string $input): ?string
    {
        if ($input === '' || $input === '.') {
            return '';
        }
        if (strlen($input) > 1024 || str_contains($input, "\0") || str_contains($input, '\\') || str_starts_with($input, '/')) {
            return null;
        }
        foreach (explode('/', $input) as $part) {
            if ($part === '' || $part === '.' || $part === '..') {
                return null;
            }
        }
        return $input;
    }

    public static function directory(string $input): ?string
    {
        $root = self::root();
        $rel = self::relative($input);
        if ($root === null || $rel === null) {
            return null;
        }
        $path = $rel === '' ? $root : $root . '/' . $rel;
        if (is_link($path) || !self::within($root, $path) || !is_dir($path)) {
            return null;
        }
        $real = realpath($path);
        return $real === false ? null : self::norm($real);
    }

    public static function file(string $input): ?string
    {
        $root = self::root();
        $rel = self::relative($input);
        if ($root === null || $rel === null || $rel === '') {
            return null;
        }
        $path = $root . '/' . $rel;
        if (is_link($path) || !self::within($root, $path) || !is_file($path) || !is_readable($path)) {
            return null;
        }
        $real = realpath($path);
        return $real === false ? null : self::norm($real);
    }

    public static function relativeOf(string $real): string
    {
        $root = self::root();
        $real = self::norm($real);
        if ($root === null || ($real !== $root && !str_starts_with($real, $root . '/'))) {
            return '';
        }
        return $real === $root ? '' : substr($real, strlen($root) + 1);
    }

    public static function isText(string $name): bool
    {
        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        return $ext !== '' && in_array($ext, self::TEXT_EXTENSIONS, true);
    }

    /** @return array{text:string,truncated:bool}|null */
    public static function readText(string $real): ?array
    {
        if (!self::isText($real)) {
            return null;
        }
        $fh = fopen($real, 'rb');
        if ($fh === false) {
            return null;
        }
        $data = fread($fh, self::TEXT_LIMIT + 1);
        fclose($fh);
        if ($data === false || str_contains($data, "\0")) {
            return null;
        }
        $truncated = strlen($data) > self::TEXT_LIMIT;
        if ($truncated) {
            $data = substr($data, 0, self::TEXT_LIMIT);
        }
        if (!mb_check_encoding($data, 'UTF-8')) {
            $data = mb_scrub($data, 'UTF-8');
        }
        return ['text' => $data, 'truncated' => $truncated];
    }

    /** @return array{path:string,entries:list<array<string,mixed>>,truncated:bool}|null */
    public static function listing(string $input): ?array
    {
        $rel = self::relative($input);
        $dir = self::directory($input);
        if ($rel === null || $dir === null) {
            return null;
        }
        $names = scandir($dir);
        if ($names === false) {
            return null;
        }
        $entries = [];
        foreach ($names as $name) {
            if ($name === '.' || $name === '..') {
                continue;
            }
            $path = $dir . '/' . $name;
            $child = $rel === '' ? $name : $rel . '/' . $name;
            if (is_link($path)) {
                $entries[] = ['name' => $name, 'type' => 'link', 'path' => $child];
                continue;
            }
            if (is_dir($path)) {
                $entries[] = ['name' => $name, 'type' => 'dir', 'path' => $child];
                continue;
            }
            if (!is_file($path) || !is_readable($path)) {
                continue;
            }
            $mime = Files::mime($path);
            $row = [
                'name' => $name,
                'type' => 'file',
                'path' => $child,
                'size' => (int) filesize($path),
                'mime' => $mime,
                'kind' => Files::kind($mime),
                'modified' => (int) filemtime($path),
                'text' => self::isText($name),
                'url' => '/api/work/file?path=' . rawurlencode($child),
            ];
            if (Files::thumbable($mime)) {
                $row['thumb'] = '/api/work/thumb?path=' . rawurlencode($child);
            }
            $entries[] = $row;
        }
        usort($entries, static function (array $a, array $b): int {
            $rank = static fn (array $row): int => $row['type'] === 'dir' ? 0 : 1;
            $byType = $rank($a) <=> $rank($b);
            return $byType !== 0 ? $byType : strnatcasecmp($a['name'], $b['name']);
        });
        $truncated = count($entries) > self::LIST_LIMIT;
        if ($truncated) {
            $entries = array_slice($entries, 0, self::LIST_LIMIT);
        }
        return ['path' => $rel, 'entries' => $entries, 'truncated' => $truncated];
    }

    private static function within(string $root, string $path): bool
    {
        $root = self::norm($root);
        $path = self::norm($path);
        if ($path !== $root && !str_starts_with($path, $root . '/')) {
            return false;
        }
        if (is_link($root)) {
            return false;
        }
        $acc = $root;
        if ($path !== $root) {
            foreach (explode('/', substr($path, strlen($root) + 1)) as $part) {
                if ($part === '' || $part === '.' || $part === '..') {
                    return false;
                }
                $acc .= '/' . $part;
                if (is_link($acc) || !file_exists($acc)) {
                    return false;
                }
            }
        }
        $real = realpath($path);
        if ($real === false) {
            return false;
        }
        $real = self::norm($real);
        return $real === $root || str_starts_with($real, $root . '/');
    }

    private static function norm(string $path): string
    {
        $path = str_replace('\\', '/', $path);
        return strlen($path) > 1 ? rtrim($path, '/') : $path;
    }
}
