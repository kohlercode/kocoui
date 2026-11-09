<?php
declare(strict_types=1);

namespace KocoUI;

use KocoUI\Http\HttpError;

/**
 * Install-wide UI branding under var/branding/. Survives release swaps of public/.
 * config.php app_name is only the seed / TOTP issuer; the UI reads this store.
 */
final class Branding
{
    public const MAX_NAME = 64;
    public const MAX_LOGO_BYTES = 512 * 1024;
    public const MAX_ICO_BYTES = 256 * 1024;
    public const MAX_PNG_BYTES = 1024 * 1024;

    public const COLOR_KEYS = ['bg', 'surface', 'text', 'primary', 'danger', 'success', 'warning'];

    public const SLOTS = ['logo', 'favicon', 'icon192', 'icon512'];

    /** Built-in palette; must match frontend/src/theme.js DEFAULTS. */
    public const BUILTIN_COLORS = [
        'light' => [
            'bg' => '#f3f4f6',
            'surface' => '#ffffff',
            'text' => '#2c3136',
            'primary' => '#3f6f9f',
            'danger' => '#b55252',
            'success' => '#3d7a5a',
            'warning' => '#8f7034',
        ],
        'dark' => [
            'bg' => '#1a1d21',
            'surface' => '#262a2e',
            'text' => '#cfd3d7',
            'primary' => '#7f9dba',
            'danger' => '#c48b90',
            'success' => '#7eaa96',
            'warning' => '#c4ae78',
        ],
    ];

    /** Public path basename → slot. */
    private const PUBLIC_FILES = [
        'logo.svg' => 'logo',
        'logo.png' => 'logo',
        'favicon.ico' => 'favicon',
        'icon-192.png' => 'icon192',
        'icon-512.png' => 'icon512',
    ];

    /** @return array{app_name:string,colors:array{light:array<string,string>,dark:array<string,string>},icons:array<string,mixed>,urls:array<string,string>} */
    public static function publicState(): array
    {
        $data = self::load();
        return [
            'app_name' => $data['app_name'],
            'colors' => $data['colors'],
            'icons' => self::iconFlags($data),
            'urls' => self::urls($data),
        ];
    }

    public static function appName(): string
    {
        return self::load()['app_name'];
    }

    /** @return array{light:array<string,string>,dark:array<string,string>} */
    public static function colors(): array
    {
        return self::load()['colors'];
    }

    /**
     * @param array{app_name?:mixed,colors?:mixed} $input
     * @return array{app_name:string,colors:array{light:array<string,string>,dark:array<string,string>},icons:array<string,mixed>,urls:array<string,string>}
     */
    public static function saveSettings(array $input): array
    {
        $current = self::load();
        if (array_key_exists('app_name', $input)) {
            $current['app_name'] = self::sanitizeName($input['app_name']);
        }
        if (array_key_exists('colors', $input)) {
            if (!is_array($input['colors'])) {
                throw new HttpError(400, 'branding_invalid', 'Colors must be an object');
            }
            $current['colors'] = [
                'light' => self::sanitizeScheme($input['colors']['light'] ?? null, self::BUILTIN_COLORS['light']),
                'dark' => self::sanitizeScheme($input['colors']['dark'] ?? null, self::BUILTIN_COLORS['dark']),
            ];
        }
        self::write($current);
        return self::publicState();
    }

    public static function saveIcon(string $slot, string $bytes, string $fileName): array
    {
        $slot = self::requireSlot($slot);
        if ($bytes === '') {
            throw new HttpError(400, 'empty_file', 'The file is empty');
        }
        $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        $current = self::load();

        switch ($slot) {
            case 'logo':
                if (strlen($bytes) > self::MAX_LOGO_BYTES) {
                    throw new HttpError(413, 'file_too_large', 'File exceeds the upload limit', ['max_bytes' => self::MAX_LOGO_BYTES]);
                }
                if ($ext === 'svg' || self::looksLikeSvg($bytes)) {
                    self::assertSafeSvg($bytes);
                    self::replaceLogo($current, 'svg', $bytes, 'image/svg+xml');
                } elseif ($ext === 'png' || self::looksLikePng($bytes)) {
                    self::assertSquarePng($bytes, null);
                    self::replaceLogo($current, 'png', $bytes, 'image/png');
                } else {
                    throw new HttpError(400, 'branding_icon_type', 'Logo must be a square PNG or an SVG');
                }
                break;
            case 'favicon':
                if (strlen($bytes) > self::MAX_ICO_BYTES) {
                    throw new HttpError(413, 'file_too_large', 'File exceeds the upload limit', ['max_bytes' => self::MAX_ICO_BYTES]);
                }
                if ($ext !== 'ico' && !self::looksLikeIco($bytes)) {
                    throw new HttpError(400, 'branding_icon_type', 'Favicon must be an .ico file');
                }
                if (!self::looksLikeIco($bytes)) {
                    throw new HttpError(400, 'branding_icon_type', 'Favicon must be an .ico file');
                }
                self::writeIconFile('favicon.ico', $bytes);
                $current['icons']['favicon'] = true;
                break;
            case 'icon192':
                if (strlen($bytes) > self::MAX_PNG_BYTES) {
                    throw new HttpError(413, 'file_too_large', 'File exceeds the upload limit', ['max_bytes' => self::MAX_PNG_BYTES]);
                }
                self::assertSquarePng($bytes, 192);
                self::writeIconFile('icon-192.png', $bytes);
                $current['icons']['icon192'] = true;
                break;
            case 'icon512':
                if (strlen($bytes) > self::MAX_PNG_BYTES) {
                    throw new HttpError(413, 'file_too_large', 'File exceeds the upload limit', ['max_bytes' => self::MAX_PNG_BYTES]);
                }
                self::assertSquarePng($bytes, 512);
                self::writeIconFile('icon-512.png', $bytes);
                $current['icons']['icon512'] = true;
                break;
        }

        self::write($current);
        return self::publicState();
    }

