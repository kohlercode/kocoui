<?php
declare(strict_types=1);

use KocoUI\Auth\LoginThrottle;
use KocoUI\Db;
use KocoUI\Http\HttpError;

return static function (): void {
    $db = Db::pdo();
    $db->exec('DELETE FROM login_attempts');
    $throttle = new LoginThrottle($db, 5, 900);
    $ip = '203.0.113.20';
    $user = 'alice';
    for ($i = 0; $i < 5; $i++) {
        $throttle->record($ip, $user, false);
    }
    try {
        $throttle->check($ip, $user);
        TestCase::assertTrue(false, 'expected 429');
    } catch (HttpError $e) {
        TestCase::assertSame(429, $e->status, 'ip threshold');
        TestCase::assertTrue(($e->extra['retry_after'] ?? 0) > 0, 'retry_after');
    }

    $throttle->record($ip, $user, true);
    $throttle->check($ip, 'other');
    TestCase::assertTrue(true, 'success clears failures');

    $db->exec('DELETE FROM login_attempts');
    $name = 'bob';
    for ($i = 0; $i < 9; $i++) {
        $throttle->record('198.51.100.' . $i, $name, false);
    }
    $throttle->check('198.51.100.50', $name);
    TestCase::assertTrue(true, 'username allowance is twice the ip allowance');
    $throttle->record('198.51.100.50', $name, false);
    TestCase::assertThrows(HttpError::class, static function () use ($throttle, $name): void {
        $throttle->check('198.51.100.51', $name);
    }, 'username threshold');

    $db->exec('DELETE FROM login_attempts');
    $old = time() - 1000;
    $st = $db->prepare('INSERT INTO login_attempts (ip, username, ts, success) VALUES (?, ?, ?, 0)');
    for ($i = 0; $i < 6; $i++) {
        $st->execute(['203.0.113.8', 'carol', $old]);
    }
    $throttle->check('203.0.113.8', 'carol');
    TestCase::assertTrue(true, 'rows older than the window are ignored');
};
