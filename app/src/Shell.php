<?php
declare(strict_types=1);

namespace KocoUI;

/** Renders the single HTML page that boots the Preact app from the Vite manifest. */
final class Shell
{
    public static function render(): never
    {
        $manifestFile = APP_ROOT . '/public/assets/.vite/manifest.json';
        $manifest = is_file($manifestFile) ? json_decode((string) file_get_contents($manifestFile), true) : null;
        $entry = null;
        foreach (is_array($manifest) ? $manifest : [] as $chunk) {
            if (!empty($chunk['isEntry'])) {
                $entry = $chunk;
                break;
            }
        }
        if ($entry === null) {
            http_response_code(503);
            header('Content-Type: text/plain; charset=utf-8');
            echo "Frontend not built.\n";
            exit;
        }

        $e = static fn (string $s): string => htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $name = (string) Config::get('app_name', 'Hermes');
        $lang = (string) Config::get('default_lang', 'en');

        header('Content-Type: text/html; charset=utf-8');
        header('X-Robots-Tag: noindex, nofollow');
        echo "<!doctype html>\n";
        echo '<html lang="' . $e($lang) . '" data-default-lang="' . $e($lang) . '" data-app-name="' . $e($name) . '" data-app-version="' . $e(Version::VERSION) . '">';
        echo '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">';
        echo '<meta name="robots" content="noindex, nofollow"><title>' . $e($name) . '</title>';
        echo '<meta name="theme-color" content="#212529">';
        echo '<meta name="mobile-web-app-capable" content="yes">';
        echo '<meta name="apple-mobile-web-app-capable" content="yes">';
        echo '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">';
        // use-credentials: the vhost is behind basic auth; without this the browser
        // fetches the manifest anonymously, gets 401, and treats the app as non-installable.
        echo '<link rel="manifest" href="/manifest.webmanifest" crossorigin="use-credentials">';
        echo '<link rel="apple-touch-icon" href="/icons/icon-192.png">';
        echo '<link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png">';
        foreach ($entry['css'] ?? [] as $css) {
            echo '<link rel="stylesheet" href="/assets/' . $e($css) . '">';
        }
        echo '<script type="module" src="/assets/' . $e($entry['file']) . '"></script>';
        echo '</head><body><div id="app"></div><noscript>JavaScript is required.</noscript></body></html>';
        exit;
    }
}
