<?php
declare(strict_types=1);

use KocoUI\Http\Csrf;
use KocoUI\Http\HttpError;
use KocoUI\Http\Request;
use KocoUI\Session;

return static function (): void {
    $token = Session::csrf();
    $check = static function (array $server) {
        Csrf::verify(Request::fake('POST', '/api/x', [], $server));
    };
    TestCase::assertThrows(HttpError::class, static function () use ($check, $token): void {
        $check(['HTTP_SEC_FETCH_SITE' => 'cross-site', 'HTTP_X_CSRF_TOKEN' => $token]);
    }, 'cross-site');
    try {
        $check(['HTTP_SEC_FETCH_SITE' => 'cross-site', 'HTTP_X_CSRF_TOKEN' => $token]);
    } catch (HttpError $e) {
        TestCase::assertSame(403, $e->status, 'cross-site status');
    }
    TestCase::assertThrows(HttpError::class, static function () use ($check, $token): void {
        $check(['HTTP_ORIGIN' => 'https://evil.example', 'HTTP_X_CSRF_TOKEN' => $token]);
    }, 'bad origin');
    TestCase::assertThrows(HttpError::class, static function () use ($check): void {
        $check(['HTTP_ORIGIN' => 'https://test.local']);
    }, 'missing token');
    TestCase::assertThrows(HttpError::class, static function () use ($check): void {
        $check(['HTTP_ORIGIN' => 'https://test.local', 'HTTP_X_CSRF_TOKEN' => 'nope']);
    }, 'wrong token');
    $check([
        'HTTP_SEC_FETCH_SITE' => 'same-origin',
        'HTTP_ORIGIN' => 'https://test.local',
        'HTTP_X_CSRF_TOKEN' => $token,
    ]);
    TestCase::assertTrue(true, 'valid token accepted');
};
