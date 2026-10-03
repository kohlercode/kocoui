<?php
declare(strict_types=1);

$root = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'kocoui-tests-' . getmypid();
if (!defined('APP_ROOT')) {
    define('APP_ROOT', $root);
}

require dirname(__DIR__) . '/app/src/autoload.php';

foreach (['var/data', 'var/cache', 'var/run', 'var/sessions', 'var/log', 'config', 'files/inbox', 'files/outbox'] as $dir) {
    $path = APP_ROOT . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $dir);
    if (!is_dir($path) && !mkdir($path, 0700, true) && !is_dir($path)) {
        fwrite(STDERR, "cannot create $path\n");
        exit(1);
    }
}

$filesRoot = APP_ROOT . DIRECTORY_SEPARATOR . 'files';
$soul = APP_ROOT . DIRECTORY_SEPARATOR . 'SOUL.md';
file_put_contents($soul, "test\n");

$GLOBALS['kocoui_config_base'] = [
    'app_name' => 'Test',
    'base_url' => 'https://test.local',
    'default_lang' => 'en',
    'hermes' => [
        'base_url' => 'http://127.0.0.1:1',
        'api_key' => 'test-key',
        'connect_timeout' => 5,
        'timeout' => 600,
        'soul_path' => $soul,
    ],
    'files' => [
        'root' => $filesRoot,
        'max_upload_mb' => 50,
        'max_per_message' => 10,
    ],
    'security' => [
        'secret' => bin2hex(random_bytes(32)),
        'session_idle' => 7200,
        'session_absolute' => 43200,
        'login_max_attempts' => 5,
        'login_window' => 900,
    ],
    'push' => [
        'vapid_subject' => 'mailto:admin@test.local',
        'vapid_public' => '',
        'vapid_private' => '',
    ],
];

function kocoui_write_config(array $overlay = []): void
{
    $config = array_replace_recursive($GLOBALS['kocoui_config_base'], $overlay);
    $file = APP_ROOT . DIRECTORY_SEPARATOR . 'config' . DIRECTORY_SEPARATOR . 'config.php';
    file_put_contents($file, "<?php\nreturn " . var_export($config, true) . ";\n");
    KocoUI\Config::load($file);
}

kocoui_write_config();
ini_set('session.save_path', APP_ROOT . DIRECTORY_SEPARATOR . 'var' . DIRECTORY_SEPARATOR . 'sessions');
KocoUI\Session::start();

register_shutdown_function(static function () use ($root): void {
    $rm = static function (string $dir) use (&$rm): void {
        if (!is_dir($dir)) {
            return;
        }
        foreach (scandir($dir) ?: [] as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            $path = $dir . DIRECTORY_SEPARATOR . $item;
            is_dir($path) ? $rm($path) : @unlink($path);
        }
        @rmdir($dir);
    };
    $rm($root);
});
