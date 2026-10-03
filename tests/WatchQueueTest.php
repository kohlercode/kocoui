<?php
declare(strict_types=1);

use KocoUI\Cli;
use KocoUI\Db;
use KocoUI\Push\RunWatcher;
use KocoUI\Push\Vapid;
use KocoUI\Push\WatchQueue;

return static function (): void {
    $db = Db::pdo();
    $db->exec('DELETE FROM watch_queue');
    $now = time();
    $db->prepare('INSERT INTO watch_queue (run_id, user_id, session_id, created_at, expires_at) VALUES (?, 1, ?, ?, ?)')
        ->execute(['old', 's', $now - 100, $now - 10]);
    WatchQueue::add('a', 1, 's1');
    WatchQueue::add('b', 1, 's1');
    WatchQueue::add('c', 1, 's1');

    $ids = array_column(WatchQueue::due(2), 'run_id');
    TestCase::assertSame(['a', 'b'], $ids, 'due honours the limit and skips expired rows');
    WatchQueue::purge();
    TestCase::assertSame(['a', 'b', 'c'], array_column(WatchQueue::due(10), 'run_id'), 'purge removes expired rows');
    WatchQueue::forget('b');
    TestCase::assertSame(['a', 'c'], array_column(WatchQueue::due(10), 'run_id'), 'forget removes one row');

    kocoui_write_config(['hermes' => ['connect_timeout' => 1, 'push_watch_timeout' => 2]]);
    $started = microtime(true);
    TestCase::assertSame('running', RunWatcher::tick('missing', 1, 's1'), 'unreachable gateway');
    TestCase::assertTrue(microtime(true) - $started < 8, 'unreachable poll does not use the long turn timeout');

    [$proc, $port, $file] = kocoui_http_server("<?php http_response_code(404); echo '{}';");
    try {
        kocoui_write_config(['hermes' => [
            'base_url' => "http://127.0.0.1:$port",
            'connect_timeout' => 1,
            'push_watch_timeout' => 2,
        ]]);
        TestCase::assertSame('gone', RunWatcher::tick('missing', 1, 's1'), '404 forgets the run');
    } finally {
        kocoui_stop_server($proc, $file);
    }

    $db->exec('DELETE FROM watch_queue');
    [$hold, $holdPort, $holdFile] = kocoui_hold_server();
    try {
        $keys = Vapid::generate();
        kocoui_write_config(['hermes' => [
            'base_url' => "http://127.0.0.1:$holdPort",
            'connect_timeout' => 1,
            'push_watch_timeout' => 2,
        ], 'push' => [
            'vapid_subject' => 'mailto:admin@test.local',
            'vapid_public' => $keys['public'],
            'vapid_private' => $keys['private'],
        ]]);
        $started = microtime(true);
        TestCase::assertSame('running', RunWatcher::tick('slow', 1, 's1'), 'silent gateway is a transient miss');
        TestCase::assertTrue(microtime(true) - $started < 8, 'status poll uses the short timeout');

        foreach (['q1', 'q2', 'q3'] as $id) {
            WatchQueue::add($id, 1, 's1');
        }
        $watch = new ReflectionMethod(Cli::class, 'pushWatch');
        $started = microtime(true);
        TestCase::assertSame(0, $watch->invoke(null, false, 3), 'push:watch exits 0');
        TestCase::assertTrue(microtime(true) - $started < 12, 'one pass stops on its time budget');
        TestCase::assertTrue(count(WatchQueue::due(10)) >= 1, 'rows left for the next tick');

        $before = count(WatchQueue::due(10));
        ob_start();
        TestCase::assertSame(0, $watch->invoke(null, true), 'dry-run exits 0');
        $out = ob_get_clean();
        TestCase::assertTrue(str_contains($out, 'q'), 'dry-run lists due rows');
        TestCase::assertSame($before, count(WatchQueue::due(10)), 'dry-run deletes nothing');
    } finally {
        kocoui_stop_server($hold, $holdFile);
        kocoui_write_config();
        $db->exec('DELETE FROM watch_queue');
    }
};

/** @return array{0:resource,1:int,2:string} */
function kocoui_http_server(string $php): array
{
    $file = tempnam(sys_get_temp_dir(), 'kococi');
    file_put_contents($file, $php);
    $port = kocoui_free_port();
    $proc = proc_open(
        [PHP_BINARY, '-S', "127.0.0.1:$port", $file],
        [1 => ['file', $file . '.log', 'w'], 2 => ['file', $file . '.log', 'a']],
        $pipes,
    );
    kocoui_wait_port($port);
    return [$proc, $port, $file];
}

/** @return array{0:resource,1:int,2:string} */
function kocoui_hold_server(): array
{
    $file = tempnam(sys_get_temp_dir(), 'kocohold');
    file_put_contents($file, <<<'PHP'
<?php
$s = stream_socket_server($argv[1]);
$held = [];
$end = time() + 30;
while (time() < $end && is_resource($s)) {
    $c = @stream_socket_accept($s, 1);
    if ($c) {
        $held[] = $c;
    }
}
PHP);
    $port = kocoui_free_port();
    $proc = proc_open(
        [PHP_BINARY, $file, "tcp://127.0.0.1:$port"],
        [1 => ['file', $file . '.log', 'w'], 2 => ['file', $file . '.log', 'a']],
        $pipes,
    );
    kocoui_wait_port($port);
    return [$proc, $port, $file];
}

function kocoui_free_port(): int
{
    $s = stream_socket_server('tcp://127.0.0.1:0');
    $name = stream_socket_get_name($s, false);
    fclose($s);
    return (int) substr((string) $name, strrpos((string) $name, ':') + 1);
}

function kocoui_wait_port(int $port): void
{
    $deadline = microtime(true) + 3;
    while (microtime(true) < $deadline) {
        $fp = @fsockopen('127.0.0.1', $port, $errno, $err, 0.2);
        if (is_resource($fp)) {
            fclose($fp);
            return;
        }
        usleep(50000);
    }
}

/** @param resource $proc */
function kocoui_stop_server($proc, string $file): void
{
    proc_terminate($proc);
    proc_close($proc);
    @unlink($file);
    @unlink($file . '.log');
}