    public static function deleteIcon(string $slot): array
    {
        $slot = self::requireSlot($slot);
        $current = self::load();
        foreach (self::filesForSlot($slot, $current) as $file) {
            $path = self::iconsDir() . '/' . $file;
            if (is_file($path)) {
                @unlink($path);
            }
        }
        unset($current['icons'][$slot]);
        self::write($current);
        return self::publicState();
    }

    /** Serve a branding asset or the stock public icon. Returns true when handled. */
    public static function tryServe(string $path): bool
    {
        if (!preg_match('#^/branding/([A-Za-z0-9._-]+)$#', $path, $m)) {
            return false;
        }
        $base = $m[1];
        if (!isset(self::PUBLIC_FILES[$base])) {
            return false;
        }
        $slot = self::PUBLIC_FILES[$base];
        $data = self::load();
        $custom = self::customPath($slot, $base, $data);
        if ($custom !== null) {
            self::sendFile($custom, self::mimeFor($base));
        }
        $stock = self::stockPath($base);
        if ($stock !== null) {
            self::sendFile($stock, self::mimeFor($base));
        }
        return false;
    }

    public static function sanitizeName(mixed $name): string
    {
        if (!is_string($name)) {
            throw new HttpError(400, 'branding_invalid', 'App name must be a string');
        }
        $name = trim(preg_replace('/\s+/u', ' ', $name) ?? '');
        if ($name === '' || str_contains($name, "\0") || !mb_check_encoding($name, 'UTF-8')) {
            throw new HttpError(400, 'branding_invalid', 'App name is invalid');
        }
        if (mb_strlen($name) > self::MAX_NAME) {
            throw new HttpError(400, 'branding_name_too_long', 'App name is too long', ['max' => self::MAX_NAME]);
        }
        return $name;
    }

    /** @param mixed $input */
    public static function sanitizeScheme(mixed $input, array $fallback): array
    {
        $out = $fallback;
        if (!is_array($input)) {
            return $out;
        }
        foreach (self::COLOR_KEYS as $key) {
            $value = strtolower(trim((string) ($input[$key] ?? '')));
            if (preg_match('/^#[0-9a-f]{6}$/', $value)) {
                $out[$key] = $value;
            }
        }
        return $out;
    }

    public static function assertSafeSvg(string $bytes): void
    {
        if (!mb_check_encoding($bytes, 'UTF-8') || str_contains($bytes, "\0")) {
            throw new HttpError(400, 'branding_icon_invalid', 'SVG must be UTF-8 text');
        }
        $lower = strtolower($bytes);
        if (!str_contains($lower, '<svg')) {
            throw new HttpError(400, 'branding_icon_invalid', 'File is not an SVG');
        }
        foreach (['<script', 'onload=', 'onerror=', 'onclick=', 'javascript:', '<foreignobject', 'xlink:href="http', "xlink:href='http", 'href="http', "href='http", 'data:text/html'] as $bad) {
            if (str_contains($lower, $bad)) {
                throw new HttpError(400, 'branding_icon_invalid', 'SVG contains disallowed content');
            }
        }
    }

