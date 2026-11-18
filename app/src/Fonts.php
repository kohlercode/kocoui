<?php
declare(strict_types=1);

namespace KocoUI;

/**
 * Self-hosted UI fonts under public/fonts/. Config lists which families the
 * settings picker shows; files never come from a CDN.
 */
final class Fonts
{
    public const SYSTEM_ID = 'system';
    public const MAX_FAMILY = 64;
    public const ID_RE = '/^[a-z0-9-]+$/';
    public const FILE_RE = '/^[A-Za-z0-9][A-Za-z0-9._\/-]*\.woff2$/';
    public const WEIGHT_RE = '/^[1-9][0-9]{0,3}(?: [1-9][0-9]{0,3})?$/';

    /** Fontsource latin / latin-ext unicode-range values. */
    public const SUBSET_RANGES = [
        'latin' => 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
        'latin-ext' => 'U+0100-02AF,U+0304,U+0308,U+0329,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
    ];

    /**
     * Shipped families. file may be a path, a list of paths, or weight => path(s).
     * Must stay in sync with frontend/src/fonts.js DEFAULT_FONTS.
     */
    public const BUILTIN = [
        'inter' => [
            'family' => 'Inter',
            'weight' => '100 900',
            'file' => [
                'inter/inter-latin-wght-normal.woff2',
                'inter/inter-latin-ext-wght-normal.woff2',
            ],
        ],
        'roboto' => [
            'family' => 'Roboto',
            'weight' => '100 900',
            'file' => [
                'roboto/roboto-latin-wght-normal.woff2',
                'roboto/roboto-latin-ext-wght-normal.woff2',
            ],
        ],
        'open-sans' => [
            'family' => 'Open Sans',
            'weight' => '300 800',
            'file' => [
                'open-sans/open-sans-latin-wght-normal.woff2',
                'open-sans/open-sans-latin-ext-wght-normal.woff2',
            ],
        ],
        'lato' => [
            'family' => 'Lato',
            'file' => [
                '400' => [
                    'lato/lato-latin-400-normal.woff2',
                    'lato/lato-latin-ext-400-normal.woff2',
                ],
                '700' => [
                    'lato/lato-latin-700-normal.woff2',
                    'lato/lato-latin-ext-700-normal.woff2',
                ],
            ],
        ],
        'montserrat' => [
            'family' => 'Montserrat',
            'weight' => '100 900',
            'file' => [
                'montserrat/montserrat-latin-wght-normal.woff2',
                'montserrat/montserrat-latin-ext-wght-normal.woff2',
            ],
        ],
        'source-sans-3' => [
            'family' => 'Source Sans 3',
            'weight' => '200 900',
            'file' => [
                'source-sans-3/source-sans-3-latin-wght-normal.woff2',
                'source-sans-3/source-sans-3-latin-ext-wght-normal.woff2',
            ],
        ],
        'nunito-sans' => [
            'family' => 'Nunito Sans',
            'weight' => '200 1000',
            'file' => [
                'nunito-sans/nunito-sans-latin-wght-normal.woff2',
                'nunito-sans/nunito-sans-latin-ext-wght-normal.woff2',
            ],
        ],
        'poppins' => [
            'family' => 'Poppins',
            'file' => [
                '400' => [
                    'poppins/poppins-latin-400-normal.woff2',
                    'poppins/poppins-latin-ext-400-normal.woff2',
                ],
                '700' => [
                    'poppins/poppins-latin-700-normal.woff2',
                    'poppins/poppins-latin-ext-700-normal.woff2',
                ],
            ],
        ],
        'noto-sans' => [
            'family' => 'Noto Sans',
            'weight' => '100 900',
            'file' => [
                'noto-sans/noto-sans-latin-wght-normal.woff2',
                'noto-sans/noto-sans-latin-ext-wght-normal.woff2',
            ],
        ],
        'ibm-plex-sans' => [
            'family' => 'IBM Plex Sans',
            'weight' => '100 700',
            'file' => [
                'ibm-plex-sans/ibm-plex-sans-latin-wght-normal.woff2',
                'ibm-plex-sans/ibm-plex-sans-latin-ext-wght-normal.woff2',
            ],
        ],
    ];

    public static function dir(): string
    {
        return APP_ROOT . '/public/fonts';
    }

    /** Catalog for Shell data-fonts. System is always first; missing files are omitted. */
    public static function catalog(): array
    {
        $raw = Config::get('fonts.families', null);
        $specs = is_array($raw) ? $raw : self::BUILTIN;
        $families = [];
        foreach ($specs as $id => $spec) {
            $family = self::parseFamily((string) $id, $spec);
            if ($family !== null) {
                $families[] = $family;
            }
        }
        $ids = array_column($families, 'id');
        $default = self::sanitizeId((string) Config::get('fonts.default', self::SYSTEM_ID)) ?? self::SYSTEM_ID;
        if ($default !== self::SYSTEM_ID && !in_array($default, $ids, true)) {
            $default = self::SYSTEM_ID;
        }

        array_unshift($families, ['id' => self::SYSTEM_ID, 'family' => 'system', 'files' => []]);

        return [
            'default' => $default,
            'families' => $families,
        ];
    }

