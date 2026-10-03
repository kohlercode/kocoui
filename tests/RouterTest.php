<?php
declare(strict_types=1);

use KocoUI\Http\HttpError;
use KocoUI\Http\Router;

return static function (): void {
    $router = new Router();
    $router->add('GET', '/api/runs/{id}', static function (): void {
    });
    [, $params] = $router->match('GET', '/api/runs/abc-123');
    TestCase::assertSame('abc-123', $params['id'], 'placeholder');
    TestCase::assertThrows(HttpError::class, static function () use ($router): void {
        $router->match('GET', '/api/runs/a/b');
    }, 'extra segment');
    try {
        $router->match('GET', '/api/runs/a/b');
        TestCase::assertTrue(false, 'missing 404');
    } catch (HttpError $e) {
        TestCase::assertSame(404, $e->status, '404');
    }
    try {
        $router->match('POST', '/api/runs/abc-123');
        TestCase::assertTrue(false, 'missing 405');
    } catch (HttpError $e) {
        TestCase::assertSame(405, $e->status, '405');
    }
};
