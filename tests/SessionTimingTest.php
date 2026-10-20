<?php
declare(strict_types=1);

use KocoUI\Session;

return static function (): void {
    // Avoid Session::login/reset: those regenerate the id and warn once any prior
    // test has echoed output. clientTiming only reads uid + login_at + config.
    $saved = $_SESSION;
    unset($_SESSION['uid'], $_SESSION['login_at']);

    TestCase::assertNull(Session::clientTiming(), 'logged out has no timing');

    $_SESSION['uid'] = 1;
    $_SESSION['login_at'] = 1_700_000_000;
    $t = Session::clientTiming();
    TestCase::assertSame(7200, $t['idle'] ?? null, 'default idle');
    TestCase::assertSame(43200, $t['absolute'] ?? null, 'default absolute');
    TestCase::assertSame(120, $t['warn'] ?? null, 'default warn');
    TestCase::assertSame(1_700_000_000, $t['login_at'] ?? null, 'login_at from session');

    kocoui_write_config(['security' => ['session_idle_warn' => 0]]);
    TestCase::assertSame(0, Session::clientTiming()['warn'] ?? null, 'warn 0 disables modal');

    kocoui_write_config(['security' => ['session_idle' => 60, 'session_idle_warn' => 120]]);
    TestCase::assertSame(6, Session::clientTiming()['warn'] ?? null, 'warn clamped below idle');

    kocoui_write_config();
    $_SESSION = $saved;
};