    public static function assertSquarePng(string $bytes, ?int $exactSize): void
    {
        if (!self::looksLikePng($bytes)) {
            throw new HttpError(400, 'branding_icon_type', 'Expected a PNG image');
        }
        $info = @getimagesizefromstring($bytes);
        if ($info === false || ($info[2] ?? 0) !== IMAGETYPE_PNG) {
            throw new HttpError(400, 'branding_icon_invalid', 'PNG could not be read');
        }
        $w = (int) $info[0];
        $h = (int) $info[1];
        if ($w < 1 || $h < 1 || $w !== $h) {
            throw new HttpError(400, 'branding_icon_not_square', 'Image must be square');
        }
        if ($exactSize !== null && ($w !== $exactSize || $h !== $exactSize)) {
            throw new HttpError(400, 'branding_icon_size', 'Image must be ' . $exactSize . '×' . $exactSize, [
                'size' => $exactSize,
            ]);
        }
        if ($exactSize === null && $w > 1024) {
            throw new HttpError(400, 'branding_icon_size', 'Logo PNG must be at most 1024×1024');
        }
    }

    /** @return array{app_name:string,colors:array{light:array<string,string>,dark:array<string,string>},icons:array<string,mixed>} */
    private static function load(): array
    {
        $path = self::settingsPath();
        $raw = is_file($path) ? file_get_contents($path) : false;
        $decoded = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
        $icons = is_array($decoded['icons'] ?? null) ? $decoded['icons'] : [];
        $name = is_string($decoded['app_name'] ?? null) ? trim($decoded['app_name']) : '';
        if ($name === '') {
            $name = (string) Config::get('app_name', 'Hermes');
        }
        try {
            $name = self::sanitizeName($name);
        } catch (HttpError) {
            $name = (string) Config::get('app_name', 'Hermes');
            try {
                $name = self::sanitizeName($name);
            } catch (HttpError) {
                $name = 'Hermes';
            }
        }
        return [
            'app_name' => $name,
            'colors' => [
                'light' => self::sanitizeScheme($decoded['colors']['light'] ?? null, self::BUILTIN_COLORS['light']),
                'dark' => self::sanitizeScheme($decoded['colors']['dark'] ?? null, self::BUILTIN_COLORS['dark']),
            ],
            'icons' => $icons,
        ];
    }