    /** Relative paths declared in a family spec, whether or not the files exist. */
    public static function declaredFiles(array $spec): array
    {
        $out = [];
        foreach (self::expandSpec($spec) as $item) {
            if (isset($item['file']) && is_string($item['file']) && $item['file'] !== '') {
                $out[] = $item['file'];
            }
        }
        return $out;
    }

    private static function parseFamily(string $id, mixed $spec): ?array
    {
        $id = self::sanitizeId($id);
        if ($id === null || $id === self::SYSTEM_ID || !is_array($spec)) {
            return null;
        }
        $name = self::sanitizeFamily($spec['family'] ?? null);
        if ($name === null) {
            return null;
        }
        $files = [];
        foreach (self::expandSpec($spec) as $item) {
            $resolved = self::resolveItem($item);
            if ($resolved !== null) {
                $files[] = $resolved;
            }
        }
        if ($files === []) {
            return null;
        }
        return ['id' => $id, 'family' => $name, 'files' => $files];
    }

    private static function expandSpec(array $spec): array
    {
        if (isset($spec['files']) && is_array($spec['files'])) {
            $out = [];
            foreach ($spec['files'] as $item) {
                if (is_array($item)) {
                    $out[] = $item;
                }
            }
            return $out;
        }
        $file = $spec['file'] ?? null;
        $weight = self::sanitizeWeight($spec['weight'] ?? null) ?? '400';
        if (is_string($file)) {
            return [['file' => $file, 'weight' => $weight]];
        }
        if (!is_array($file)) {
            return [];
        }
        if (array_is_list($file)) {
            $out = [];
            foreach ($file as $item) {
                if (is_string($item)) {
                    $out[] = ['file' => $item, 'weight' => $weight];
                } elseif (is_array($item) && isset($item['file'])) {
                    $out[] = $item;
                }
            }
            return $out;
        }
        $out = [];
        foreach ($file as $w => $path) {
            $wt = self::sanitizeWeight((string) $w);
            if ($wt === null) {
                continue;
            }
            if (is_string($path)) {
                $out[] = ['file' => $path, 'weight' => $wt];
            } elseif (is_array($path)) {
                foreach ($path as $p) {
                    if (is_string($p)) {
                        $out[] = ['file' => $p, 'weight' => $wt];
                    }
                }
            }
        }
        return $out;
    }

    private static function resolveItem(array $item): ?array
    {
        $rel = self::sanitizeRel($item['file'] ?? null);
        if ($rel === null) {
            return null;
        }
        $url = self::resolveUrl($rel);
        if ($url === null) {
            return null;
        }
        $weight = self::sanitizeWeight($item['weight'] ?? null) ?? '400';
        $subset = self::subset($rel, $item['subset'] ?? null);
        $out = ['url' => $url, 'weight' => $weight];
        if ($subset !== null) {
            $out['unicodeRange'] = self::SUBSET_RANGES[$subset];
        }
        return $out;
    }

    private static function resolveUrl(string $rel): ?string
    {
        $root = realpath(self::dir());
        if ($root === false || !is_dir($root)) {
            return null;
        }
        $full = $root . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $rel);
        $real = realpath($full);
        $prefix = $root . DIRECTORY_SEPARATOR;
        if ($real === false || !str_starts_with($real, $prefix) || !is_file($real) || !is_readable($real)) {
            return null;
        }
        $inside = str_replace('\\', '/', substr($real, strlen($root) + 1));
        return '/fonts/' . $inside;
    }

    private static function subset(string $rel, mixed $explicit): ?string
    {
        if (is_string($explicit) && isset(self::SUBSET_RANGES[$explicit])) {
            return $explicit;
        }
        if (str_contains($rel, 'latin-ext')) {
            return 'latin-ext';
        }
        if (str_contains($rel, '-latin-') || str_contains($rel, '/latin-') || str_starts_with($rel, 'latin-')) {
            return 'latin';
        }
        return null;
    }

    private static function sanitizeId(mixed $id): ?string
    {
        if (!is_string($id) || !preg_match(self::ID_RE, $id) || strlen($id) > 64) {
            return null;
        }
        return $id;
    }

    private static function sanitizeFamily(mixed $name): ?string
    {
        if (!is_string($name)) {
            return null;
        }
        $name = trim($name);
        if ($name === '' || strlen($name) > self::MAX_FAMILY || strpbrk($name, "\0\r\n<>\"'") !== false) {
            return null;
        }
        return $name;
    }

    private static function sanitizeWeight(mixed $weight): ?string
    {
        if (!is_string($weight) && !is_int($weight)) {
            return null;
        }
        $weight = trim((string) $weight);
        if ($weight === '' || !preg_match(self::WEIGHT_RE, $weight)) {
            return null;
        }
        return $weight;
    }

    private static function sanitizeRel(mixed $rel): ?string
    {
        if (!is_string($rel) || str_contains($rel, "\0") || str_contains($rel, '\\')) {
            return null;
        }
        $rel = ltrim(str_replace('\\', '/', $rel), '/');
        if ($rel === '' || str_contains($rel, '..') || !preg_match(self::FILE_RE, $rel)) {
            return null;
        }
        return $rel;
    }
}
