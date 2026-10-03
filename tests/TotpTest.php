<?php
declare(strict_types=1);

use KocoUI\Auth\Totp;

return static function (): void {
    $secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    $vectors = [
        59 => '287082',
        1111111109 => '081804',
        1111111111 => '050471',
        1234567890 => '005924',
        2000000000 => '279037',
    ];
    foreach ($vectors as $time => $code) {
        TestCase::assertSame($code, Totp::code($secret, intdiv($time, 30)), "RFC 6238 at $time");
    }

    $a = Totp::generateSecret();
    $b = Totp::generateSecret();
    TestCase::assertSame(32, strlen($a), 'secret length');
    TestCase::assertTrue($a !== $b, 'secrets differ');
    $decode = new ReflectionMethod(Totp::class, 'base32Decode');
    TestCase::assertSame(20, strlen($decode->invoke(null, $a)), 'secret decodes to 20 bytes');

    $now = 1_700_000_000;
    $current = intdiv($now, 30);
    $step = Totp::verify($secret, Totp::code($secret, $current), 0, 1, $now);
    TestCase::assertSame($current, $step, 'current step accepted');
    TestCase::assertFalse(Totp::verify($secret, Totp::code($secret, $current), (int) $step, 1, $now), 'replay refused');
    TestCase::assertFalse(Totp::verify($secret, Totp::code($secret, $current + 1), 0, 1, $now), 'future step rejected');
    TestCase::assertSame($current - 1, Totp::verify($secret, Totp::code($secret, $current - 1), 0, 1, $now), 'previous step accepted');
    TestCase::assertFalse(Totp::verify($secret, '12345', 0, 1, $now), 'short code');
    TestCase::assertFalse(Totp::verify($secret, 'abcdef', 0, 1, $now), 'non-digits');
    TestCase::assertFalse(Totp::verify($secret, '012345', 0, 1, $now), 'wrong code');
    TestCase::assertFalse(Totp::verify($secret, Totp::code($secret, $current + 2), 0, 1, $now), 'outside window');

    foreach (['1', '0', '8', '9', '!'] as $bad) {
        TestCase::assertThrows(InvalidArgumentException::class, static fn () => $decode->invoke(null, $bad), "base32 $bad");
    }

    $uri = Totp::uri('Koco UI', 'alice', $secret);
    TestCase::assertTrue(str_starts_with($uri, 'otpauth://totp/'), 'uri scheme');
    foreach (['secret=', 'algorithm=SHA1', 'digits=6', 'period=30', 'Koco%20UI'] as $part) {
        TestCase::assertTrue(str_contains($uri, $part), "uri contains $part");
    }
};