    /** @param array{app_name:string,colors:array{light:array<string,string>,dark:array<string,string>},icons:array<string,mixed>} $data */
    private static function write(array $data): void
    {
        self::ensureDirs();
        $payload = json_encode([
            'app_name' => $data['app_name'],
            'colors' => $data['colors'],
            'icons' => $data['icons'],
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $tmp = self::settingsPath() . '.' . bin2hex(random_bytes(4));
        if (file_put_contents($tmp, $payload) === false) {
            throw new HttpError(500, 'branding_unavailable', 'Branding could not be saved');
        }
        chmod($tmp, 0600);
        if (!rename($tmp, self::settingsPath())) {
            @unlink($tmp);
            throw new HttpError(500, 'branding_unavailable', 'Branding could not be saved');
        }
    }

    /** @param array{icons:array<string,mixed>} $data */
    private static function iconFlags(array $data): array
    {
        $logo = $data['icons']['logo'] ?? null;
        return [
            'logo' => $logo === 'svg' || $logo === 'png' ? $logo : null,
            'favicon' => !empty($data['icons']['favicon']),
            'icon192' => !empty($data['icons']['icon192']),
            'icon512' => !empty($data['icons']['icon512']),
        ];
    }

    /**
     * @param array{icons:array<string,mixed>} $data
     * @return array{logo:string,favicon:string,icon192:string,icon512:string}
     */
    private static function urls(array $data): array
    {
        $bust = static function (string $path, ?string $file): string {
            if ($file === null || !is_file($file)) {
                return $path;
            }
            return $path . '?v=' . (string) filemtime($file);
        };
        $logoExt = $data['icons']['logo'] ?? null;
        $logoFile = ($logoExt === 'svg' || $logoExt === 'png')
            ? self::iconsDir() . '/logo.' . $logoExt
            : null;
        $logoPath = ($logoExt === 'svg' || $logoExt === 'png')
            ? '/branding/logo.' . $logoExt
            : '';
        return [
            'logo' => $logoPath !== '' ? $bust($logoPath, $logoFile) : '',
            'favicon' => $bust(
                !empty($data['icons']['favicon']) ? '/branding/favicon.ico' : '/icons/icon-192.png',
                !empty($data['icons']['favicon']) ? self::iconsDir() . '/favicon.ico' : null,
            ),
            'icon192' => $bust(
                !empty($data['icons']['icon192']) ? '/branding/icon-192.png' : '/icons/icon-192.png',
                !empty($data['icons']['icon192']) ? self::iconsDir() . '/icon-192.png' : null,
            ),
            'icon512' => $bust(
                !empty($data['icons']['icon512']) ? '/branding/icon-512.png' : '/icons/icon-512.png',
                !empty($data['icons']['icon512']) ? self::iconsDir() . '/icon-512.png' : null,
            ),
        ];
    }

    /** @param array{icons:array<string,mixed>} $data */
    private static function replaceLogo(array &$data, string $ext, string $bytes, string $mime): void
    {
        unset($mime);
        foreach (['logo.svg', 'logo.png'] as $old) {
            $path = self::iconsDir() . '/' . $old;
            if (is_file($path)) {
                @unlink($path);
            }
        }
        self::writeIconFile('logo.' . $ext, $bytes);
        $data['icons']['logo'] = $ext;
    }

    /** @param array{icons:array<string,mixed>} $data @return list<string> */
    private static function filesForSlot(string $slot, array $data): array
    {
        return match ($slot) {
            'logo' => ['logo.svg', 'logo.png'],
            'favicon' => ['favicon.ico'],
            'icon192' => ['icon-192.png'],
            'icon512' => ['icon-512.png'],
            default => [],
        };
    }

    /** @param array{icons:array<string,mixed>} $data */
    private static function customPath(string $slot, string $base, array $data): ?string
    {
        if ($slot === 'logo') {
            $ext = $data['icons']['logo'] ?? null;
            if ($ext !== 'svg' && $ext !== 'png') {
                return null;
            }
            if ($base !== 'logo.' . $ext) {
                return null;
            }
            $path = self::iconsDir() . '/' . $base;
            return is_file($path) ? $path : null;
        }
        $flag = match ($slot) {
            'favicon' => !empty($data['icons']['favicon']),
            'icon192' => !empty($data['icons']['icon192']),
            'icon512' => !empty($data['icons']['icon512']),
            default => false,
        };
        if (!$flag) {
            return null;
        }
        $path = self::iconsDir() . '/' . $base;
        return is_file($path) ? $path : null;
    }

    private static function stockPath(string $base): ?string
    {
        // Only the PWA PNGs have stock files under public/icons/. Logo and favicon
        // have no stock under /branding/; Shell links to /icons/ when they are unset.
        $map = [
            'icon-192.png' => 'icon-192.png',
            'icon-512.png' => 'icon-512.png',
        ];
        $stock = $map[$base] ?? null;
        if ($stock === null) {
            return null;
        }
        $path = APP_ROOT . '/public/icons/' . $stock;
        return is_file($path) ? $path : null;
    }

    private static function sendFile(string $path, string $mime): never
    {
        header('Content-Type: ' . $mime);
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: public, max-age=86400');
        header('Content-Length: ' . (string) filesize($path));
        readfile($path);
        exit;
    }

    private static function mimeFor(string $base): string
    {
        return match ($base) {
            'logo.svg' => 'image/svg+xml',
            'logo.png', 'icon-192.png', 'icon-512.png' => 'image/png',
            'favicon.ico' => 'image/x-icon',
            default => 'application/octet-stream',
        };
    }

    private static function writeIconFile(string $name, string $bytes): void
    {
        self::ensureDirs();
        $path = self::iconsDir() . '/' . $name;
        $tmp = $path . '.' . bin2hex(random_bytes(4));
        if (file_put_contents($tmp, $bytes) === false) {
            throw new HttpError(500, 'branding_unavailable', 'Branding could not be saved');
        }
        chmod($tmp, 0640);
        if (!rename($tmp, $path)) {
            @unlink($tmp);
            throw new HttpError(500, 'branding_unavailable', 'Branding could not be saved');
        }
    }

    private static function requireSlot(string $slot): string
    {
        if (!in_array($slot, self::SLOTS, true)) {
            throw new HttpError(404, 'not_found', 'Unknown icon slot');
        }
        return $slot;
    }

    private static function ensureDirs(): void
    {
        foreach ([self::rootDir(), self::iconsDir()] as $dir) {
            if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
                throw new HttpError(500, 'branding_unavailable', 'Branding could not be saved');
            }
        }
    }

    private static function rootDir(): string
    {
        return APP_ROOT . '/var/branding';
    }

    private static function iconsDir(): string
    {
        return self::rootDir() . '/icons';
    }

    private static function settingsPath(): string
    {
        return self::rootDir() . '/settings.json';
    }

    private static function looksLikePng(string $bytes): bool
    {
        return str_starts_with($bytes, "\x89PNG\r\n\x1a\n");
    }

    private static function looksLikeSvg(string $bytes): bool
    {
        $trim = ltrim($bytes);
        return str_starts_with($trim, '<svg') || str_starts_with($trim, '<?xml');
    }

    private static function looksLikeIco(string $bytes): bool
    {
        if (strlen($bytes) < 6) {
            return false;
        }
        $reserved = unpack('v', substr($bytes, 0, 2))[1] ?? -1;
        $type = unpack('v', substr($bytes, 2, 2))[1] ?? -1;
        return $reserved === 0 && ($type === 1 || $type === 2);
    }
}
